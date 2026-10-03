import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Play,
  Pause,
  X,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  VolumeX,
  Maximize2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import {
  api,
  normalizeCameraId,
  getCanonicalCameraName,
  getCanonicalJunctionName,
} from "../services/api";

const EVIDENCE_PRE_ROLL = 5; // 5 seconds before detection
const DEFAULT_EVIDENCE_DURATION = 15; // 15-second concise forensic clip (5s pre-roll + 10s post-roll)

// Format seconds → M:SS
const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export function EvidencePlaybackModal({ isOpen, onClose, eventData }) {
  const videoRef = useRef(null);
  const seekBarRef = useRef(null);
  const currentTimeSpanRef = useRef(null);
  const ribbonTimeRef = useRef(null);
  const ribbonEventTagRef = useRef(null);
  const updateTimelineDOMRef = useRef(null);
  const activeClipKeyRef = useRef("");

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [showPauseBanner, setShowPauseBanner] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [usingFallbackSrc, setUsingFallbackSrc] = useState(false);
  const [isFullStream, setIsFullStream] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const hasStartedRef = useRef(false);
  const hasAutoPausedRef = useRef(false);
  const isFullStreamRef = useRef(false);
  const playbackRateRef = useRef(1);

  // Normalize camera & timings
  const rawCamId = eventData?.cameraId || eventData?.camera_id || "junction_A_camera_01";
  const canonicalCamId = normalizeCameraId(rawCamId);
  const timestampSec = Number(eventData?.timestamp ?? eventData?.timestamp_sec ?? eventData?.timestamp_seconds) || 0;
  const actualPreRoll = Math.min(EVIDENCE_PRE_ROLL, timestampSec);
  const clipStartSec = Math.max(0, timestampSec - actualPreRoll);
  const evidenceDuration = Number(eventData?.evidenceDuration) || DEFAULT_EVIDENCE_DURATION;
  const clipEndSec = clipStartSec + evidenceDuration;
  const effectiveDuration = Math.max(1, clipEndSec - clipStartSec);
  const targetRelativeSec = Math.max(0, timestampSec - clipStartSec);
  const markerPct = (targetRelativeSec / effectiveDuration) * 100;

  // Canonical names for professional display
  const canonicalCameraName = getCanonicalCameraName(canonicalCamId, eventData?.cameraName);
  const canonicalJunctionName = getCanonicalJunctionName(eventData?.junctionName);
  const targetPlate = eventData?.plate || "TARGET";

  // Primary URL is trimmed faststart clip; fallback is raw camera video stream
  const primaryVideoUrl = api.getEvidenceClipUrl(canonicalCamId, timestampSec, actualPreRoll, evidenceDuration);
  const fallbackVideoUrl = api.getCameraVideoUrl(canonicalCamId);
  const activeVideoUrl = usingFallbackSrc ? fallbackVideoUrl : primaryVideoUrl;

  // Detect whether the loaded video is an un-trimmed full-length CCTV stream (> 20s)
  const checkIsFullStream = useCallback((vid) => {
    if (!vid) return isFullStreamRef.current;
    const full = usingFallbackSrc || Boolean(Number.isFinite(vid.duration) && vid.duration > effectiveDuration + 5);
    if (full !== isFullStreamRef.current) {
      isFullStreamRef.current = full;
      setIsFullStream(full);
    }
    return full;
  }, [usingFallbackSrc, effectiveDuration]);

  // Direct DOM updates for zero-lag 60fps seek bar & time ribbon sync
  const updateTimelineDOM = useCallback((relCt) => {
    const absCt = clipStartSec + relCt;
    if (currentTimeSpanRef.current) {
      currentTimeSpanRef.current.textContent = fmt(absCt);
    }
    if (ribbonTimeRef.current) {
      ribbonTimeRef.current.textContent = `T+${fmt(absCt)}`;
    }
    if (seekBarRef.current) {
      seekBarRef.current.value = Math.max(0, Math.min(effectiveDuration, relCt));
    }

    if (ribbonEventTagRef.current) {
      if (relCt >= targetRelativeSec - 0.25 && relCt <= targetRelativeSec + 1.2) {
        ribbonEventTagRef.current.textContent = `⚡ VEHICLE DETECTED • ${targetPlate}`;
        ribbonEventTagRef.current.style.display = "inline-flex";
        ribbonEventTagRef.current.style.background = "rgba(239, 68, 68, 0.35)";
        ribbonEventTagRef.current.style.color = "#fca5a5";
        ribbonEventTagRef.current.style.borderColor = "rgba(239, 68, 68, 0.6)";
      } else if (relCt > targetRelativeSec + 1.2) {
        ribbonEventTagRef.current.textContent = `✓ TARGET SIGHTING RECORDED`;
        ribbonEventTagRef.current.style.display = "inline-flex";
        ribbonEventTagRef.current.style.background = "rgba(16, 185, 129, 0.25)";
        ribbonEventTagRef.current.style.color = "#4ade80";
        ribbonEventTagRef.current.style.borderColor = "rgba(16, 185, 129, 0.4)";
      } else {
        ribbonEventTagRef.current.textContent = `▶ EVIDENCE PLAYBACK (−${Math.round(actualPreRoll)}s PRE-ROLL)`;
        ribbonEventTagRef.current.style.display = "inline-flex";
        ribbonEventTagRef.current.style.background = "rgba(2, 132, 199, 0.25)";
        ribbonEventTagRef.current.style.color = "#38bdf8";
        ribbonEventTagRef.current.style.borderColor = "rgba(2, 132, 199, 0.4)";
      }
    }
  }, [clipStartSec, effectiveDuration, targetPlate, targetRelativeSec, actualPreRoll]);

  useEffect(() => {
    updateTimelineDOMRef.current = updateTimelineDOM;
  }, [updateTimelineDOM]);

  // Escape key listener to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Reset & initialize state when opening modal or switching clip
  useEffect(() => {
    if (!isOpen) {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      activeClipKeyRef.current = "";
      hasStartedRef.current = false;
      hasAutoPausedRef.current = false;
      setIsPlaying(false);
      setShowPauseBanner(false);
      setUsingFallbackSrc(false);
      setIsFullStream(false);
      isFullStreamRef.current = false;
      setVideoError(false);
      return;
    }

    const clipKey = `${canonicalCamId}_${timestampSec}`;
    if (activeClipKeyRef.current === clipKey) {
      return;
    }
    activeClipKeyRef.current = clipKey;

    hasStartedRef.current = false;
    hasAutoPausedRef.current = false;
    setAutoPaused(false);
    setShowPauseBanner(false);
    setVideoError(false);
    setUsingFallbackSrc(false);
    setIsFullStream(false);
    isFullStreamRef.current = false;
    setPlaybackRate(1);
    playbackRateRef.current = 1;

    const vid = videoRef.current;
    if (vid) {
      vid.playbackRate = 1;
      if (vid.readyState >= 1) {
        setVideoReady(true);
      }
      if (vid.readyState >= 2 && !hasStartedRef.current) {
        hasStartedRef.current = true;
        const full = checkIsFullStream(vid);
        vid.currentTime = full ? clipStartSec : 0;
        updateTimelineDOMRef.current?.(0);
        vid.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  }, [isOpen, canonicalCamId, timestampSec, clipStartSec, usingFallbackSrc, checkIsFullStream]);

  // High-frequency animation tick during active playback (60 FPS millisecond precision)
  useEffect(() => {
    if (!isOpen) return;
    let animId;
    const tick = () => {
      const vid = videoRef.current;
      if (vid && !vid.paused) {
        const full = isFullStreamRef.current || checkIsFullStream(vid);
        const currentRel = full
          ? Math.max(0, vid.currentTime - clipStartSec)
          : vid.currentTime;
        updateTimelineDOM(currentRel);

        // Instantaneous 60fps check: freeze video the millisecond target reaches the yellow marker
        if (!hasAutoPausedRef.current && currentRel >= targetRelativeSec) {
          hasAutoPausedRef.current = true;
          vid.pause();
          const pauseSeek = full ? (clipStartSec + targetRelativeSec) : targetRelativeSec;
          vid.currentTime = pauseSeek;
          setIsPlaying(false);
          setAutoPaused(true);
          setShowPauseBanner(true);
          updateTimelineDOM(targetRelativeSec);
        }
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, checkIsFullStream, clipStartSec, targetRelativeSec, updateTimelineDOM]);

  if (!isOpen || !eventData) return null;

  const {
    plate = "TARGET",
    vehicleType = "car",
    confidence = 0.96,
    isBlacklisted = false,
    reason = "",
  } = eventData;

  const confPercent = Math.round(confidence <= 1 ? confidence * 100 : confidence);

  // ── Video Event Handlers ──
  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setVideoReady(true);
    const full = checkIsFullStream(vid);
    if (full) {
      if (!hasStartedRef.current || vid.currentTime < clipStartSec - 0.5) {
        vid.currentTime = clipStartSec;
      }
    }
  };

  const handleCanPlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setVideoReady(true);
    setVideoError(false);

    const full = checkIsFullStream(vid);

    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    vid.playbackRate = playbackRateRef.current;
    const initialTime = full ? clipStartSec : 0;
    vid.currentTime = initialTime;
    updateTimelineDOM(0);

    vid.play().then(() => setIsPlaying(true)).catch((e) => {
      console.warn("[EvidencePlayback] Autoplay blocked by browser (user can click play):", e);
    });
  };

  const handleVideoError = (e) => {
    console.warn("[EvidencePlayback] Primary evidence clip error, falling back to full camera feed:", e);
    if (!usingFallbackSrc) {
      setUsingFallbackSrc(true);
      isFullStreamRef.current = true;
      setIsFullStream(true);
      setVideoReady(false);
      hasStartedRef.current = false;
    } else {
      setVideoError(true);
      setVideoReady(true);
    }
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;

    const full = isFullStreamRef.current || checkIsFullStream(vid);
    const relCt = full
      ? Math.max(0, vid.currentTime - clipStartSec)
      : vid.currentTime;

    // ── AUTO-PAUSE: WHEN SELECTED VEHICLE REACHES MAIN FRAME (EXACT YELLOW MARKER) ──
    if (!hasAutoPausedRef.current && !vid.paused && relCt >= targetRelativeSec) {
      hasAutoPausedRef.current = true;
      vid.pause();
      const pauseSeek = full ? (clipStartSec + targetRelativeSec) : targetRelativeSec;
      vid.currentTime = pauseSeek;
      setIsPlaying(false);
      setAutoPaused(true);
      setShowPauseBanner(true);
      updateTimelineDOM(targetRelativeSec);
      return;
    }

    // End of 15-second evidence clip boundary
    if (relCt >= effectiveDuration) {
      const finalSeek = full ? clipStartSec + effectiveDuration : effectiveDuration;
      vid.currentTime = finalSeek;
      vid.pause();
      setIsPlaying(false);
      updateTimelineDOM(effectiveDuration);
      return;
    }

    updateTimelineDOM(relCt);
  };

  const handlePlayPause = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const full = isFullStreamRef.current || checkIsFullStream(vid);
    if (vid.paused) {
      const relCt = full
        ? Math.max(0, vid.currentTime - clipStartSec)
        : vid.currentTime;
      // If at end of clip, restart from beginning
      if (relCt >= effectiveDuration - 0.1) {
        vid.currentTime = full ? clipStartSec : 0;
        hasAutoPausedRef.current = false;
      }
      setAutoPaused(false);
      setShowPauseBanner(false);
      vid.playbackRate = playbackRateRef.current;
      vid.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  };

  const handleResume = (e) => {
    e?.stopPropagation();
    handlePlayPause();
  };

  const handleReplayFromStart = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const full = isFullStreamRef.current || checkIsFullStream(vid);
    vid.currentTime = full ? clipStartSec : 0;
    hasAutoPausedRef.current = false;
    setAutoPaused(false);
    setShowPauseBanner(false);
    updateTimelineDOM(0);
    vid.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  const handleSeekBar = (e) => {
    const vid = videoRef.current;
    if (!vid) return;
    const full = isFullStreamRef.current || checkIsFullStream(vid);
    const offset = parseFloat(e.target.value);
    const targetRel = Math.max(0, Math.min(effectiveDuration, offset));
    vid.currentTime = full ? clipStartSec + targetRel : targetRel;
    // If seeked before detection moment, re-arm auto-pause
    if (targetRel < actualPreRoll - 0.2) {
      hasAutoPausedRef.current = false;
    }
    updateTimelineDOM(targetRel);
  };

  const handleSpeedChange = (e) => {
    const rate = parseFloat(e.target.value);
    playbackRateRef.current = rate;
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleMuteToggle = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setIsMuted(vid.muted);
  };

  const handleFullscreen = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.requestFullscreen?.().catch(() => {});
  };

  return createPortal(
    <div className="evidence-modal-backdrop" onClick={onClose}>
      <div
        className="evidence-playback-modal-box ev-v2"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* ── HEADER ── */}
        <div className="evidence-modal-header">
          <div className="evidence-header-title-wrap">
            <div className="evidence-lead-badge font-mono">
              <Clock size={13} />
              <span>FORENSIC CCTV AUDIT • EVIDENCE PLAYBACK</span>
            </div>
            <h2 className="evidence-modal-main-title">
              Vehicle Sighting — Live Evidence
            </h2>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* ── BODY (2-col) ── */}
        <div className="ev2-body">

          {/* ── LEFT: CCTV VIDEO PLAYER (CLEAN — NO BOUNDING BOXES) ── */}
          <div className="ev2-video-col">
            <div className="ev2-video-wrapper">

              {/* Black-scan scanlines overlay */}
              <div className="ev2-scanlines" />

              {/* Status ribbon */}
              <div className="ev2-status-ribbon font-mono">
                <span className="ev2-rec-dot" />
                <span>REC • {canonicalCameraName}</span>
                <span className="ev2-ribbon-sep">•</span>
                <span ref={ribbonTimeRef}>T+{fmt(clipStartSec)}</span>
                <span ref={ribbonEventTagRef} className="ev2-event-tag" style={{ display: "none" }}>
                  ▶ EVIDENCE PLAYBACK
                </span>
              </div>

              {/* FORENSIC INTELLIGENCE STATUS BAR */}
              <div className="ev2-ai-vision-toolbar font-mono">
                <div className="ev2-ai-chip">
                  <span className="ev2-ai-dot" />
                  <span>CCTV SIGHTING REPLAY</span>
                </div>

                <div className="ev2-target-locked-badge">
                  <span>🎯 TARGET: <strong>{plate}</strong></span>
                </div>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "11px", color: autoPaused ? "#f87171" : "#4ade80", fontWeight: 700 }}>
                    {autoPaused ? "⚡ SIGHTING MOMENT PAUSED" : "● AUTO-PAUSE ARMED (T+5s)"}
                  </span>
                </div>
              </div>

              {/* THE VIDEO ELEMENT (Pristine CCTV evidence clip without bounding boxes) */}
              <video
                ref={videoRef}
                src={activeVideoUrl}
                className="ev2-video"
                muted={isMuted}
                playsInline
                preload="auto"
                onLoadedMetadata={handleLoadedMetadata}
                onLoadedData={() => setVideoReady(true)}
                onCanPlay={handleCanPlay}
                onPlaying={() => {
                  setVideoReady(true);
                  setIsPlaying(true);
                }}
                onError={handleVideoError}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              {/* Loading overlay */}
              {!videoReady && !videoError && (
                <div className="ev2-loading-overlay font-mono">
                  <div className="ev2-loading-spinner" />
                  <span>Loading CCTV evidence clip…</span>
                </div>
              )}

              {/* Error overlay with reload option */}
              {videoError && (
                <div className="ev2-loading-overlay font-mono" style={{ background: "rgba(10, 15, 29, 0.95)" }}>
                  <AlertTriangle size={32} color="#EF4444" style={{ marginBottom: "8px" }} />
                  <span style={{ color: "#FCA5A5", fontWeight: 700 }}>CCTV feed stream notice</span>
                  <p style={{ fontSize: "12px", color: "#94A3B8", marginTop: "4px" }}>
                    Camera node {canonicalCameraName} stream is buffering.
                  </p>
                  <button
                    type="button"
                    onClick={handleReplayFromStart}
                    className="ev2-resume-btn font-mono"
                    style={{ marginTop: "12px" }}
                  >
                    <RotateCcw size={13} />
                    <span>RETRY PLAYBACK</span>
                  </button>
                </div>
              )}

              {/* CLICK-TO-PLAY OVERLAY (If browser restricted initial autoplay) */}
              {videoReady && !isPlaying && !autoPaused && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0, 0, 0, 0.25)",
                    cursor: "pointer",
                    zIndex: 10,
                  }}
                  onClick={handlePlayPause}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "rgba(2, 132, 199, 0.9)",
                      color: "#FFFFFF",
                      padding: "10px 20px",
                      borderRadius: "24px",
                      fontWeight: 800,
                      fontSize: "13px",
                      boxShadow: "0 4px 16px rgba(2, 132, 199, 0.5)",
                    }}
                    className="font-mono"
                  >
                    <Play size={16} fill="currentColor" />
                    <span>PLAY EVIDENCE CLIP</span>
                  </div>
                </div>
              )}

              {/* ── AUTO-PAUSE POPUP / BADGE (EXACTLY WHEN VEHICLE APPEARS IN FRAME) ──
                  Dismissible with ✕ or by clicking outside so operator can inspect paused vehicle.
                  Dismissing keeps video paused. Only clicking RESUME or Play resumes playback. */}
              {autoPaused && showPauseBanner && (
                <div
                  className="ev2-auto-pause-overlay"
                  onClick={() => setShowPauseBanner(false)}
                  title="Click anywhere to dismiss banner and inspect paused video"
                >
                  <div
                    className="ev2-pause-badge font-mono"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="ev2-pause-icon-ring">
                      <Pause size={18} />
                    </div>
                    <div className="ev2-pause-text">
                      <span className="ev2-pause-headline">⚡ VEHICLE DETECTED</span>
                      <span className="ev2-pause-sub">
                        Target [{plate}] appeared in main frame at T+{fmt(timestampSec)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ev2-resume-btn font-mono"
                      onClick={handleResume}
                      title="Resume Playback"
                    >
                      <Play size={13} fill="currentColor" />
                      <span>RESUME</span>
                    </button>
                    <button
                      type="button"
                      className="ev2-dismiss-btn"
                      onClick={() => setShowPauseBanner(false)}
                      title="Dismiss popup to inspect paused video (press Play on controls to resume)"
                      aria-label="Dismiss popup"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )}

              {/* Controls bar */}
              <div className="ev2-controls">
                <button
                  type="button"
                  className="ev2-ctrl-btn"
                  onClick={handlePlayPause}
                  title={isPlaying ? "Pause" : "Play / Resume"}
                >
                  {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                </button>

                <span ref={currentTimeSpanRef} className="ev2-time font-mono">
                  {fmt(clipStartSec)}
                </span>

                <div className="ev2-seek-wrap">
                  <input
                    ref={seekBarRef}
                    type="range"
                    min={0}
                    max={effectiveDuration}
                    step={0.05}
                    defaultValue={0}
                    onChange={handleSeekBar}
                    className="ev2-seek-bar"
                    aria-label="Evidence Seek Bar"
                  />
                  <div
                    className="ev2-event-marker"
                    style={{ left: `${markerPct}%` }}
                    title={`Detection moment at T+${fmt(timestampSec)}`}
                  />
                </div>

                <span className="ev2-time font-mono">
                  {fmt(clipEndSec)}
                </span>

                {/* Playback speed selector */}
                <select
                  className="ev2-speed-select font-mono"
                  value={playbackRate}
                  onChange={handleSpeedChange}
                  title="Playback Speed"
                  aria-label="Playback Speed"
                >
                  <option value="0.5">0.5x</option>
                  <option value="1">1x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>

                <button
                  type="button"
                  className="ev2-ctrl-btn"
                  onClick={handleMuteToggle}
                  title="Mute / Unmute"
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>

                <button
                  type="button"
                  className="ev2-ctrl-btn"
                  onClick={handleFullscreen}
                  title="Fullscreen"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>

            {/* Caption */}
            <div className="ev2-video-caption font-mono">
              ▶ Playing from T+{fmt(clipStartSec)} &nbsp;│&nbsp; Detection at T+{fmt(timestampSec)}&nbsp;
              <span style={{ color: "#22c55e" }}>(−{Math.round(actualPreRoll)}s pre-roll)</span>
              &nbsp;│&nbsp; Evidence Clip ({effectiveDuration}s)
            </div>
          </div>

          {/* ── RIGHT: META PANEL ── */}
          <div className="ev2-meta-col">

            {/* Blacklist alert or Verified Sighting */}
            {isBlacklisted ? (
              <div className="evidence-blacklist-alert-box">
                <ShieldAlert size={18} className="alert-red-icon" />
                <div>
                  <div className="alert-box-headline">ACTIVE BLACKLISTED TARGET</div>
                  <div className="alert-box-sub">{reason || "Flagged vehicle under active surveillance"}</div>
                </div>
              </div>
            ) : (
              <div className="evidence-normal-audit-box">
                <ShieldCheck size={18} className="check-green-icon" />
                <div>
                  <div className="audit-box-headline">VERIFIED OBSERVATION RECORD</div>
                  <div className="audit-box-sub">Registered in MySQL <code>plate_detections</code></div>
                </div>
              </div>
            )}

            {/* Plate card */}
            <div className="evidence-plate-hero-card font-mono">
              <div className="plate-ind-side"><span>I</span><span>N</span><span>D</span></div>
              <div className="plate-hero-text">{plate}</div>
              <div className="plate-conf-badge">{confPercent}% CONF</div>
            </div>


            {/* Spec grid */}
            <div className="evidence-specs-grid font-mono">
              <div className="spec-item">
                <span className="spec-lbl">JUNCTION / CORRIDOR</span>
                <span className="spec-val highlight-title">{canonicalJunctionName}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">CAMERA NODE</span>
                <span className="spec-val">{canonicalCameraName}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">DETECTION TIME</span>
                <span className="spec-val highlight-amber">T+{fmt(timestampSec)}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">PRE-ROLL START</span>
                <span className="spec-val highlight-green">T+{fmt(clipStartSec)}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">VEHICLE TYPE</span>
                <span className="spec-val spec-capitalize">{vehicleType}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">EVIDENCE STATUS</span>
                <span className="spec-val highlight-green" style={{ fontSize: "10px" }}>
                  Verified Active CCTV Clip
                </span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">DETECTION ACTION</span>
                <span className="spec-val" style={{ fontSize: "10px", color: "#38bdf8" }}>
                  Auto-Pause on Arrival
                </span>
              </div>
            </div>

            {/* Note */}
            <div className="evidence-preroll-note font-mono">
              <Clock size={13} className="preroll-clock-icon" />
              <span>
                Video starts <strong>5 s before</strong> detection. Auto-pauses when target vehicle appears at T+{fmt(timestampSec)}.
              </span>
            </div>
          </div>

        </div>{/* end body */}
      </div>
    </div>,
    document.body
  );
}
