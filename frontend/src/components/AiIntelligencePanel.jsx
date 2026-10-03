import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Eye,
  Upload,
  Camera,
  Shield,
  Zap,
  CheckCircle,
  RefreshCw,
  Sliders,
  Database,
} from "lucide-react";
import { api, getCanonicalCameraName, getCanonicalJunctionName } from "../services/api";
import "./AiIntelligencePanel.css";

const CAMERA_OPTIONS = [
  { id: "junction_A_camera_01", label: "Junction A — Camera 01 (Vivekananda Sarani Inbound)" },
  { id: "junction_A_camera_02", label: "Junction A — Camera 02 (Vivekananda Sarani Outbound)" },
  { id: "junction_B_camera_01", label: "Junction B — Camera 01 (Kanyapur Link Road Inbound)" },
  { id: "junction_B_camera_02", label: "Junction B — Camera 02 (Kanyapur Link Road Outbound)" },
];

const CAMERA_DURATIONS = {
  junction_A_camera_01: 205, // 03m 25s
  junction_A_camera_02: 205, // 03m 25s
  junction_B_camera_01: 245, // 04m 05s
  junction_B_camera_02: 245, // 04m 05s
};

export const formatTimeMmSs = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(remSec).padStart(2, "0")}`;
};

const QUICK_BOOKMARKS = [
  { time: 5, label: "00:05" },
  { time: 12, label: "00:12" },
  { time: 30, label: "00:30" },
  { time: 60, label: "01:00" },
  { time: 90, label: "01:30" },
  { time: 120, label: "02:00" },
  { time: 180, label: "03:00" },
];

/** Resolves media URLs against the active backend API base */
const resolveMediaUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const base = typeof api?.getApiBase === "function" ? api.getApiBase() : "http://127.0.0.1:8000";
  const cleanPath = url.startsWith("/") ? url : `/${url}`;
  return `${base}${cleanPath}`;
};

export function AiIntelligencePanel({ onSelectVehicle, onFocusCamera }) {
  const [activeSubTab, setActiveSubTab] = useState("scene");

  /* =========================================================================
     1. SCENE UNDERSTANDING STATE
     ========================================================================= */
  const [selectedCamera, setSelectedCamera] = useState("junction_A_camera_01");
  const [sceneTimestamp, setSceneTimestamp] = useState(12.0);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneData, setSceneData] = useState(null);
  const [sceneError, setSceneError] = useState("");

  const currentMaxDuration = CAMERA_DURATIONS[selectedCamera] || 205;

  // 5-second step options up to current camera duration (clean timestamps)
  const timestampOptions = React.useMemo(() => {
    const opts = [];
    for (let t = 0; t <= currentMaxDuration; t += 5) {
      opts.push({ value: t, label: `${formatTimeMmSs(t)} (T+${t}s)` });
    }
    if (!opts.find((o) => o.value === 12)) {
      opts.splice(3, 0, { value: 12, label: "00:12 (T+12s)" });
    }
    return opts;
  }, [currentMaxDuration]);

  // Instant visual frame preview without heavy AI loading
  const handleTimeChange = (newTime) => {
    const clamped = Math.max(0, Math.min(newTime, currentMaxDuration));
    setSceneTimestamp(clamped);
  };

  const handleStepTime = (delta) => {
    handleTimeChange(sceneTimestamp + delta);
  };

  const handleAnalyzeScene = async (camId = selectedCamera, tSec = sceneTimestamp) => {
    setSceneLoading(true);
    setSceneError("");
    try {
      const res = await api.analyzeTrafficScene({
        camera_id: camId,
        timestamp_sec: tSec,
      });
      setSceneData(res);
    } catch (err) {
      console.error("Failed to analyze scene:", err);
      setSceneError("Failed to connect to Gemma 4 multimodal service.");
    } finally {
      setSceneLoading(false);
    }
  };

  // Initial auto-load for instant first impression
  useEffect(() => {
    handleAnalyzeScene("junction_A_camera_01", 12.0);
  }, []);


  /* =========================================================================
     5. CUSTOM FRAME UPLOAD STATE
     ========================================================================= */
  const [uploadBase64, setUploadBase64] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = ev.target.result;
      setUploadBase64(b64);
      setUploadLoading(true);
      try {
        const res = await api.inspectUploadedFrame({ image_base64: b64 });
        setUploadResult(res?.analysis || null);
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        setUploadLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="ai-intel-container font-mono">
      {/* 1. HERO BANNER */}
      <section className="ai-intel-hero">
        <div className="ai-hero-title-group">
          <h2>
            <Sparkles size={24} style={{ color: "#38bdf8" }} />
            DRISHTI — Multimodal Traffic Intelligence
          </h2>
          <p className="ai-hero-sub">
            Bridging Computer Vision perception and Google Gemma 4 cognitive reasoning across the Asansol urban corridor.
          </p>
        </div>

        <div className="ai-hero-badges">
          <span className="ai-badge ai-badge-gemma">
            <Zap size={13} />
            MODEL: gemma-4-26b-a4b-it
          </span>
          <span className="ai-badge ai-badge-multimodal">
            <Eye size={13} />
            MULTIMODAL (TEXT + VISION)
          </span>
          <span className="ai-badge ai-badge-license">
            <Shield size={13} />
            PERSONAL RESEARCH CORE
          </span>
        </div>
      </section>

      {/* 2. SUB-NAVIGATION TABS */}
      <nav className="ai-intel-tabs">
        <button
          type="button"
          className={`ai-tab-btn ${activeSubTab === "scene" ? "active" : ""}`}
          onClick={() => setActiveSubTab("scene")}
        >
          <Camera size={16} />
          <span>Multimodal Scene Understanding</span>
        </button>

        <button
          type="button"
          className={`ai-tab-btn ${activeSubTab === "upload" ? "active" : ""}`}
          onClick={() => setActiveSubTab("upload")}
        >
          <Upload size={16} />
          <span>Custom Frame Inspector</span>
        </button>
      </nav>

      {/* 3. SUB-TAB VIEW: SCENE UNDERSTANDING */}
      {activeSubTab === "scene" && (
        <div className="ai-intel-workbench-grid">
          {/* LEFT: Frame Visualizer & Camera Controls */}
          <div className="ai-card">
            <div className="ai-card-header">
              <span className="ai-card-title">
                <Camera size={16} style={{ color: "#38bdf8" }} />
                CCTV Camera Snapshot & Controls
              </span>
              <span style={{ fontSize: "11px", color: "#38bdf8" }}>1080p SYNCHRONIZED</span>
            </div>

            <div className="ai-controls-bar">
              <select
                className="ai-select"
                style={{ flex: "1 1 220px" }}
                value={selectedCamera}
                onChange={(e) => {
                  const newCam = e.target.value;
                  setSelectedCamera(newCam);
                  handleAnalyzeScene(newCam, sceneTimestamp);
                }}
              >
                {CAMERA_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              {/* 1. Synchronized 5-Second Interval Dropdown */}
              <select
                className="ai-select"
                style={{ flex: "1 1 180px" }}
                value={Math.round(sceneTimestamp)}
                onChange={(e) => handleTimeChange(parseFloat(e.target.value))}
              >
                {timestampOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="ai-action-btn"
                disabled={sceneLoading}
                onClick={() => handleAnalyzeScene(selectedCamera, sceneTimestamp)}
              >
                <Sparkles size={14} className={sceneLoading ? "animate-spin" : ""} />
                <span>
                  {sceneLoading
                    ? "Gemma 4 Reasoning..."
                    : `Analyze Frame (${formatTimeMmSs(sceneTimestamp)})`}
                </span>
              </button>
            </div>

            {/* 2. Interactive Cyber Timeline Scrubber Bar */}
            <div className="ai-timeline-scrubber">
              <div className="ai-timeline-header">
                <div className="ai-timeline-time-display">
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>FRAME TIME:</span>
                  <span className="ai-timeline-current-time">
                    {formatTimeMmSs(sceneTimestamp)}
                  </span>
                  <span className="ai-timeline-total-time">
                    / {formatTimeMmSs(currentMaxDuration)} (T+{sceneTimestamp.toFixed(0)}s)
                  </span>
                </div>

                <div className="ai-timeline-stepper-group">
                  <button
                    type="button"
                    className="ai-stepper-btn"
                    disabled={sceneTimestamp <= 0}
                    onClick={() => handleStepTime(-5)}
                    title="Jump 5 seconds back"
                  >
                    ◀ -5s
                  </button>
                  <button
                    type="button"
                    className="ai-stepper-btn"
                    disabled={sceneTimestamp >= currentMaxDuration}
                    onClick={() => handleStepTime(+5)}
                    title="Jump 5 seconds forward"
                  >
                    +5s ▶
                  </button>
                </div>
              </div>

              {/* Range Slider */}
              <div className="ai-timeline-slider-row">
                <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#64748b" }}>00:00</span>
                <input
                  type="range"
                  min="0"
                  max={currentMaxDuration}
                  step="5"
                  value={Math.round(sceneTimestamp)}
                  onChange={(e) => handleTimeChange(parseFloat(e.target.value))}
                  className="ai-timeline-slider"
                />
                <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#64748b" }}>
                  {formatTimeMmSs(currentMaxDuration)}
                </span>
              </div>

              {/* Quick Jump Bookmarks (Pure Timestamps) */}
              <div className="ai-timeline-bookmarks">
                <span className="ai-timeline-bookmark-label">QUICK JUMP:</span>
                {QUICK_BOOKMARKS.filter((b) => b.time <= currentMaxDuration).map((b) => (
                  <button
                    key={b.time}
                    type="button"
                    className={`ai-timeline-chip ${Math.round(sceneTimestamp) === b.time ? "active" : ""}`}
                    onClick={() => handleTimeChange(b.time)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-frame-viewer">
              <div className="ai-frame-overlay-badge">
                {selectedCamera.includes("junction_A") ? "J1: VIVEKANANDA SARANI" : "J2: KANYAPUR LINK ROAD"}
              </div>

              <img
                key={`${selectedCamera}_${Math.round(sceneTimestamp)}`}
                src={
                  resolveMediaUrl(`/api/ai/keyframes/${selectedCamera}_t${Math.round(sceneTimestamp)}.jpg`) ||
                  resolveMediaUrl(sceneData?.keyframe_url) ||
                  resolveMediaUrl(`/static/cache/keyframes/${selectedCamera}_t12.jpg`)
                }
                alt="CCTV Frame"
                className="ai-frame-img"
                onError={(e) => {
                  const fallback = resolveMediaUrl(`/static/cache/keyframes/${selectedCamera}_t12.jpg`);
                  const ultimateFallback = resolveMediaUrl('/api/plates/DET_000014.jpg');
                  if (e.target.src !== fallback && e.target.src !== ultimateFallback) {
                    e.target.src = fallback;
                  } else if (e.target.src !== ultimateFallback) {
                    e.target.src = ultimateFallback;
                  }
                }}
              />

              <div className="ai-frame-telemetry-strip">
                <span>OBSERVED TIME: {formatTimeMmSs(sceneTimestamp)} (T+{sceneTimestamp.toFixed(0)}s)</span>
                <span>STATUS: 1080p OPERATIONAL</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Gemma 4 Structured Analysis */}
          <div className="ai-card">
            <div className="ai-card-header">
              <span className="ai-card-title">
                <Sparkles size={16} style={{ color: "#38bdf8" }} />
                Gemma 4 Cognitive Scene Breakdown
              </span>
              <span className="ai-badge ai-badge-gemma">
                {sceneLoading ? "PROCESSING MULTIMODAL..." : "REASONING COMPLETE"}
              </span>
            </div>

            {sceneLoading ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8" }}>
                <RefreshCw size={32} className="animate-spin" style={{ color: "#38bdf8", margin: "0 auto 12px" }} />
                <div>Gemma 4 is inspecting high-definition pixels and YOLO telemetry at {formatTimeMmSs(sceneTimestamp)}...</div>
              </div>
            ) : sceneData?.analysis ? (
              <div className="ai-result-section">
                {/* Notice if viewing a different frame than what was analyzed */}
                {sceneData.timestamp_sec !== undefined && Math.abs(sceneData.timestamp_sec - sceneTimestamp) >= 3 && (
                  <div
                    style={{
                      background: "rgba(56, 189, 248, 0.1)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      marginBottom: "12px",
                      fontSize: "12px",
                      color: "#38bdf8",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <span>
                      Viewing frame at <b>{formatTimeMmSs(sceneTimestamp)}</b> (Analysis below is for{" "}
                      <b>{formatTimeMmSs(sceneData.timestamp_sec)}</b>)
                    </span>
                    <button
                      type="button"
                      className="ai-stepper-btn"
                      style={{ background: "#0284c7", color: "#ffffff", borderColor: "#38bdf8" }}
                      onClick={() => handleAnalyzeScene(selectedCamera, sceneTimestamp)}
                    >
                      ⚡ Re-Analyze at {formatTimeMmSs(sceneTimestamp)}
                    </button>
                  </div>
                )}
                <div className="ai-result-block">
                  <div className="ai-result-label">Situational Overview</div>
                  <div className="ai-result-value">{sceneData.analysis.overview}</div>
                </div>

                <div className="ai-result-block">
                  <div className="ai-result-label">Congestion Assessment</div>
                  <div style={{ marginTop: "4px" }}>
                    <span
                      className={`ai-congestion-pill ai-congestion-${(
                        sceneData.analysis.congestion_level || "MODERATE"
                      ).toLowerCase()}`}
                    >
                      {sceneData.analysis.congestion_level || "MODERATE"} TRAFFIC DENSITY
                    </span>
                  </div>
                </div>

                <div className="ai-result-block">
                  <div className="ai-result-label">Lane Utilization & Directional Flow</div>
                  <div className="ai-result-value">{sceneData.analysis.lane_observations}</div>
                </div>

                {sceneData.detected_plates && sceneData.detected_plates.length > 0 && (
                  <div className="ai-result-block">
                    <div className="ai-result-label">Detected Vehicle Number Plates (In Frame)</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                      {sceneData.detected_plates.map((dp, idx) => (
                        <div
                          key={idx}
                          className="ai-plate-chip"
                          onClick={() => onSelectVehicle && onSelectVehicle(dp.plate)}
                          title="Click to inspect vehicle in ANPR"
                        >
                          <span className="ai-plate-ind-xs">IND</span>
                          <b>{dp.plate}</b>
                          <span style={{ fontSize: "11px", color: "#6B5C50" }}>
                            ({dp.vehicle_type || "Vehicle"}{dp.confidence ? ` • ${(dp.confidence * (dp.confidence <= 1 ? 100 : 1)).toFixed(0)}%` : ""})
                          </span>
                          {dp.is_blacklisted && (
                            <span className="ai-db-plate-flag blacklisted" style={{ marginLeft: "4px" }}>
                              ⚠️ BLACKLISTED
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="ai-result-block">
                  <div className="ai-result-label">Observed Roadway Hazards / Bottlenecks</div>
                  <div className="ai-result-value">
                    {sceneData.analysis.anomalies_or_hazards || "None identified; ingress flow clear."}
                  </div>
                </div>

                <div className="ai-result-block">
                  <div className="ai-result-label">Visual Clarity & Quality</div>
                  <div className="ai-result-value" style={{ fontSize: "12px", color: "#94a3b8" }}>
                    {sceneData.analysis.confidence_assessment}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "30px", color: "#94a3b8", textAlign: "center" }}>
                Click "Analyze with Gemma 4" to generate real-time multimodal scene reasoning.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. SUB-TAB VIEW: CUSTOM FRAME INSPECTOR */}
      {activeSubTab === "upload" && (
        <div className="ai-intel-workbench-grid">
          <div className="ai-card">
            <div className="ai-card-header">
              <span className="ai-card-title">
                <Upload size={16} style={{ color: "#38bdf8" }} />
                Upload Traffic Frame Snapshot
              </span>
              <span className="ai-badge ai-badge-multimodal">ANY IMAGE FILE</span>
            </div>

            <div style={{ padding: "20px", border: "2px dashed rgba(56, 189, 248, 0.3)", borderRadius: "8px", textAlign: "center", marginBottom: "16px" }}>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: "none" }}
                id="traffic-frame-upload-input"
              />
              <label htmlFor="traffic-frame-upload-input" style={{ cursor: "pointer", display: "inline-block" }}>
                <Upload size={32} style={{ color: "#38bdf8", margin: "0 auto 10px" }} />
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#f8fafc" }}>
                  Click to Upload Traffic Camera Image
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                  Supports JPEG, PNG from phones, external CCTV nodes, or road surveys
                </div>
              </label>
            </div>

            {uploadBase64 && (
              <div className="ai-frame-viewer" style={{ minHeight: "220px" }}>
                <img src={uploadBase64} alt="Uploaded Frame" className="ai-frame-img" />
              </div>
            )}
          </div>

          <div className="ai-card">
            <div className="ai-card-header">
              <span className="ai-card-title">
                <Sparkles size={16} style={{ color: "#38bdf8" }} />
                Gemma 4 Multimodal Analysis Output
              </span>
            </div>

            {uploadLoading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                <RefreshCw size={28} className="animate-spin" style={{ color: "#38bdf8", margin: "0 auto 12px" }} />
                <div>Gemma 4 is reading pixels, vehicles, and roadway context...</div>
              </div>
            ) : uploadResult ? (
              <div className="ai-result-section">
                <div className="ai-result-block">
                  <div className="ai-result-label">Scene Description</div>
                  <div className="ai-result-value">{uploadResult.scene_description}</div>
                </div>

                <div className="ai-result-block">
                  <div className="ai-result-label">Apparent Traffic Density</div>
                  <div className="ai-result-value">{uploadResult.apparent_density}</div>
                </div>

                <div className="ai-result-block">
                  <div className="ai-result-label">Road & Environmental Conditions</div>
                  <div className="ai-result-value">{uploadResult.road_conditions || "Standard daytime lighting."}</div>
                </div>

                {uploadResult.actionable_insights && (
                  <div className="ai-result-block">
                    <div className="ai-result-label">Actionable Insights</div>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: "13px" }}>
                      {uploadResult.actionable_insights.map((ins, i) => (
                        <li key={i}>{ins}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                Upload an image on the left to see Gemma 4 analyze arbitrary external traffic scenes.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
