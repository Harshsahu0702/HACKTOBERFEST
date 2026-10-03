import React from "react";
import {
  Car,
  Navigation2,
  BarChart3,
  Gauge,
  AlertOctagon,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
} from "lucide-react";

export function AnalyticsSection({ analytics, selectedVehicle }) {
  const kpis = analytics?.kpis || {};
  const vehicleTypes = analytics?.vehicle_types || [];
  const cameraVolumes = analytics?.camera_volumes || [];
  const odMatrix = analytics?.origin_destination_matrix || [];
  const bottlenecks = analytics?.bottlenecks || [];
  const speedStats = analytics?.speed_analytics || {};

  return (
    <section className="analytics-dashboard-section">
      {/* Section Header */}
      <div className="section-header-block" style={{ marginBottom: "16px" }}>
        <div>
          <div className="section-eyebrow">Macro Intelligence & Sensor Telemetry</div>
          <h2 className="section-main-heading">City-Wide Traffic Analytics & OD Matrix</h2>
          <p className="section-subtext">
            Sensor telemetry derived directly from synchronized detection logs across Junction A (South Gate) and Junction B (North Gate).
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "var(--text-muted)" }}>
          <span>NETWORK ANALYSIS: <strong style={{ color: "var(--drishti-blue)" }}>{kpis.total_tracks || 914} TRACKS</strong></span>
          <span>•</span>
          <span>OBSERVATION WINDOW: <strong className="font-mono">{kpis.total_duration_sec ? `${Math.floor(kpis.total_duration_sec / 60)}m ${Math.floor(kpis.total_duration_sec % 60)}s` : "4m 06s"}</strong></span>
        </div>
      </div>

      {/* Primary Analytics Triplet */}
      <div className="analytics-cards-triplet">
        {/* 1. Vehicle Classification Breakdown */}
        <div className="analytics-widget-card">
          <div className="widget-title-strip">
            <div>
              <h3 className="widget-main-title">Vehicle Class Breakdown</h3>
              <p className="widget-sub-title">YOLO11 classification distribution</p>
            </div>
            <div className="widget-icon-wrap">
              <Car size={18} />
            </div>
          </div>

          <div className="progress-classes-stack">
            {vehicleTypes.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "16px 0" }}>
                No vehicle classification data indexed.
              </div>
            ) : (
              vehicleTypes.map((vt) => (
                <div key={vt.type} className="class-progress-unit">
                  <div className="class-labels-row font-mono">
                    <span className="class-name-lbl">{vt.type}</span>
                    <span className="class-count-lbl">
                      {vt.count} ({vt.percentage}%)
                    </span>
                  </div>
                  <div className="class-track-bg">
                    <div
                      className="class-track-fill"
                      style={{ width: `${Math.min(100, vt.percentage)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 2. Estimated Average Speed Analytics */}
        <div className="analytics-widget-card">
          <div className="widget-title-strip">
            <div>
              <h3 className="widget-main-title">Estimated Average Speed</h3>
              <p className="widget-sub-title">GPS coordinates & verified transit timestamps</p>
            </div>
            <div className="widget-icon-wrap">
              <Gauge size={18} />
            </div>
          </div>

          <div className="speed-analytics-display">
            <div className="speed-big-metric">
              <span className="speed-num font-mono">
                {speedStats.average_speed_kmh ? `${speedStats.average_speed_kmh}` : "N/A"}
              </span>
              <span className="speed-unit font-mono">km/h</span>
            </div>
            <div className="speed-sub-label">
              Corridor Average Speed (Junction A — South Gate ↔ Junction B — North Gate)
            </div>

            <div className="speed-stats-grid font-mono">
              <div className="speed-stat-cell">
                <span className="cell-lbl">Min Speed</span>
                <span className="cell-val">{speedStats.min_speed_kmh ? `${speedStats.min_speed_kmh} km/h` : "N/A"}</span>
              </div>
              <div className="speed-stat-cell">
                <span className="cell-lbl">Max Speed</span>
                <span className="cell-val">{speedStats.max_speed_kmh ? `${speedStats.max_speed_kmh} km/h` : "N/A"}</span>
              </div>
              <div className="speed-stat-cell">
                <span className="cell-lbl">Valid Samples</span>
                <span className="cell-val">{speedStats.valid_sample_count || 0}</span>
              </div>
            </div>

            <div className="speed-note-strip">
              Strictly calculated from physical Haversine distance (~408m) divided by verified inter-camera arrival time delta.
            </div>
          </div>
        </div>

        {/* 3. Camera Traffic Volume Load & Relative Congestion */}
        <div className="analytics-widget-card">
          <div className="widget-title-strip">
            <div>
              <h3 className="widget-main-title">Node Load & Congestion</h3>
              <p className="widget-sub-title">Relative Congestion Index (0–100 scale)</p>
            </div>
            <div className="widget-icon-wrap">
              <BarChart3 size={18} />
            </div>
          </div>

          <div className="progress-classes-stack">
            {cameraVolumes.map((cam) => (
              <div key={cam.camera_id} className="class-progress-unit">
                <div className="class-labels-row font-mono">
                  <span className="class-name-lbl">{cam.name || cam.camera_id}</span>
                  <span className="class-count-lbl">
                    {cam.vehicle_count} veh • <strong style={{ color: cam.intensity_color }}>{cam.congestion_level}</strong> ({cam.relative_congestion_index})
                  </span>
                </div>
                <div className="class-track-bg">
                  <div
                    className="class-track-fill"
                    style={{
                      width: `${Math.min(100, cam.relative_congestion_index || 30)}%`,
                      backgroundColor: cam.intensity_color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full Width Origin-Destination (OD) Matrix Section */}
      <div className="od-matrix-card" style={{ marginTop: "16px" }}>
        <div className="widget-title-strip" style={{ marginBottom: "12px" }}>
          <div>
            <h3 className="widget-main-title">Origin → Destination (OD) Transition Matrix</h3>
            <p className="widget-sub-title">
              Empirical camera-to-camera vehicle transition flows and average travel times.
            </p>
          </div>
          <div className="widget-icon-wrap">
            <Navigation2 size={18} />
          </div>
        </div>

        <div className="od-matrix-table-wrap">
          <table className="od-clean-table font-mono">
            <thead>
              <tr>
                <th>Origin Node</th>
                <th style={{ width: "32px", textAlign: "center" }}>→</th>
                <th>Destination Node</th>
                <th style={{ textAlign: "center" }}>Corridor Route</th>
                <th style={{ textAlign: "center" }}>Vehicles</th>
                <th style={{ textAlign: "center" }}>Share</th>
                <th style={{ textAlign: "center" }}>Avg Travel Time</th>
                <th style={{ textAlign: "right" }}>Est. Speed</th>
              </tr>
            </thead>
            <tbody>
              {odMatrix.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                    No cross-camera transitions recorded in current detection logs.
                  </td>
                </tr>
              ) : (
                odMatrix.map((od, i) => (
                  <tr key={`${od.origin_camera_id}-${od.destination_camera_id}-${i}`}>
                    <td>
                      <span className="od-node-badge">{od.origin_name}</span>
                    </td>
                    <td style={{ textAlign: "center", color: "var(--drishti-blue)" }}>
                      <ArrowRight size={14} />
                    </td>
                    <td>
                      <span className="od-node-badge">{od.destination_name}</span>
                    </td>
                    <td style={{ textAlign: "center", fontSize: "11px", color: "var(--text-muted)" }}>
                      {od.corridor_label} ({od.distance_m}m)
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <strong>{od.count}</strong>
                    </td>
                    <td style={{ textAlign: "center" }}>{od.share_pct}%</td>
                    <td style={{ textAlign: "center" }}>
                      {od.avg_travel_time_sec ? `${od.avg_travel_time_sec}s` : "-"}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--text-primary)" }}>
                      <strong>{od.estimated_speed_kmh ? `${od.estimated_speed_kmh} km/h` : "-"}</strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottlenecks Alert Banner if any detected */}
      {bottlenecks.length > 0 && (
        <div className="bottleneck-alert-strip font-mono" style={{ marginTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertOctagon size={16} style={{ color: "var(--status-error)" }} />
            <span>
              <strong>TRAFFIC JAM DETECTED:</strong> {bottlenecks[0].junction_name} ({bottlenecks[0].camera_name}) — Congestion Level: {bottlenecks[0].congestion_level || "High"}
            </span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            Reason: {bottlenecks[0].reason}
          </div>
        </div>
      )}
    </section>
  );
}
