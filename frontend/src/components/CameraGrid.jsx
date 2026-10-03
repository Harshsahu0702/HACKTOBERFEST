import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
} from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Radio,
  Clock,
  Video,
  Link,
  RotateCcw,
  Check,
  X,
} from "lucide-react";
import {
  api,
  formatTimestampSec,
  getCanonicalCameraName,
  getCanonicalJunctionName,
} from "../services/api";

export const CameraGrid = forwardRef(function CameraGrid(
  { cameras, onCameraSelect, selectedCameraId, isBackgroundPaused = false },
  ref
) {
  const videoRefs = useRef({});
  const pendingSeeks = useRef({});
  const pausedByModalRef = useRef({});

  const [playingStates, setPlayingStates] = useState({});
  const [mutedStates, setMutedStates] = useState({});
  const [currentTimes, setCurrentTimes] = useState({});
  const [activeEventHighlight, setActiveEventHighlight] = useState(null);

  // Judge / Live Custom Stream Link State
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [liveClockTime, setLiveClockTime] = useState(() =>
    new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClockTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [customStreamUrls, setCustomStreamUrls] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("drishti_custom_camera_streams") || "{}");
    } catch (_) {
      return {};
    }
  });
  const [targetCamForStream, setTargetCamForStream] = useState("junction_A_camera_01");
  const [streamInputUrl, setStreamInputUrl] = useState("");
  const [streamSuccessMsg, setStreamSuccessMsg] = useState("");

  const handleApplyCustomStream = (e) => {
    e.preventDefault();
    if (!streamInputUrl.trim()) return;
    const updated = {
      ...customStreamUrls,
      [targetCamForStream]: streamInputUrl.trim(),
    };
    setCustomStreamUrls(updated);
    try {
      localStorage.setItem("drishti_custom_camera_streams", JSON.stringify(updated));
    } catch (_) { }
    setStreamSuccessMsg(`Custom stream connected to ${getCanonicalCameraName(targetCamForStream)}!`);
    setTimeout(() => {
      setStreamSuccessMsg("");
      setShowStreamModal(false);
      setStreamInputUrl("");
    }, 1200);
  };

  const handleResetStream = (camId) => {
    const updated = { ...customStreamUrls };
    delete updated[camId];
    setCustomStreamUrls(updated);
    try {
      localStorage.setItem("drishti_custom_camera_streams", JSON.stringify(updated));
    } catch (_) { }
  };

  // Pause all background CCTV videos when evidence modal opens; resume when it closes
  useEffect(() => {
    if (isBackgroundPaused) {
      Object.entries(videoRefs.current).forEach(([camId, vid]) => {
        if (vid && !vid.paused) {
          pausedByModalRef.current[camId] = true;
          vid.pause();
          setPlayingStates((prev) => ({ ...prev, [camId]: false }));
        }
      });
    } else {
      const toResume = { ...pausedByModalRef.current };
      pausedByModalRef.current = {};
      Object.entries(toResume).forEach(([camId, wasPlaying]) => {
        if (wasPlaying) {
          const vid = videoRefs.current[camId];
          if (vid && vid.paused) {
            vid
              .play()
              .then(() => {
                setPlayingStates((prev) => ({ ...prev, [camId]: true }));
              })
              .catch(() => { });
          }
        }
      });
    }
  }, [isBackgroundPaused]);

  const cameraList = Object.values(cameras || {});

  // Group cameras by canonical junction metadata
  const groupedJunctions = cameraList.reduce((groups, cam) => {
    const scene = getCanonicalJunctionName(cam.scene || cam.junction_name || cam.junction_id);
    if (!groups[scene]) {
      groups[scene] = [];
    }
    groups[scene].push(cam);
    return groups;
  }, {});

  const junctions = Object.entries(groupedJunctions);

  // Apply seek if video metadata wasn't loaded when seek was requested
  const applyPendingSeek = (camId) => {
    const vid = videoRefs.current[camId];
    const pending = pendingSeeks.current[camId];

    if (!vid || !pending || !Number.isFinite(vid.duration)) {
      return;
    }

    const target = Math.max(
      0,
      Math.min(pending.timestamp, vid.duration || pending.timestamp)
    );

    vid.currentTime = target;
    delete pendingSeeks.current[camId];

    vid
      .play()
      .then(() => {
        setPlayingStates((prev) => ({
          ...prev,
          [camId]: true,
        }));
      })
      .catch((err) => {
        console.warn(`Could not play camera ${camId}:`, err);
        setPlayingStates((prev) => ({
          ...prev,
          [camId]: false,
        }));
      });
  };

  // Expose seekAndPlay to App.jsx through ref
  useImperativeHandle(ref, () => ({
    seekAndPlay: (cameraId, timestampSeconds, eventLabel = "", extra = {}) => {
      const vid = videoRefs.current[cameraId];

      if (!vid) {
        console.warn(`Camera video element not mounted: ${cameraId}`);
        return;
      }

      const timestamp = Math.max(0, Number(timestampSeconds) || 0);

      if (vid.readyState < 1 || !Number.isFinite(vid.duration)) {
        pendingSeeks.current[cameraId] = {
          timestamp,
          eventLabel,
          extra,
        };
      } else {
        const target = Math.min(timestamp, vid.duration || timestamp);
        vid.currentTime = Math.max(0, target);

        vid
          .play()
          .then(() => {
            setPlayingStates((prev) => ({
              ...prev,
              [cameraId]: true,
            }));
          })
          .catch((err) => {
            console.warn(`Could not autoplay camera ${cameraId}:`, err);
            setPlayingStates((prev) => ({
              ...prev,
              [cameraId]: false,
            }));
          });
      }

      // Default bounding boxes per camera if detection doesn't supply one
      const defaultBboxByCamera = {
        junction_A_camera_01: { x: 38, y: 46, width: 24, height: 26 },
        junction_A_camera_02: { x: 34, y: 48, width: 26, height: 28 },
        junction_B_camera_01: { x: 42, y: 42, width: 22, height: 25 },
        junction_B_camera_02: { x: 36, y: 44, width: 25, height: 27 },
      };

      const finalBbox = extra.bbox || defaultBboxByCamera[cameraId] || { x: 36, y: 44, width: 26, height: 26 };

      setActiveEventHighlight({
        cameraId,
        timestamp,
        originalTimestamp: extra.originalTimestamp || timestamp + 3,
        label: eventLabel,
        plate: extra.plate || eventLabel,
        vehicleType: extra.vehicleType || "car",
        bbox: finalBbox,
        expiresAt: Date.now() + 10000,
      });

      window.setTimeout(() => {
        setActiveEventHighlight((current) =>
          current?.cameraId === cameraId ? null : current
        );
      }, 10000);

      requestAnimationFrame(() => {
        const cardElem = document.getElementById(`camera-card-${cameraId}`);
        if (cardElem) {
          cardElem.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
      });
    },
  }));

  const togglePlay = async (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;

    try {
      if (vid.paused) {
        await vid.play();
        setPlayingStates((prev) => ({ ...prev, [camId]: true }));
      } else {
        vid.pause();
        setPlayingStates((prev) => ({ ...prev, [camId]: false }));
      }
    } catch (err) {
      console.warn(`Play/pause toggle error for ${camId}:`, err);
    }
  };

  const toggleMute = (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;
    const newMuted = !vid.muted;
    vid.muted = newMuted;
    setMutedStates((prev) => ({ ...prev, [camId]: newMuted }));
  };

  const handleSeek = (camId, e) => {
    const vid = videoRefs.current[camId];
    if (!vid || !Number.isFinite(vid.duration) || vid.duration <= 0) return;

    const percent = parseFloat(e.target.value);
    const target = (percent / 100) * vid.duration;
    vid.currentTime = target;
    setCurrentTimes((prev) => ({ ...prev, [camId]: target }));
  };

  const toggleFullscreen = (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;

    if (!document.fullscreenElement) {
      vid.requestFullscreen?.().catch((err) => console.warn(err));
    } else {
      document.exitFullscreen?.().catch((err) => console.warn(err));
    }
  };

  const handleTimeUpdate = (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;
    setCurrentTimes((prev) => ({ ...prev, [camId]: vid.currentTime }));
  };

  const handleVideoReady = (camId) => {
    applyPendingSeek(camId);
  };

  const handleAutoPlay = (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;

    applyPendingSeek(camId);

    if (vid.paused) {
      vid
        .play()
        .then(() => {
          setPlayingStates((prev) => ({ ...prev, [camId]: true }));
        })
        .catch(() => {
          // Autoplay blocked by browser policy without user interaction
        });
    }
  };

  return (
    <section className="camera-network-section">
      {/* Section Header */}
      <div className="section-header-block" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div className="section-eyebrow">Synchronized CCTV Feeds</div>

        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Running Live IST Surveillance Clock */}
          <div
            className="camera-live-clock font-mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "6px 12px",
              borderRadius: "6px",
              background: "#FFFFFF",
              border: "1px solid rgba(180, 135, 90, 0.28)",
              color: "#1E293B",
              fontSize: "12px",
              fontWeight: 700,
              boxShadow: "0 1px 3px rgba(45, 30, 15, 0.05)",
              letterSpacing: "0.03em",
            }}
            title="Real-Time Synchronized CCTV Clock (IST)"
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#10B981",
                boxShadow: "0 0 6px #10B981",
                display: "inline-block",
              }}
            />
            <span>{liveClockTime} IST</span>
          </div>

          <button
            type="button"
            className="btn-configure-stream font-mono"
            onClick={() => setShowStreamModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "6px",
              background: "rgba(2, 132, 199, 0.15)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              color: "#38bdf8",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Link size={13} />
            <span>CONNECT LIVE STREAM / URL</span>
          </button>
        </div>
      </div>

      {/* Two-Junction Responsive Layout */}
      <div className="camera-grid-two-junctions">
        {junctions.map(([scene, sceneCameras]) => (
          <div className="junction-group-card" key={scene}>
            {/* Junction Header */}
            <div className="junction-group-header">
              <div className="junction-title-cluster">
                <div className="junction-icon-badge">
                  <Radio size={16} />
                </div>
                <div>
                  <div className="junction-name-text">{scene}</div>
                  <div className="junction-sub-info">
                    {sceneCameras.length} Synchronized Camera Feeds
                  </div>
                </div>
              </div>
            </div>

            {/* Cameras Duo Inside Junction */}
            <div className="junction-cameras-duo">
              {sceneCameras.map((cam) => {
                const isSelected = selectedCameraId === cam.id;
                const isHighlighted =
                  activeEventHighlight?.cameraId === cam.id &&
                  Date.now() < activeEventHighlight.expiresAt;

                const vid = videoRefs.current[cam.id];
                const currentTime = currentTimes[cam.id] || 0;
                const duration =
                  vid && Number.isFinite(vid.duration) && vid.duration > 0
                    ? vid.duration
                    : 210;

                const progress =
                  duration > 0
                    ? Math.max(0, Math.min(100, (currentTime / duration) * 100))
                    : 0;

                const videoUrl = customStreamUrls[cam.id] || api.getCameraVideoUrl(cam.id, "grid");
                const canonicalTitle = getCanonicalCameraName(cam.id, cam.name || cam.camera_name);

                return (
                  <div
                    key={cam.id}
                    id={`camera-card-${cam.id}`}
                    className={`camera-unit-card ${isSelected ? "is-selected" : ""
                      } ${isHighlighted ? "is-highlighted" : ""}`}
                    onClick={() => onCameraSelect && onCameraSelect(cam.id)}
                  >
                    {/* Unit Header */}
                    <div className="camera-unit-header">
                      <div className="camera-name-code">
                        <span className="cam-badge-tag">{canonicalTitle}</span>
                        <span className="cam-road-sub">• {scene}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {customStreamUrls[cam.id] && (
                          <span
                            className="font-mono"
                            style={{
                              fontSize: "9px",
                              fontWeight: 800,
                              background: "rgba(245, 158, 11, 0.2)",
                              color: "#f59e0b",
                              border: "1px solid rgba(245, 158, 11, 0.4)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                            title="Custom stream feed active"
                          >
                            CUSTOM
                          </span>
                        )}
                        <span
                          className="font-mono"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "10px",
                            fontWeight: 800,
                            letterSpacing: "0.05em",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: "rgba(16, 185, 129, 0.15)",
                            border: "1px solid rgba(16, 185, 129, 0.35)",
                            color: "#34d399",
                          }}
                        >
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background: "#10b981",
                              boxShadow: "0 0 6px #10b981",
                            }}
                          />
                          LIVE
                        </span>
                      </div>
                    </div>

                    {/* Video Viewport */}
                    <div className="camera-video-container">
                      <video
                        key={`${cam.id}-${videoUrl}`}
                        ref={(el) => {
                          videoRefs.current[cam.id] = el;
                        }}
                        src={videoUrl}
                        className="camera-html-video"
                        muted={mutedStates[cam.id] ?? true}
                        autoPlay
                        playsInline
                        loop
                        controls={false}
                        preload="auto"
                        onLoadedMetadata={() => handleVideoReady(cam.id)}
                        onCanPlay={() => {
                          handleVideoReady(cam.id);
                          handleAutoPlay(cam.id);
                        }}
                        onLoadedData={() => handleAutoPlay(cam.id)}
                        onTimeUpdate={() => handleTimeUpdate(cam.id)}
                        onPlay={() =>
                          setPlayingStates((prev) => ({
                            ...prev,
                            [cam.id]: true,
                          }))
                        }
                        onPause={() =>
                          setPlayingStates((prev) => ({
                            ...prev,
                            [cam.id]: false,
                          }))
                        }
                        onEnded={() =>
                          setPlayingStates((prev) => ({
                            ...prev,
                            [cam.id]: false,
                          }))
                        }
                      />

                      {/* Evidence Highlight Badge & Vehicle Target Bounding Box */}
                      {isHighlighted && activeEventHighlight && (
                        <>
                          <div className="video-overlay-evidence-playing font-mono">
                            <span className="rec-beacon-dot"></span>
                            <span>▶ EVIDENCE PLAYBACK (SIGHTING @ T+{formatTimestampSec(activeEventHighlight.originalTimestamp || activeEventHighlight.timestamp)})</span>
                            {activeEventHighlight.plate && (
                              <span className="evidence-plate-tag">{activeEventHighlight.plate}</span>
                            )}
                          </div>

                          {/* Bounding Box Highlighting the Particular Vehicle */}
                          <div
                            className="video-target-bounding-box"
                            style={{
                              left: `${activeEventHighlight.bbox?.x ?? 36}%`,
                              top: `${activeEventHighlight.bbox?.y ?? 44}%`,
                              width: `${activeEventHighlight.bbox?.width ?? 26}%`,
                              height: `${activeEventHighlight.bbox?.height ?? 26}%`,
                            }}
                          >
                            <div className="target-corner top-left"></div>
                            <div className="target-corner top-right"></div>
                            <div className="target-corner bottom-left"></div>
                            <div className="target-corner bottom-right"></div>
                            <div className="target-label-plate font-mono">
                              <span className="target-aim-crosshair">⌖</span>
                              <span>TARGET: {activeEventHighlight.plate || "DETECTED VEHICLE"}</span>
                            </div>
                            <div className="target-pulse-scanline"></div>
                          </div>
                        </>
                      )}

                      {/* Timestamp Overlay */}
                      <div className="video-overlay-timestamp font-mono">
                        T+{formatTimestampSec(currentTime)}
                      </div>
                    </div>

                    {/* Controls Strip */}
                    <div className="camera-controls-strip">
                      <button
                        type="button"
                        className="cam-ctrl-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlay(cam.id);
                        }}
                        aria-label={playingStates[cam.id] ? "Pause" : "Play"}
                        title={playingStates[cam.id] ? "Pause" : "Play"}
                      >
                        {playingStates[cam.id] ? (
                          <Pause size={13} />
                        ) : (
                          <Play size={13} />
                        )}
                      </button>

                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        value={progress}
                        className="cam-seek-slider"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleSeek(cam.id, e)}
                        aria-label="Seek position"
                      />

                      <button
                        type="button"
                        className="cam-ctrl-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMute(cam.id);
                        }}
                        aria-label={mutedStates[cam.id] ? "Unmute" : "Mute"}
                        title={mutedStates[cam.id] ? "Unmute" : "Mute"}
                      >
                        {mutedStates[cam.id] ? (
                          <VolumeX size={13} />
                        ) : (
                          <Volume2 size={13} />
                        )}
                      </button>

                      <button
                        type="button"
                        className="cam-ctrl-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFullscreen(cam.id);
                        }}
                        aria-label="Fullscreen"
                        title="Fullscreen"
                      >
                        <Maximize2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* CUSTOM STREAM / JUDGE FEED MODAL */}
      {showStreamModal && (
        <div
          className="evidence-modal-backdrop"
          style={{ zIndex: 9999 }}
          onClick={() => setShowStreamModal(false)}
        >
          <div
            className="evidence-playback-modal-box font-mono"
            style={{ maxWidth: "580px", background: "#0B1120", border: "1.5px solid #0284C7", borderRadius: "10px", padding: "24px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Link size={18} style={{ color: "#38BDF8" }} />
                <h3 style={{ margin: 0, fontSize: "15px", color: "#F8FAFC", fontWeight: 700 }}>
                  CONNECT CUSTOM CCTV / RTSP FEED
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowStreamModal(false)}
                style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: "18px" }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "#94A3B8", lineHeight: 1.5, marginBottom: "16px" }}>
              Judges / Evaluators can attach any live web stream URL, direct MP4 file, or HTTP RTSP relay feed to any of the 4 CCTV channels.
            </p>

            <form onSubmit={handleApplyCustomStream}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#38BDF8", marginBottom: "6px" }}>
                  SELECT TARGET SURVEILLANCE CAMERA:
                </label>
                <select
                  value={targetCamForStream}
                  onChange={(e) => setTargetCamForStream(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#1E293B",
                    border: "1px solid #334155",
                    color: "#F8FAFC",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                >
                  <option value="junction_A_camera_01">Junction A — Camera 01 (Inbound Entry)</option>
                  <option value="junction_A_camera_02">Junction A — Camera 02 (Outbound Exit)</option>
                  <option value="junction_B_camera_01">Junction B — Camera 01 (Inbound Entry)</option>
                  <option value="junction_B_camera_02">Junction B — Camera 02 (Outbound Exit)</option>
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#38BDF8", marginBottom: "6px" }}>
                  ENTER VIDEO / STREAM URL (.mp4, .m3u8, web stream):
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/cctv_live_feed.mp4"
                  value={streamInputUrl}
                  onChange={(e) => setStreamInputUrl(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#1E293B",
                    border: "1px solid #334155",
                    color: "#F8FAFC",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  required
                />
              </div>

              {streamSuccessMsg && (
                <div style={{ padding: "8px 12px", background: "rgba(16, 185, 129, 0.2)", border: "1px solid #10B981", borderRadius: "5px", color: "#34D399", fontSize: "11px", marginBottom: "14px" }}>
                  ✓ {streamSuccessMsg}
                </div>
              )}

              {/* Active overrides list */}
              {Object.keys(customStreamUrls).length > 0 && (
                <div style={{ marginBottom: "16px", padding: "10px", background: "#1E293B", borderRadius: "6px", border: "1px solid #334155" }}>
                  <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#F59E0B", marginBottom: "6px" }}>
                    CURRENT ACTIVE CUSTOM OVERRIDES:
                  </div>
                  {Object.entries(customStreamUrls).map(([cid, url]) => (
                    <div key={cid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#CBD5E1", marginBottom: "4px" }}>
                      <span>{getCanonicalCameraName(cid)}</span>
                      <button
                        type="button"
                        onClick={() => handleResetStream(cid)}
                        style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "2px 6px", borderRadius: "3px", fontSize: "10px", cursor: "pointer" }}
                      >
                        Reset to Default
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowStreamModal(false)}
                  style={{ padding: "8px 16px", borderRadius: "6px", background: "#334155", border: "none", color: "#F8FAFC", fontSize: "12px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: "8px 18px", borderRadius: "6px", background: "#0284C7", border: "none", color: "#FFFFFF", fontWeight: 700, fontSize: "12px", cursor: "pointer" }}
                >
                  Apply Live Feed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
});
