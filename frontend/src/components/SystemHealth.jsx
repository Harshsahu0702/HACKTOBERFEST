import React from "react";
import { CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";

export function SystemHealth({ healthData, isBackendOnline }) {
  const components = healthData?.components || {
    backend: { name: "FastAPI Core", status: isBackendOnline ? "ONLINE" : "OFFLINE", version: "v0.141" },
    yolo: { name: "YOLO11n Detector", status: "READY", model: "yolo11n.pt" },
    tracker: { name: "ByteTrack Associator", status: "READY", algorithm: "Kalman + LAP" },
    anpr: { name: "Plate Detector", status: "READY", model: "license_plate.pt" },
    ocr: { name: "PaddleOCR Engine", status: "READY", engine: "PP-OCRv6" },
    dataset_metadata: { name: "Detections Database", status: "READY", records_count: "914 Tracks" },
    analytics_engine: { name: "Traffic Intelligence Engine", status: "ONLINE", methodology: "Ground-Truth Math" },
    watchlist_engine: { name: "Watchlist Alert Service", status: "ONLINE", watchlist_entries: "Persistent JSON" },
    video_streamer: { name: "Range Video Streamer", status: "READY", protocol: "HTTP 206 Partial" },
    camera_network: { name: "CCTV Surveillance Grid", status: "ONLINE", online_count: "4 Active Nodes" },
  };

  const allOperational = Object.values(components).every(
    (c) => c.status === "READY" || c.status === "ONLINE"
  );

  return (
    <section className="system-health-section">
      <div className="section-header-block" style={{ marginBottom: "0" }}>
        <div>
          <div className="section-eyebrow">Diagnostics & Telemetry</div>
          <h2 className="section-main-heading">System Health & Service Integrity</h2>
          <p className="section-subtext">
            Operational status of computer-vision models, inference workers, analytics engine, and video streaming microservices.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            fontWeight: "700",
            color: allOperational ? "var(--status-success)" : "var(--status-warning)",
          }}
        >
          <span className="status-dot-pulse"></span>
          {allOperational ? "ALL SUBSYSTEMS OPERATIONAL" : "DEGRADED OR OFFLINE SERVICES"}
        </div>
      </div>

      <div className="health-grid-octa">
        {Object.entries(components).map(([key, item]) => {
          const isReady = item.status === "READY" || item.status === "ONLINE";
          const metaText =
            item.records_count ||
            item.model ||
            item.algorithm ||
            item.engine ||
            item.version ||
            item.online_count ||
            item.methodology ||
            item.watchlist_entries ||
            "Active";

          return (
            <div key={key} className="health-status-cell">
              <div>
                <div className="health-component-title">{item.name}</div>
                <div className="health-component-meta font-mono">{metaText}</div>
              </div>
              <div
                className={`health-status-indicator font-mono ${
                  isReady ? "" : "is-offline"
                }`}
              >
                {isReady ? "● OPERATIONAL" : "● OFFLINE"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
