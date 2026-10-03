import React from "react";
import {
  Video,
  Scan,
  Cpu,
  Layers,
  ScanLine,
  GitMerge,
  Fingerprint,
  Map,
  LineChart,
  ShieldAlert,
} from "lucide-react";

export function AiPipelineVisualizer() {
  const steps = [
    { num: "01", name: "CCTV Input", tech: "H.264 Sync Video Streams", icon: Video },
    { num: "02", name: "Vehicle Detection", tech: "YOLO11n Ultralytics Model", icon: Scan },
    { num: "03", name: "Multi-Object Tracking", tech: "ByteTrack Associator (Kalman)", icon: Cpu },
    { num: "04", name: "Vehicle Re-ID", tech: "Deep Feature Embeddings", icon: Layers },
    { num: "05", name: "ANPR / OCR", tech: "Plate YOLO + PaddleOCR", icon: ScanLine },
    { num: "06", name: "Cross-Camera Matching", tech: "Spatiotemporal Gating", icon: GitMerge },
    { num: "07", name: "Global Identity", tech: "Entity Resolution Graph", icon: Fingerprint },
    { num: "08", name: "Trajectory Reconstruction", tech: "Geospatial Route Mapping", icon: Map },
    { num: "09", name: "Traffic Analytics", tech: "OD Matrix & Relative Congestion", icon: LineChart },
    { num: "10", name: "Alert & Intelligence", tech: "Watchlist & Anomaly Engine", icon: ShieldAlert },
  ];

  return (
    <section className="pipeline-architecture-section">
      <div className="section-header-block" style={{ marginBottom: "0" }}>
        <div>
          <div className="section-eyebrow">Technical Pipeline Architecture</div>
          <h2 className="section-main-heading">10-Stage End-to-End AI Architecture</h2>
          <p className="section-subtext">
            Multi-stage pipeline executing real-time detection, tracking, ANPR, cross-camera entity resolution, and city intelligence.
          </p>
        </div>
      </div>

      <div className="pipeline-rail-scroll">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.num} className="pipeline-stage-card">
              <span className="stage-number-pill font-mono">{s.num}</span>
              <div className="stage-icon-box">
                <Icon size={14} />
              </div>
              <h4 className="stage-title">{s.name}</h4>
              <span className="stage-tech-tag font-mono">{s.tech}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
