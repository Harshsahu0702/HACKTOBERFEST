import React from "react";
import { Car, GitMerge, MapPin, Radio, ScanLine, Gauge } from "lucide-react";

export function KpiStrip({ kpis }) {
  const metrics = [
    {
      id: "global_vehicles",
      label: "Global Vehicles",
      sub: "Unique tracked identities",
      value: kpis?.global_vehicles ?? kpis?.unique_plates ?? 0,
      icon: Car,
    },
    {
      id: "cross_camera_matches",
      label: "Cross-Camera Matches",
      sub: "Multi-node corridor transits",
      value: kpis?.cross_camera_matches ?? kpis?.multi_camera_matches ?? 0,
      icon: GitMerge,
    },
    {
      id: "trajectory_points",
      label: "Telemetry Tracks",
      sub: "CCTV detection records",
      value: kpis?.total_tracks ?? 0,
      icon: MapPin,
    },
    {
      id: "cameras_online",
      label: "Cameras Active",
      sub: "Synchronized surveillance grid",
      value: kpis?.cameras_online ?? 4,
      icon: Radio,
    },
    {
      id: "anpr_reads",
      label: "Plate Reads (ANPR)",
      sub: "OCR recognized plates",
      value: kpis?.total_detections ?? kpis?.anpr_reads ?? 0,
      icon: ScanLine,
    },
    {
      id: "avg_speed",
      label: "Est. Average Speed",
      sub: "GPS distance / arrival delta",
      value: kpis?.estimated_average_speed_kmh
        ? `${kpis.estimated_average_speed_kmh} km/h`
        : "N/A",
      icon: Gauge,
    },
  ];

  return (
    <section className="kpi-strip-section">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div key={m.id} className="kpi-stat-card">
            <div className="kpi-card-top">
              <span className="kpi-stat-label">{m.label}</span>
              <div className="kpi-stat-icon-wrap">
                <Icon size={14} />
              </div>
            </div>
            <div className="kpi-stat-value font-mono">{m.value}</div>
            <div className="kpi-stat-subtext">{m.sub}</div>
          </div>
        );
      })}
    </section>
  );
}
