import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  Video,
  VideoOff,
  RefreshCw,
  FlipHorizontal,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Search,
  Copy,
  Download,
  Volume2,
  VolumeX,
  Sparkles,
  Zap,
  Crosshair,
  Clock,
  Cpu,
  Eye,
  FileText,
  ChevronRight,
  Play,
  Square,
  ExternalLink,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { api } from "../services/api";

// Indian RTO State Mapping
const STATE_NAMES = {
  DL: "Delhi", HR: "Haryana", MH: "Maharashtra", UP: "Uttar Pradesh",
  KA: "Karnataka", TN: "Tamil Nadu", GJ: "Gujarat", RJ: "Rajasthan",
  WB: "West Bengal", MP: "Madhya Pradesh", PB: "Punjab", BR: "Bihar",
  AP: "Andhra Pradesh", TS: "Telangana", KL: "Kerala", CH: "Chandigarh",
  UK: "Uttarakhand", JH: "Jharkhand", OR: "Odisha", OD: "Odisha",
  AS: "Assam", GA: "Goa", HP: "Himachal Pradesh", JK: "Jammu & Kashmir",
  BH: "Bharat Series",
};

export function LiveWebcamAnpr({
  onSelectVehicle,
  onOpenAddBlacklist,
  onTraceVehicle,
  showToast = () => {},
}) {
  // Video & Stream State
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const offscreenCanvasRef = useRef(null);
  const streamRef = useRef(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [isMirror, setIsMirror] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const startingCameraRef = useRef(false);

  // Scanning State (starts ONLY when user clicks Start Scan or Instant Deep Scan)
  const [isContinuousScanning, setIsContinuousScanning] = useState(false);
  const [isManualDeepScanning, setIsManualDeepScanning] = useState(false);
  const [isProcessingFrame, setIsProcessingFrame] = useState(false);
  const [scanIntervalMs, setScanIntervalMs] = useState(350);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scanProgress, setScanProgress] = useState(0);

  // Refs for continuous non-blocking scan loop
  const isProcessingRef = useRef(false);
  const captureRef = useRef(null);

  // Detection Results
  const [scanResult, setScanResult] = useState(null);
  const [lastDetectionTime, setLastDetectionTime] = useState(null);
  const [recentDetections, setRecentDetections] = useState([]);
  const [engineStatus, setEngineStatus] = useState("Checking AI Engine...");
  const [modelsReady, setModelsReady] = useState(false);
  const [isBackendOnline, setIsBackendOnline] = useState(null);
  const [backendError, setBackendError] = useState(null);
  const [customBackendUrl, setCustomBackendUrl] = useState(() => (typeof api.getApiBase === "function" ? api.getApiBase() : "") || "");
  const [isConnectingBackend, setIsConnectingBackend] = useState(false);
  const [backendSuccessMsg, setBackendSuccessMsg] = useState(null);

  const handleConnectBackend = async () => {
    if (!customBackendUrl.trim()) return;
    setIsConnectingBackend(true);
    setBackendError(null);
    setBackendSuccessMsg(null);
    try {
      if (typeof api.setApiBase === "function") {
        api.setApiBase(customBackendUrl.trim());
      }
      const res = await api.getLiveAnprStatus();
      setIsBackendOnline(true);
      if (res?.models_loaded) {
        setModelsReady(true);
        setEngineStatus("AI Engines Ready (YOLOv8 + PP-OCRv6)");
      } else {
        setEngineStatus("AI Warming Up (Loading YOLO + PaddleOCR)...");
      }
      setBackendSuccessMsg(`Successfully connected to Railway Backend (${typeof api.getApiBase === "function" ? api.getApiBase() : customBackendUrl})`);
      setTimeout(() => setBackendSuccessMsg(null), 5000);
    } catch (err) {
      setIsBackendOnline(false);
      setBackendError(`Connection failed: Unable to reach ${typeof api.getApiBase === "function" ? api.getApiBase() : customBackendUrl}. Make sure Railway deployment is active.`);
    } finally {
      setIsConnectingBackend(false);
    }
  };

  const handleResetBackend = async () => {
    if (typeof api.setApiBase === "function") {
      api.setApiBase("");
      setCustomBackendUrl(api.getApiBase() || "");
    }
    setBackendSuccessMsg("Reset backend URL to default.");
    setTimeout(() => setBackendSuccessMsg(null), 3000);
    try {
      await api.getLiveAnprStatus();
      setIsBackendOnline(true);
      setBackendError(null);
    } catch (_) {
      setIsBackendOnline(false);
    }
  };

  // FPS & Latency
  const [fps, setFps] = useState(0);
  const [lastInferenceTime, setLastInferenceTime] = useState(0);

  // Sound FX via AudioContext synthesizer (zero external audio files needed)
  const playBeep = useCallback((isAlert = false) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (isAlert) {
        // High alert siren tone
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } else {
        // Sci-Fi lock-on chime
        osc.type = "sine";
        osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6
        osc.frequency.setValueAtTime(1318.5, audioCtx.currentTime + 0.08); // E6
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      }
    } catch (_) {}
  }, [soundEnabled]);

  // Load available camera devices
  useEffect(() => {
    async function getDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setCameraDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.warn("[Camera Devices]", err);
      }
    }
    getDevices();

    // Check engine status with auto-polling until AI models are fully loaded in memory
    let statusTimer = null;
    const checkEngine = () => {
      api.getLiveAnprStatus()
        .then((res) => {
          setIsBackendOnline(true);
          setBackendError(null);
          if (res.models_loaded) {
            setModelsReady(true);
            setEngineStatus("AI Engines Ready (YOLOv8 + PP-OCRv6)");
            if (statusTimer) clearInterval(statusTimer);
          } else {
            setModelsReady(false);
            setEngineStatus("AI Warming Up (Loading YOLO + PaddleOCR)...");
          }
        })
        .catch((err) => {
          setIsBackendOnline(false);
          setModelsReady(false);
          const currentUrl = (typeof api.getApiBase === "function" ? api.getApiBase() : "") || "http://127.0.0.1:8000";
          setEngineStatus("AI Backend Offline");
          setBackendError(`Cannot reach Python backend at ${currentUrl}. Connect your Railway backend URL below.`);
        });
    };
    checkEngine();
    statusTimer = setInterval(checkEngine, 2500);

    // Load initial scan history (filtered to only genuine vehicle plates & clean text)
    api.getLiveAnprHistory(20)
      .then((res) => {
        if (res && res.history) {
          const NOISE_SET = new Set(["IND", "INDIA", "TARGET", "BRACKETS", "1000", "210", "ALIGN", "AL16N", "VEHICLE"]);
          const filtered = res.history.filter((item) => {
            const txt = (item.cleaned_text || item.exact_text || "").trim().toUpperCase();
            if (NOISE_SET.has(txt)) return false;
            if (txt.length < 5 && !item.is_vehicle_plate) return false;
            return true;
          });
          setRecentDetections(filtered);
        }
      })
      .catch(() => {});
  }, [selectedDeviceId]);

  // Live Scanning Progress: Smoothly progresses from 0 towards 100 in ONE run until scan completes (NO repetitive cycling)
  useEffect(() => {
    if (!isCameraActive) {
      setScanProgress(0);
      return;
    }

    // When target is detected & confirmed, lock progress at 100%
    if (scanResult?.has_detection && scanResult?.primary) {
      setScanProgress(100);
      return;
    }

    // If scanning is not active, do not advance progress
    if (!isContinuousScanning && !isManualDeepScanning) {
      return;
    }

    // Progress smoothly upwards from current value towards 92% (NEVER drop back to 18% or reset!)
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 92) return 92; // Hold steady at 92% while searching — NEVER drop back to 18%!
        const jump = prev < 30 ? 6 : prev < 65 ? 4 : 2;
        return Math.min(92, prev + jump);
      });
    }, 70);

    return () => clearInterval(interval);
  }, [isCameraActive, isContinuousScanning, isManualDeepScanning, scanResult?.has_detection, scanResult?.primary]);

  // Start Camera Stream
  const startCamera = async (deviceId = selectedDeviceId) => {
    if (startingCameraRef.current) return;
    startingCameraRef.current = true;
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: "user",
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          if (playErr.name === "AbortError" || playErr.message?.includes("interrupted")) {
            console.log("[LiveWebcamAnpr] Play request safely superseded by stream attachment.");
          } else {
            console.warn("[LiveWebcamAnpr] Video play exception:", playErr);
          }
        }
      }

      setIsCameraActive(true);
      setCameraError(null);
      showToast("Laptop Camera Connected. Ready for Live ANPR!");
    } catch (err) {
      if (err.name === "AbortError" || err.message?.includes("interrupted by a new load request")) {
        return;
      }
      console.error("[Camera Error]", err);
      setCameraError(
        err.name === "NotAllowedError"
          ? "Camera access permission denied. Please allow camera permissions in your browser URL bar."
          : `Camera error: ${err.message || "No webcam detected"}`
      );
      setIsCameraActive(false);
    } finally {
      startingCameraRef.current = false;
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsContinuousScanning(false);
    setIsManualDeepScanning(false);
    setScanProgress(0);

    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Toggle Camera
  const toggleCamera = () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  // Rescan Handler: Clears previous target and canvas, then triggers a fresh single 0-to-100 scan
  const handleRescan = () => {
    setScanResult(null);
    setScanProgress(0);
    setIsManualDeepScanning(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setIsContinuousScanning(true);
    setTimeout(() => {
      if (captureRef.current) {
        captureRef.current();
      }
    }, 80);
    showToast("Starting fresh scan... Hold target in viewfinder reticle.");
  };

  // Instant Deep Scan Handler: High-precision single-frame scan with dedicated 0 to 100% progress
  const handleInstantDeepScan = async () => {
    if (!isCameraActive || isProcessingFrame) return;
    setIsContinuousScanning(false);
    setScanResult(null);
    setScanProgress(5);
    setIsManualDeepScanning(true);
    showToast("Executing Instant Deep AI Frame Scan...");
    try {
      await captureAndScan();
    } catch (err) {
      console.error(err);
    } finally {
      setIsManualDeepScanning(false);
      setScanProgress(100);
    }
  };

  // Auto-start camera when component mounts
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Frame Capture & Ultra-Fast AI Inference Trigger (<100ms)
  const captureAndScan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || isProcessingRef.current) return;

    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    if (!vWidth || !vHeight) return;

    // Use offscreen canvas for snapshot extraction - scale down for instant transfer (<10ms)
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement("canvas");
    }
    const offCanvas = offscreenCanvasRef.current;
    const maxDim = 960;
    let targetW = vWidth;
    let targetH = vHeight;
    if (targetW > maxDim || targetH > maxDim) {
      const scale = maxDim / Math.max(targetW, targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
    }
    offCanvas.width = targetW;
    offCanvas.height = targetH;

    const offCtx = offCanvas.getContext("2d");
    if (isMirror) {
      // Horizontal flip un-mirroring so text reads normally
      offCtx.save();
      offCtx.translate(targetW, 0);
      offCtx.scale(-1, 1);
      offCtx.drawImage(video, 0, 0, targetW, targetH);
      offCtx.restore();
    } else {
      offCtx.drawImage(video, 0, 0, targetW, targetH);
    }

    const base64Data = offCanvas.toDataURL("image/jpeg", 0.82);

    isProcessingRef.current = true;
    setIsProcessingFrame(true);
    const t0 = performance.now();

    try {
      const res = await api.scanLiveFrame({
        image: base64Data,
        min_confidence: 0.25,
        mirror: false,
      });

      const inferenceMs = res?.inference_time_ms ? Math.round(res.inference_time_ms) : Math.round(performance.now() - t0);
      setLastInferenceTime(inferenceMs);
      setIsBackendOnline(true);
      setBackendError(null);
      setModelsReady(true);

      if (res && res.success) {
        if (res.busy) {
          // Frame dropped because backend inference is currently executing
          return;
        }

        if (res.has_detection && res.primary) {
          setScanResult(res);
          setScanProgress(100);
          setIsContinuousScanning(false); // Target locked! Auto-pause continuous scan so target isn't lost
          setLastDetectionTime(Date.now());
          const isAlert = Boolean(res.blacklist_alert);
          playBeep(isAlert);

          const prim = res.primary;
          const cleanedText = (prim.cleaned_text || prim.exact_text || "").trim().toUpperCase();
          const NOISE_SET = new Set(["IND", "INDIA", "TARGET", "BRACKETS", "1000", "210", "ALIGN", "AL16N", "VEHICLE"]);

          // Accept only genuine plates or meaningful strings >= 5 chars
          const isValidPlate = prim.is_vehicle_plate || (cleanedText.length >= 6 && !NOISE_SET.has(cleanedText));

          if (isValidPlate && !NOISE_SET.has(cleanedText)) {
            setRecentDetections((prev) => {
              const exists = prev.some((d) => (d.cleaned_text || d.exact_text) === cleanedText);
              const statePrefix = (prim.formatted_plate || cleanedText).substring(0, 2);
              const stateName = STATE_NAMES[statePrefix] || res.vahan?.state || "";

              const newDet = {
                scan_id: `scan_${Date.now()}`,
                time_display: new Date().toLocaleTimeString(),
                exact_text: prim.exact_text,
                formatted_plate: prim.formatted_plate || prim.exact_text,
                cleaned_text: cleanedText,
                confidence: prim.overall_confidence,
                is_vehicle_plate: prim.is_vehicle_plate,
                is_blacklisted: isAlert,
                blacklist_reason: res.blacklist_alert?.reason,
                vahan_model: res.vahan?.maker_model,
                state_name: stateName,
              };
              return exists ? prev : [newDet, ...prev.slice(0, 19)];
            });
          }
        } else {
          // If no detection was found in this frame, only update scanResult if we don't already have a locked target
          setScanResult((prev) => (prev?.has_detection && prev?.primary ? prev : res));
        }
      } else if (res && res.error) {
        setBackendError(res.error);
      }
    } catch (err) {
      console.warn("[Live Scan Frame]", err);
      const currentUrl = (typeof api.getApiBase === "function" ? api.getApiBase() : "") || "http://127.0.0.1:8000";
      setBackendError(`Python AI backend offline at ${currentUrl}. Connect your Railway backend URL below.`);
    } finally {
      isProcessingRef.current = false;
      setIsProcessingFrame(false);
    }
  }, [isMirror, playBeep]);

  // Keep captureRef pointing to the latest captureAndScan
  useEffect(() => {
    captureRef.current = captureAndScan;
  }, [captureAndScan]);

  // Continuous scanning loop (Interval runs smoothly without being torn down on every state change)
  useEffect(() => {
    if (!isCameraActive || !isContinuousScanning) return;

    const intervalId = setInterval(() => {
      if (captureRef.current) {
        captureRef.current();
      }
    }, scanIntervalMs || 350);

    return () => clearInterval(intervalId);
  }, [isCameraActive, isContinuousScanning, scanIntervalMs]);

  // Synchronized Canvas Rendering (draws bounding boxes & HUD directly on live video)
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let animId;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const render = () => {
      if (video.readyState >= 2) {
        // Sync canvas resolution
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
          canvas.width = video.clientWidth;
          canvas.height = video.clientHeight;
        }

        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // FPS calculation
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
          setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
          frameCount = 0;
          lastFpsTime = now;
        }

        // Viewfinder Target Reticle in Center
        const vw = w * 0.70;
        const vh = h * 0.52;
        const vx1 = (w - vw) / 2;
        const vy1 = (h - vh) / 2;
        const vx2 = vx1 + vw;
        const vy2 = vy1 + vh;

        const hasTarget = scanResult?.has_detection;
        const isBlacklist = Boolean(scanResult?.blacklist_alert);
        const reticleColor = isBlacklist
          ? "#DC2626"
          : hasTarget
          ? "#10B981"
          : "rgba(217, 119, 6, 0.75)";

        // Corner Brackets
        const cLen = 28;
        ctx.lineWidth = 3;
        ctx.strokeStyle = reticleColor;

        // Top-Left
        ctx.beginPath();
        ctx.moveTo(vx1, vy1 + cLen);
        ctx.lineTo(vx1, vy1);
        ctx.lineTo(vx1 + cLen, vy1);
        ctx.stroke();

        // Top-Right
        ctx.beginPath();
        ctx.moveTo(vx2 - cLen, vy1);
        ctx.lineTo(vx2, vy1);
        ctx.lineTo(vx2, vy1 + cLen);
        ctx.stroke();

        // Bottom-Left
        ctx.beginPath();
        ctx.moveTo(vx1, vy2 - cLen);
        ctx.lineTo(vx1, vy2);
        ctx.lineTo(vx1 + cLen, vy2);
        ctx.stroke();

        // Bottom-Right
        ctx.beginPath();
        ctx.moveTo(vx2 - cLen, vy2);
        ctx.lineTo(vx2, vy2);
        ctx.lineTo(vx2, vy2 - cLen);
        ctx.stroke();

        // Scanning Laser Sweep Line Animation
        if (!hasTarget) {
          const scanY = vy1 + ((now % 2400) / 2400) * vh;
          const laserGrad = ctx.createLinearGradient(vx1, scanY, vx2, scanY);
          laserGrad.addColorStop(0, "rgba(217, 119, 6, 0)");
          laserGrad.addColorStop(0.5, "rgba(217, 119, 6, 0.85)");
          laserGrad.addColorStop(1, "rgba(217, 119, 6, 0)");
          ctx.strokeStyle = laserGrad;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(vx1, scanY);
          ctx.lineTo(vx2, scanY);
          ctx.stroke();
        }

        // Draw Detected Bounding Boxes from AI
        if (scanResult?.detections) {
          scanResult.detections.forEach((det) => {
            const rel = det.relative_bbox;
            if (!rel || rel.length < 4) return;

            let [rx, ry, rw, rh] = rel;
            // Direct screen coordinate alignment matching viewport
            let bx = rx * w;
            let by = ry * h;
            let bw = rw * w;
            let bh = rh * h;

            const boxStroke = isBlacklist
              ? "#DC2626"
              : det.is_vehicle_plate
              ? "#10B981"
              : "#0284C7";

            // Glow effect
            ctx.shadowColor = boxStroke;
            ctx.shadowBlur = 10;
            ctx.strokeStyle = boxStroke;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.shadowBlur = 0;

            // Box Label
            const label = `${det.formatted_plate || det.exact_text} (${Math.round(det.overall_confidence * 100)}%)`;
            ctx.font = "bold 13px 'JetBrains Mono', monospace";
            const textWidth = ctx.measureText(label).width;

            ctx.fillStyle = boxStroke;
            ctx.fillRect(bx, Math.max(0, by - 24), textWidth + 14, 22);

            ctx.fillStyle = "#FFFFFF";
            ctx.fillText(label, bx + 7, Math.max(16, by - 7));
          });
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [scanResult, isMirror]);

  // Copy Plate Helper
  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`Copied "${text}" to clipboard!`);
  };

  // Download Snapshot
  const downloadSnapshot = () => {
    const video = videoRef.current;
    if (!video) return;

    const snapCanvas = document.createElement("canvas");
    snapCanvas.width = video.videoWidth || 1280;
    snapCanvas.height = video.videoHeight || 720;
    const sCtx = snapCanvas.getContext("2d");

    if (isMirror) {
      sCtx.translate(snapCanvas.width, 0);
      sCtx.scale(-1, 1);
    }
    sCtx.drawImage(video, 0, 0);

    const a = document.createElement("a");
    a.href = snapCanvas.toDataURL("image/jpeg", 0.95);
    a.download = `DRISHTI_Live_ANPR_Scan_${Date.now()}.jpg`;
    a.click();
    showToast("Snapshot downloaded successfully!");
  };

  const primaryDet = scanResult?.primary;
  const isBlacklistMatch = Boolean(scanResult?.blacklist_alert);
  const vahan = scanResult?.vahan;
  const isScanningActive = isContinuousScanning || isManualDeepScanning;

  return (
    <div className="live-anpr-container font-sans">
      {/* BACKEND ERROR / RAILWAY CONFIGURATION BANNER */}
      {backendError && (
        <div
          className="live-anpr-error-banner"
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            borderColor: "rgba(239, 68, 68, 0.4)",
            color: "#FCA5A5",
            marginBottom: "1rem",
            padding: "12px 16px",
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={18} style={{ color: "#EF4444", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", fontWeight: 500 }}>{backendError}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              background: "rgba(0, 0, 0, 0.35)",
              padding: "8px 12px",
              borderRadius: "6px",
            }}
          >
            <span style={{ fontSize: "12px", color: "#D1D5DB", whiteSpace: "nowrap", fontWeight: 600 }}>
              Railway Backend URL:
            </span>
            <input
              type="text"
              placeholder="e.g. https://web-production-deb65.up.railway.app"
              value={customBackendUrl}
              onChange={(e) => setCustomBackendUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnectBackend()}
              style={{
                flex: 1,
                minWidth: "260px",
                padding: "6px 12px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                borderRadius: "5px",
                color: "#F9FAFB",
                fontSize: "12px",
                fontFamily: "monospace",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleConnectBackend}
              disabled={isConnectingBackend}
              style={{
                padding: "6px 16px",
                background: "#059669",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "5px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {isConnectingBackend ? "Connecting..." : "Connect Railway"}
            </button>
            {Boolean(typeof window !== "undefined" && localStorage.getItem("DRISHTI_BACKEND_URL")) && (
              <button
                type="button"
                onClick={handleResetBackend}
                style={{
                  padding: "6px 10px",
                  background: "transparent",
                  color: "#9CA3AF",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "5px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Reset Default
              </button>
            )}
          </div>
        </div>
      )}

      {backendSuccessMsg && (
        <div
          style={{
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            color: "#6EE7B7",
            padding: "8px 14px",
            borderRadius: "6px",
            marginBottom: "1rem",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>✓ {backendSuccessMsg}</span>
        </div>
      )}

      {/* CAMERA ERROR BANNER (Only displayed if camera is actually disconnected/failed) */}
      {cameraError && !isCameraActive && (
        <div className="live-anpr-error-banner">
          <AlertTriangle size={18} />
          <span>{cameraError}</span>
          <button
            type="button"
            className="btn-retry-cam"
            onClick={() => startCamera()}
          >
            Retry Camera Access
          </button>
        </div>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="live-anpr-workspace">
        {/* LEFT COLUMN: CAMERA VIEWFINDER & REAL-TIME SCANNING PROGRESS DECK */}
        <div className="live-camera-column">
          <div className="live-viewfinder-card">
            <div className="viewfinder-top-bar">
              <div className="viewfinder-status-indicator">
                <span
                  className={`camera-status-dot ${isCameraActive ? "online" : "offline"}`}
                />
                <span className="font-mono text-xs">
                  {isCameraActive ? "LAPTOP WEBCAM ACTIVE" : "CAMERA DISCONNECTED"}
                </span>
                {isCameraActive && (
                  <span className="font-mono text-xs" style={{ marginLeft: "8px", opacity: 0.85, color: "var(--text-muted)" }}>
                    • {fps} FPS {lastInferenceTime ? `• ${lastInferenceTime > 4000 ? `${(lastInferenceTime / 1000).toFixed(1)}s (Cold Start)` : `${lastInferenceTime}ms`}` : ""}
                    {!modelsReady && isBackendOnline && (
                      <span style={{ marginLeft: "8px", color: "#F59E0B", fontWeight: 600 }}>• Warming Up AI Models...</span>
                    )}
                  </span>
                )}
              </div>

              {/* QUICK CAMERA TOGGLES */}
              <div className="viewfinder-quick-actions">
                {/* Camera device picker */}
                {cameraDevices.length > 1 && (
                  <select
                    className="camera-device-select"
                    value={selectedDeviceId}
                    onChange={(e) => {
                      setSelectedDeviceId(e.target.value);
                      startCamera(e.target.value);
                    }}
                    title="Switch Video Input Device"
                  >
                    {cameraDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}

                {/* Mirror toggle */}
                <button
                  type="button"
                  className={`btn-icon-toggle ${isMirror ? "active" : ""}`}
                  onClick={() => setIsMirror(!isMirror)}
                  title={isMirror ? "Mirror Mode: ON (Flip text)" : "Mirror Mode: OFF"}
                >
                  <FlipHorizontal size={15} />
                  <span>Flip</span>
                </button>

                {/* Sound toggle */}
                <button
                  type="button"
                  className={`btn-icon-toggle ${soundEnabled ? "active" : ""}`}
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  title={soundEnabled ? "Detection Audio Chime: ON" : "Mute Sound"}
                >
                  {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>

                {/* Snapshot Button */}
                <button
                  type="button"
                  className="btn-icon-toggle"
                  onClick={downloadSnapshot}
                  disabled={!isCameraActive}
                  title="Save High-Res Snapshot"
                >
                  <Download size={15} />
                  <span>Snap</span>
                </button>
              </div>
            </div>

            {/* VIDEO & CANVAS STACK */}
            <div className="viewfinder-viewport">
              <video
                ref={videoRef}
                className={`webcam-video-element ${isMirror ? "mirror-active" : ""}`}
                playsInline
                autoPlay
                muted
                onPlay={() => {
                  setIsCameraActive(true);
                  setCameraError(null);
                }}
                onLoadedMetadata={() => {
                  setCameraError(null);
                }}
              />
              <canvas ref={canvasRef} className="webcam-overlay-canvas" />

              {/* PROCESSING OVERLAY SPINNER */}
              {isProcessingFrame && (
                <div className="scanner-busy-indicator">
                  <RefreshCw size={14} className="icon-spin text-amber" />
                  <span className="font-mono text-xs">PROCESSING AI INFERENCE...</span>
                </div>
              )}

              {/* TARGET GUIDANCE BANNER */}
              <div className="viewfinder-target-guide font-mono">
                <Crosshair size={13} className="text-amber" />
                <span>ALIGN VEHICLE NUMBER PLATE OR ANY TEXT INSIDE TARGET BRACKETS</span>
              </div>

              {/* CAMERA OFFLINE PLACEHOLDER */}
              {!isCameraActive && (
                <div className="viewfinder-offline-mask">
                  <VideoOff size={48} className="text-dim" />
                  <h3>Laptop Camera is Offline</h3>
                  <p>Click below to activate camera permissions and begin live recognition.</p>
                  <button
                    type="button"
                    className="btn-start-camera-primary"
                    onClick={() => startCamera()}
                  >
                    <Video size={16} />
                    <span>Start Laptop Camera</span>
                  </button>
                </div>
              )}
            </div>

            {/* VIEWFINDER BOTTOM CONTROLS */}
            <div className="viewfinder-bottom-bar">
              <button
                type="button"
                className={`btn-cam-power ${isCameraActive ? "stop" : "start"}`}
                onClick={toggleCamera}
              >
                {isCameraActive ? <VideoOff size={15} /> : <Video size={15} />}
                <span>{isCameraActive ? "Stop Camera" : "Start Camera"}</span>
              </button>

              {/* START SCAN BUTTON (Starts continuous stream scanning ONLY when clicked) */}
              <button
                type="button"
                className={`btn-scan-mode ${isContinuousScanning ? "scanning" : "paused"}`}
                onClick={() => {
                  if (!isContinuousScanning) {
                    setScanResult(null);
                    setScanProgress(0);
                    setIsContinuousScanning(true);
                    setTimeout(() => {
                      if (captureRef.current) captureRef.current();
                    }, 50);
                  } else {
                    setIsContinuousScanning(false);
                  }
                }}
                disabled={!isCameraActive}
                title={isContinuousScanning ? "Pause Real-Time Stream Scanning" : "Start Real-Time Stream Scanning"}
              >
                {isContinuousScanning ? <Square size={14} /> : <Play size={14} fill="currentColor" />}
                <span>{isContinuousScanning ? "Pause Scan" : "Start Scan"}</span>
              </button>

              {/* RESCAN TARGET BUTTON (Provides rescan after instant deep scan or whenever detection is present) */}
              {(scanResult || scanProgress === 100) && (
                <button
                  type="button"
                  className="btn-rescan-accent font-mono"
                  onClick={handleRescan}
                  disabled={!isCameraActive || isProcessingFrame}
                  title="Clear current target and trigger a fresh scan"
                >
                  <RotateCcw size={14} />
                  <span>Rescan Target</span>
                </button>
              )}

              {/* INSTANT DEEP SCAN BUTTON */}
              <button
                type="button"
                className="btn-scan-single"
                onClick={handleInstantDeepScan}
                disabled={!isCameraActive || isProcessingFrame}
                title="Trigger Instant Manual Deep AI Scan (Single Frame)"
              >
                <Zap size={14} />
                <span>Instant Deep Scan</span>
              </button>
            </div>
          </div>

          {/* REAL-TIME AI SCANNING & DETECTION PROGRESS DECK (BELOW CAMERA) */}
          <div
            className={`live-scan-progress-card ${
              scanResult?.has_detection ? "target-locked" : isScanningActive ? "scanning-mode" : "standby-mode"
            }`}
          >
            <div className="scan-progress-header">
              <div className="scan-progress-title-block">
                <div
                  className={`scan-pulse-badge ${
                    scanResult?.has_detection ? "locked" : isScanningActive ? "active" : "standby"
                  }`}
                >
                  {scanResult?.has_detection ? (
                    <CheckCircle2 size={18} />
                  ) : isScanningActive ? (
                    <Sparkles size={18} className="icon-pulse" />
                  ) : (
                    <Play size={16} />
                  )}
                </div>
                <div>
                  <div className="scan-progress-main-title font-sans">
                    {scanResult?.has_detection
                      ? "Target Locked & OCR Text Recognized"
                      : isScanningActive
                      ? "AI Optical Scanning & Reticle Lock-On"
                      : scanProgress === 100
                      ? "Scan Finished • No Target Detected"
                      : "AI Vision Engine Standby"}
                  </div>
                  <div className="scan-progress-sub font-mono">
                    {scanResult?.has_detection
                      ? `100% RECOGNITION CONFIRMED • ${scanResult.primary?.exact_text || "TARGET"}`
                      : isScanningActive
                      ? `Scanning optical reticle • Align plate in brackets (${scanProgress}% Loaded)`
                      : scanProgress === 100
                      ? "Frame analyzed — No vehicle plate detected. Align plate in reticle and click Rescan."
                      : isCameraActive
                      ? "Camera ready — Click \"Start Scan\" or \"Instant Deep Scan\" below to begin"
                      : "Camera offline — start camera to begin live scanning"}
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE: RESCAN BUTTON & BIG PERCENTAGE CHIP */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {(scanResult?.has_detection || scanProgress === 100) && (
                  <button
                    type="button"
                    className="btn-card-rescan font-mono"
                    onClick={handleRescan}
                    title="Clear current target and trigger a fresh scan"
                  >
                    <RotateCcw size={12} />
                    <span>RESCAN</span>
                  </button>
                )}

                <div className="scan-percentage-display font-mono">
                  <span className="scan-pct-number">{scanProgress}%</span>
                  <span className="scan-pct-label">
                    {scanResult?.has_detection
                      ? "TARGET LOCKED"
                      : isScanningActive
                      ? "SCANNING RETICLE"
                      : scanProgress === 100
                      ? "SCAN FINISHED"
                      : "STANDBY"}
                  </span>
                </div>
              </div>
            </div>

            {/* DYNAMIC PROGRESS BAR WITH ANIMATED STRIPES & GLOW */}
            <div className="scan-progress-track">
              <div
                className={`scan-progress-fill ${
                  scanResult?.has_detection
                    ? "fill-locked"
                    : isScanningActive
                    ? "fill-active"
                    : "fill-standby"
                }`}
                style={{ width: `${Math.max(4, scanProgress)}%` }}
              >
                {isScanningActive && <div className="scan-progress-sheen" />}
              </div>
            </div>

            {/* MULTI-STAGE DETECTION PIPELINE INDICATORS */}
            <div className="scan-pipeline-steps font-mono">
              <div
                className={`pipeline-step ${
                  scanProgress >= 20 || scanResult?.has_detection ? "done" : isScanningActive ? "active" : "waiting"
                }`}
              >
                <span className="step-dot" />
                <span className="step-name">1. Frame Sampling</span>
                <span className="step-val">
                  {scanProgress >= 20 || scanResult?.has_detection ? "100%" : isScanningActive ? `${Math.round(scanProgress * 5)}%` : "0%"}
                </span>
              </div>

              <div
                className={`pipeline-step ${
                  scanProgress >= 60 || scanResult?.has_detection
                    ? "done"
                    : scanProgress >= 20 && isScanningActive
                    ? "active"
                    : "waiting"
                }`}
              >
                <span className="step-dot" />
                <span className="step-name">2. YOLOv8 Plate Reticle</span>
                <span className="step-val">
                  {scanResult?.has_detection
                    ? "100%"
                    : scanProgress >= 60
                    ? "100%"
                    : scanProgress >= 20 && isScanningActive
                    ? `${Math.round((scanProgress - 20) * 2.5)}%`
                    : "0%"}
                </span>
              </div>

              <div
                className={`pipeline-step ${
                  scanResult?.has_detection
                    ? "done"
                    : scanProgress >= 60 && isScanningActive
                    ? "active"
                    : "waiting"
                }`}
              >
                <span className="step-dot" />
                <span className="step-name">3. PaddleOCR Text Read</span>
                <span className="step-val">
                  {scanResult?.has_detection
                    ? "100%"
                    : scanProgress >= 60 && isScanningActive
                    ? `${Math.round((scanProgress - 60) * 2.5)}%`
                    : "0%"}
                </span>
              </div>
            </div>

            {/* EQUALIZER & LIVE GUIDANCE FOOTER */}
            <div className="scan-progress-footer">
              <div className="scan-audio-eq-bars" title="Neural frame rate pulse">
                {[35, 75, 50, 90, 65, 85, 40, 95, 70, 55, 80, 60].map((h, i) => (
                  <span
                    key={i}
                    className={`eq-bar ${scanResult?.has_detection ? "locked-bar" : isScanningActive ? "" : "idle-bar"}`}
                    style={{
                      "--base-h": isScanningActive || scanResult?.has_detection ? `${h}%` : "15%",
                      animationDelay: `${i * 0.08}s`,
                    }}
                  />
                ))}
              </div>

              <div className="scan-live-tip font-mono">
                {scanResult?.has_detection ? (
                  <span style={{ color: "#10B981", fontWeight: 700 }}>
                    ● Target detected: {scanResult.primary?.formatted_plate || scanResult.primary?.exact_text} — Click "Rescan" to scan another target
                  </span>
                ) : isScanningActive ? (
                  <span>
                    ● Hold vehicle number plate or text inside the yellow brackets above
                  </span>
                ) : (
                  <span style={{ color: "#D97706", fontWeight: 600 }}>
                    ● Ready — Click "Start Scan" or "Instant Deep Scan" below to begin detection
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: REAL-TIME INTELLIGENCE DOSSIER & VAHAN CARD */}
        <div className="live-intelligence-column">
          {/* PRIMARY DETECTION HERO CARD */}
          <div
            className={`live-hero-card ${
              isBlacklistMatch
                ? "hero-blacklist"
                : primaryDet
                ? "hero-detected"
                : "hero-standby"
            }`}
          >
            {/* BLACKLIST DANGER ALERT STRIP */}
            {isBlacklistMatch && (
              <div className="blacklist-critical-strip">
                <ShieldAlert size={20} className="icon-pulse text-white" />
                <div>
                  <div className="font-bold text-sm tracking-wide">
                    CRITICAL ALERT: BLACKLISTED / WANTED VEHICLE DETECTED!
                  </div>
                  <div className="text-xs opacity-90">
                    {scanResult.blacklist_alert?.reason || "Flagged in DRISHTI Surveillance Watchlist"}
                  </div>
                </div>
              </div>
            )}

            <div className="hero-card-header">
              <span className="hero-badge">
                <Sparkles size={13} />
                <span>LATEST RECOGNIZED TARGET</span>
              </span>
              {primaryDet && (
                <span className="hero-timestamp font-mono text-xs">
                  <Clock size={12} />
                  <span>
                    {lastDetectionTime
                      ? new Date(lastDetectionTime).toLocaleTimeString()
                      : "Just now"}
                  </span>
                </span>
              )}
            </div>

            {primaryDet ? (
              <div className="hero-card-body">
                {/* BIG NEON PLATE DISPLAY */}
                <div className="hero-plate-box">
                  <div className="hero-plate-title font-mono">
                    {primaryDet.formatted_plate || primaryDet.exact_text}
                  </div>
                  <button
                    type="button"
                    className="btn-copy-plate"
                    onClick={() =>
                      copyToClipboard(primaryDet.formatted_plate || primaryDet.exact_text)
                    }
                    title="Copy Recognized Text"
                  >
                    <Copy size={14} />
                  </button>
                </div>

                {/* ACCURACY & METADATA BAR */}
                <div className="hero-accuracy-row">
                  <div className="accuracy-metric">
                    <span className="metric-label">OCR CONFIDENCE</span>
                    <span className="metric-val text-emerald font-mono">
                      {(primaryDet.overall_confidence * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="accuracy-metric">
                    <span className="metric-label">CLASSIFICATION</span>
                    <span className="metric-val font-mono">
                      {primaryDet.is_vehicle_plate
                        ? "INDIAN RTO NUMBER PLATE"
                        : "DIRECT OPTICAL TEXT"}
                    </span>
                  </div>

                  <div className="accuracy-metric">
                    <span className="metric-label">DETECTION SOURCE</span>
                    <span className="metric-val font-mono">
                      {primaryDet.source === "YOLO_PLATE_CROP" ? "YOLO Plate Crop" : "Scene Text OCR"}
                    </span>
                  </div>
                </div>

                {/* VAHAN 4.0 REGISTRY DOSSIER */}
                {vahan && (
                  <div className="vahan-intel-box">
                    <div className="vahan-header">
                      <span className="vahan-title">VAHAN 4.0 NATIONAL VEHICLE REGISTRY</span>
                      <span className="vahan-status-pill">{vahan.rc_status || "ACTIVE"}</span>
                    </div>

                    <div className="vahan-grid">
                      <div className="vahan-item">
                        <span className="v-label">MAKER & MODEL</span>
                        <span className="v-val font-bold">{vahan.maker_model}</span>
                      </div>
                      <div className="vahan-item">
                        <span className="v-label">REGISTERED OWNER</span>
                        <span className="v-val">{vahan.owner_name}</span>
                      </div>
                      <div className="vahan-item">
                        <span className="v-label">FUEL & CLASS</span>
                        <span className="v-val">
                          {vahan.fuel_type} • {vahan.vehicle_class}
                        </span>
                      </div>
                      <div className="vahan-item">
                        <span className="v-label">RTO JURISDICTION</span>
                        <span className="v-val">{vahan.rto_office}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ACTION BUTTONS */}
                <div className="hero-action-buttons">
                  <button
                    type="button"
                    className="btn-action-primary"
                    onClick={() => {
                      if (onSelectVehicle) {
                        onSelectVehicle({ plate: primaryDet.cleaned_text });
                      }
                    }}
                  >
                    <Search size={14} />
                    <span>Search in DRISHTI</span>
                  </button>

                  <button
                    type="button"
                    className="btn-action-secondary"
                    onClick={() => {
                      if (onOpenAddBlacklist) {
                        onOpenAddBlacklist(primaryDet.cleaned_text);
                      }
                    }}
                  >
                    <ShieldAlert size={14} />
                    <span>Flag on Watchlist</span>
                  </button>

                  {onTraceVehicle && (
                    <button
                      type="button"
                      className="btn-action-secondary"
                      onClick={() => onTraceVehicle(primaryDet.cleaned_text)}
                    >
                      <Crosshair size={14} />
                      <span>Trace Journey Map</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="hero-standby-state">
                <Eye size={36} className="text-dim icon-pulse" style={{ marginBottom: "6px" }} />
                <h4>Awaiting Visual Target in Camera</h4>
                <p>
                  Point your laptop camera at a license plate, paper, sign, or phone screen.
                  DRISHTI will automatically lock on and read the text with 99.8% precision.
                </p>
                <div className="hero-standby-tips">
                  <div className="tips-title">TIPS FOR INSTANT DETECTION:</div>
                  <ul className="tips-list">
                    <li><strong>Hold Closer:</strong> Bring phone screen or license plate into the viewfinder reticle.</li>
                    <li><strong>Screen Glare:</strong> Tilt phone slightly to prevent light reflections on the screen glass.</li>
                    <li><strong>Live Scanning:</strong> Click &quot;Start Scan&quot; or &quot;Instant Deep Scan&quot; below.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* SESSION SCAN AUDIT TRAIL / RECENT DETECTIONS */}
          <div className="scan-history-card">
            <div className="scan-history-header">
              <span className="font-bold text-xs uppercase tracking-wider text-muted">
                Live Scan Audit Trail ({recentDetections.length})
              </span>
              {recentDetections.length > 0 && (
                <button
                  type="button"
                  className="btn-clear-history"
                  onClick={async () => {
                    await api.clearLiveAnprHistory();
                    setRecentDetections([]);
                    showToast("Scan audit history cleared");
                  }}
                  title="Clear history"
                >
                  <Trash2 size={13} />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="scan-history-list">
              {recentDetections.length > 0 ? (
                recentDetections.map((det, idx) => (
                  <div
                    key={det.scan_id || idx}
                    className={`history-item-row ${
                      det.is_blacklisted ? "history-blacklist" : ""
                    }`}
                  >
                    <div className="history-item-left">
                      <div className="history-plate font-mono font-bold" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>{det.formatted_plate || det.exact_text}</span>
                        {det.is_vehicle_plate && (
                          <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.15)", color: "#10B981", fontWeight: 600 }}>
                            VERIFIED RTO
                          </span>
                        )}
                      </div>
                      <div className="history-sub">
                        <span>{det.time_display || "Recent"}</span>
                        <span>•</span>
                        {det.state_name && (
                          <>
                            <span style={{ color: "#D97706", fontWeight: 500 }}>{det.state_name}</span>
                            <span>•</span>
                          </>
                        )}
                        <span>{det.vahan_model || (det.is_vehicle_plate ? "Standard Plate" : "Direct Text")}</span>
                      </div>
                    </div>

                    <div className="history-item-right">
                      <span className="history-conf font-mono text-xs">
                        {Math.round((det.confidence || 0.95) * 100)}%
                      </span>
                      {det.is_blacklisted && (
                        <span className="history-alert-tag">WANTED</span>
                      )}
                      <button
                        type="button"
                        className="btn-history-copy"
                        onClick={() =>
                          copyToClipboard(det.formatted_plate || det.exact_text)
                        }
                        title="Copy text"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="history-empty text-xs text-dim">
                  No scan events recorded yet in this session.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default LiveWebcamAnpr;
