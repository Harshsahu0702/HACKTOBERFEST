import React, { useState } from "react";
import {
  X,
  Video,
  Radio,
  Eye,
  Maximize2,
  Activity,
  Compass,
  Shield,
  Layers,
  Sparkles,
  ChevronRight,
  Play,
  RotateCcw,
} from "lucide-react";
import { api } from "../services/api";

export function JunctionCameraInspector({
  junction,
  allJunctions = [],
  onSelectJunction,
  onClose,
  onCameraSelect,
  onPlayEvent,
  isModalMode = false,
}) {
  const [activeCamTab, setActiveCamTab] = useState(null);

  if (!junction) return null;

  const cameras = junction.cameras || [];
  const totalCams = cameras.length;

  return (
    <div className={`junction-camera-matrix-overlay ${isModalMode ? "matrix-modal-mode" : ""}`}>
      {/* MATRIX TOP COMMAND BAR */}
      <div className="junc-matrix-header">
        <div className="junc-matrix-title-wrap">
          <div className="junc-matrix-code-badge font-mono">
            <span className="junc-live-glow-dot"></span>
            <span>{junction.code || "JUNCTION"}</span>
            <span className="junc-meta-sep">•</span>
            <span>SECTOR NODE</span>
          </div>

          <div>
            <h3 className="junc-matrix-name font-sans">{junction.name}</h3>
            <div className="junc-matrix-coords font-mono">
              <Compass size={12} className="text-emerald" />
              <span>GPS: {Number(junction.lat).toFixed(5)}° N, {Number(junction.lng).toFixed(5)}° E</span>
              <span className="junc-meta-sep">•</span>
              <span>{junction.sector || "City Arterial Corridor"}</span>
              <span className="junc-meta-sep">•</span>
              <span style={{ color: "#34D399" }}>● {totalCams} CAMS SYNCHRONIZED</span>
            </div>
          </div>
        </div>

        {/* RIGHT ACTIONS: JUNCTION QUICK SWITCHER + CLOSE */}
        <div className="junc-matrix-actions">
          {/* Quick Switcher Between All City Junctions */}
          {allJunctions.length > 1 && (
            <div className="junc-switch-pill-group font-mono">
              {allJunctions.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className={`junc-switch-pill-btn ${j.id === junction.id ? "active" : ""}`}
                  onClick={() => onSelectJunction && onSelectJunction(j)}
                  title={`Switch to ${j.name}`}
                >
                  <span className="junc-pill-dot"></span>
                  <span>{j.shortName}</span>
                  <span className="junc-pill-count">({j.cameras?.length || 0})</span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="junc-matrix-close-btn font-mono"
            onClick={onClose}
            title="Close Junction Camera Matrix"
          >
            <X size={15} />
            <span>CLOSE</span>
          </button>
        </div>
      </div>

      {/* MATRIX LIVE TELEMETRY STRIP */}
      <div className="junc-telemetry-strip font-mono">
        <div className="junc-tel-cell">
          <span className="junc-tel-label">SURVEILLANCE CAMERAS</span>
          <span className="junc-tel-val text-cyan">
            <Video size={13} /> {totalCams} Optical Feeds Online
          </span>
        </div>
        <div className="junc-tel-cell">
          <span className="junc-tel-label">AGGREGATE VEHICLES</span>
          <span className="junc-tel-val text-amber">
            <Activity size={13} /> {junction.totalVehicles || 28} Total Logged
          </span>
        </div>
        <div className="junc-tel-cell">
          <span className="junc-tel-label">AVERAGE TRANSIT SPEED</span>
          <span className="junc-tel-val text-emerald">
            ⚡ {junction.avgSpeed || "48.5 km/h"}
          </span>
        </div>
        <div className="junc-tel-cell">
          <span className="junc-tel-label">CONGESTION STATUS</span>
          <span
            className="junc-tel-val"
            style={{ color: junction.congestionLevel === "HIGH" ? "#EF4444" : "#10B981" }}
          >
            ● {junction.congestionLevel || "NORMAL FLOW"}
          </span>
        </div>
      </div>

      {/* CRAZY MULTI-CAMERA CCTV FEED GRID FOR THIS JUNCTION */}
      <div className="junc-cams-grid">
        {cameras.map((cam, idx) => {
          const videoUrl = api.getCameraVideoUrl(cam.id, "grid");

          return (
            <div key={cam.id} className="junc-camera-card">
              {/* Camera CRT Video Viewport */}
              <div className="junc-video-viewport">
                {/* CRT Scanline & Lens Shimmer Overlay */}
                <div className="junc-video-scanlines" />

                {/* HUD Corner Reticle Brackets */}
                <div className="junc-reticle-tl" />
                <div className="junc-reticle-tr" />
                <div className="junc-reticle-bl" />
                <div className="junc-reticle-br" />

                {/* Top Video HUD Ticker */}
                <div className="junc-video-top-hud font-mono">
                  <div className="junc-cam-badge">
                    <span className="junc-rec-dot" />
                    <span>REC • {cam.id.toUpperCase()}</span>
                  </div>
                  <div className="junc-cam-spec-pill">
                    <span>{cam.fps || "60 FPS"}</span>
                    <span className="hud-sep">•</span>
                    <span>1080P AI</span>
                  </div>
                </div>

                {/* Real Live HTML5 CCTV Video Element */}
                <video
                  src={videoUrl}
                  className="junc-cctv-video"
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={(e) => {
                    // Gracefully hide element if stream not found, showing high-tech simulation
                    e.target.style.display = "none";
                  }}
                />

                {/* Simulated CCTV Radar Overlay / Fallback Graphic */}
                <div className="junc-video-fallback-grid">
                  <div className="junc-radar-sweep-line" />
                  <div className="junc-radar-target-reticle font-mono">
                    <span className="reticle-box" />
                    <span className="reticle-txt">ANPR OPTICAL LOCK [READY]</span>
                  </div>
                </div>

                {/* Bottom HUD Ticker */}
                <div className="junc-video-bottom-hud font-mono">
                  <div className="junc-approach-tag">
                    <span>DIR: {cam.direction || "TRAFFIC FLOW"}</span>
                  </div>
                  <div className="junc-stream-status">
                    <span>SENSOR: {cam.sensor || "SONY STARVIS II"}</span>
                  </div>
                </div>
              </div>

              {/* Camera Unit Info & Interactive Actions Footer */}
              <div className="junc-cam-card-footer">
                <div className="junc-cam-details">
                  <div className="junc-cam-name-lead font-sans">
                    <strong>{cam.name || cam.camera_name || cam.id}</strong>
                  </div>
                  <div className="junc-cam-sub-meta font-mono">
                    <span>{cam.vehicle_count || 14} Vehicles Observed</span>
                    <span className="junc-meta-sep">•</span>
                    <span>Speed: {cam.estimated_speed || "48"} km/h</span>
                  </div>
                </div>

                <div className="junc-cam-action-buttons">
                  <button
                    type="button"
                    className="btn-junc-focus font-mono"
                    onClick={() => {
                      if (onCameraSelect) onCameraSelect(cam.id);
                    }}
                    title="Focus this camera feed in DRISHTI Command Center"
                  >
                    <Eye size={13} />
                    <span>FOCUS CAM</span>
                  </button>

                  <button
                    type="button"
                    className="btn-junc-play font-mono"
                    onClick={() => {
                      if (onPlayEvent) {
                        onPlayEvent({
                          cameraId: cam.id,
                          timestamp: Date.now() / 1000,
                          plate: "LIVE_RECON",
                        });
                      } else if (onCameraSelect) {
                        onCameraSelect(cam.id);
                      }
                    }}
                    title="Inspect stream & evidence events"
                  >
                    <Play size={13} fill="currentColor" />
                    <span>INSPECT</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
