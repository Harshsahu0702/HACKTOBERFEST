import React, { useState } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  Clock,
  Camera,
  Eye,
  Plus,
  Trash2,
  CheckCircle2,
  Compass,
  Flame,
  X
} from "lucide-react";
import { formatTime, formatTimestampSec } from "../services/api";

export function AlertCenter({
  alertsData,
  watchlist,
  onSelectVehicle,
  onPlayEvent,
  onFocusCamera,
  onAddToWatchlist,
  onRemoveFromWatchlist
}) {
  const [filterType, setFilterType] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newPriority, setNewPriority] = useState("HIGH");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const alerts = alertsData?.alerts || [];

  const filteredAlerts = alerts.filter((a) => {
    if (filterType === "all") return true;
    if (filterType === "blacklisted") return a.alert_type === "BLACKLISTED_VEHICLE" || a.alert_type === "MONITORED_VEHICLE";
    if (filterType === "anomaly") return a.alert_type === "ROUTE_ANOMALY" || a.alert_type === "TIMESTAMP_ANOMALY";
    if (filterType === "congestion") return a.alert_type === "TRAFFIC_CONGESTION";
    return true;
  });

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newPlate.trim()) return;
    setIsSubmitting(true);
    try {
      if (onAddToWatchlist) {
        await onAddToWatchlist(newPlate.trim().toUpperCase(), newReason.trim() || "Manual watchlist target", newPriority);
      }
      setNewPlate("");
      setNewReason("");
      setShowAddModal(false);
    } catch (err) {
      console.error("Failed to add to watchlist:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="alert-center-section">
      {/* Header Block */}
      <div className="section-header-block" style={{ marginBottom: 0 }}>
        <div>
          <div className="section-eyebrow">Real-Time Threat & Anomaly Surveillance</div>
          <h2 className="section-main-heading">Tactical Intelligence & Alert Center</h2>
          <p className="section-subtext">
            Autonomous threat detection matching recognized plates against watchlist database and kinematic anomaly triggers.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            className="watchlist-add-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={14} />
            <span>Manage Watchlist ({watchlist.length})</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs Strip */}
      <div className="alert-filter-bar">
        <div className="alert-filter-chips">
          <button
            type="button"
            className={`alert-chip ${filterType === "all" ? "is-active" : ""}`}
            onClick={() => setFilterType("all")}
          >
            All Alerts ({alerts.length})
          </button>
          <button
            type="button"
            className={`alert-chip ${filterType === "blacklisted" ? "is-active" : ""}`}
            onClick={() => setFilterType("blacklisted")}
          >
            <ShieldAlert size={13} style={{ display: "inline", marginRight: "4px" }} />
            Blacklisted Hits ({alertsData?.blacklisted_count || 0})
          </button>
          <button
            type="button"
            className={`alert-chip ${filterType === "anomaly" ? "is-active" : ""}`}
            onClick={() => setFilterType("anomaly")}
          >
            <Compass size={13} style={{ display: "inline", marginRight: "4px" }} />
            Route Anomalies ({alertsData?.anomaly_count || 0})
          </button>
          <button
            type="button"
            className={`alert-chip ${filterType === "congestion" ? "is-active" : ""}`}
            onClick={() => setFilterType("congestion")}
          >
            <Flame size={13} style={{ display: "inline", marginRight: "4px" }} />
            Traffic Jam Warnings ({alertsData?.congestion_count || 0})
          </button>
        </div>
      </div>

      {/* Alerts Grid / Cards */}
      <div className="alerts-feed-container">
        {filteredAlerts.length === 0 ? (
          <div className="alerts-empty-state">
            <CheckCircle2 size={32} style={{ color: "var(--status-success)" }} />
            <div style={{ fontWeight: 700, fontSize: "14px", marginTop: "8px" }}>
              No Active Alerts in this Category
            </div>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "12px" }}>
              All cameras normal. No blacklisted vehicles or route issues detected.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isBlacklist = alert.alert_type === "BLACKLISTED_VEHICLE" || alert.alert_type === "MONITORED_VEHICLE";
            const isAnomaly = alert.alert_type === "ROUTE_ANOMALY" || alert.alert_type === "TIMESTAMP_ANOMALY";
            const isCongestion = alert.alert_type === "TRAFFIC_CONGESTION";

            return (
              <div
                key={alert.alert_id}
                className={`alert-event-card ${
                  alert.priority === "HIGH" ? "is-high-priority" : "is-medium-priority"
                }`}
              >
                {/* Left Priority Indicator */}
                <div className="alert-badge-col">
                  {isBlacklist && <ShieldAlert size={20} className="text-status-red" />}
                  {isAnomaly && <Compass size={20} className="text-brand" />}
                  {isCongestion && <Flame size={20} className="text-warning" />}
                  <span className="alert-priority-tag font-mono">{alert.priority}</span>
                </div>

                {/* Center Content */}
                <div className="alert-info-col">
                  <div className="alert-title-row">
                    <span className="alert-category-label">
                      {isBlacklist && "BLACKLISTED VEHICLE DETECTED"}
                      {isAnomaly && "UNUSUAL ROUTE DETECTED"}
                      {isCongestion && "TRAFFIC JAM WARNING"}
                    </span>

                    {alert.plate && (
                      <span className="hsrp-plate-frame" style={{ transform: "scale(0.85)", transformOrigin: "left center" }}>
                        <span className="hsrp-blue-band">IND</span>
                        <span className="hsrp-number-text" style={{ fontSize: "13px", padding: "1px 6px" }}>
                          {alert.plate}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="alert-reason-text">{alert.reason}</div>

                  <div className="alert-meta-strip font-mono">
                    <span>
                      <Camera size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />
                      {alert.junction_name} • {alert.camera_name || alert.camera_id}
                    </span>
                    {alert.timestamp_sec !== undefined && (
                      <span>
                        <Clock size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />
                        T+{formatTimestampSec(alert.timestamp_sec)}
                      </span>
                    )}
                    {alert.congestion_index && (
                      <span style={{ color: "var(--status-warning)", fontWeight: 700 }}>
                        RCI: {alert.congestion_index}/100 ({alert.vehicle_volume} vehicles)
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="alert-actions-col">
                  {alert.plate && onSelectVehicle && (
                    <button
                      type="button"
                      className="alert-action-btn font-mono"
                      onClick={() => onSelectVehicle({ plate: alert.plate, global_vehicle_id: alert.plate })}
                      title="Inspect full vehicle journey trajectory"
                    >
                      <Eye size={12} />
                      JOURNEY
                    </button>
                  )}

                  {alert.camera_id && onFocusCamera && (
                    <button
                      type="button"
                      className="alert-action-btn is-camera-btn font-mono"
                      onClick={() => {
                        onFocusCamera(alert.camera_id);
                        if (onPlayEvent && (alert.timestamp_sec !== undefined && alert.timestamp_sec !== null)) {
                          onPlayEvent(
                            alert.camera_id,
                            alert.timestamp_sec,
                            `Alert: ${alert.plate || alert.camera_id}`,
                            {
                              plate: alert.plate,
                              isBlacklisted: true,
                            }
                          );
                        }
                      }}
                      title="Jump to camera CCTV feed"
                    >
                      <Camera size={12} />
                      CCTV FEED
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Watchlist Manager Modal */}
      {showAddModal && (
        <div className="modal-backdrop-overlay" onClick={() => setShowAddModal(false)}>
          <div className="watchlist-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-bar">
              <div>
                <div className="section-eyebrow">Database Configuration</div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>
                  Active Watchlist & Blacklist Manager
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setShowAddModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Existing Watchlist Table */}
            <div style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px" }}>
                CONFIGURED WATCHLIST TARGETS ({watchlist.length})
              </div>
              <div className="watchlist-table-wrap">
                {watchlist.map((item) => (
                  <div key={item.plate} className="watchlist-row-item">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span className="hsrp-plate-frame" style={{ transform: "scale(0.8)", transformOrigin: "left center" }}>
                        <span className="hsrp-blue-band">IND</span>
                        <span className="hsrp-number-text" style={{ fontSize: "12px", padding: "1px 6px" }}>
                          {item.plate}
                        </span>
                      </span>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 600 }}>{item.reason}</div>
                        <span className="watchlist-priority-badge font-mono">{item.priority}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="watchlist-delete-btn"
                      onClick={() => onRemoveFromWatchlist && onRemoveFromWatchlist(item.plate)}
                      title={`Remove ${item.plate} from watchlist`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Plate Form */}
              <form onSubmit={handleAddSubmit} style={{ marginTop: "16px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                  Add Vehicle Target to Watchlist
                </div>
                <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                  <input
                    type="text"
                    className="search-text-field font-mono"
                    style={{
                      background: "var(--bg-canvas-subtle)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 12px",
                      flex: 1,
                      fontSize: "13px"
                    }}
                    placeholder="Plate number (e.g. WB01BJ1415)"
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value)}
                    required
                  />
                  <select
                    className="font-mono"
                    style={{
                      background: "var(--bg-canvas-subtle)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 10px",
                      fontSize: "12px"
                    }}
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                  >
                    <option value="HIGH">HIGH (Blacklist)</option>
                    <option value="MEDIUM">MEDIUM (Monitor)</option>
                    <option value="LOW">LOW (Notice)</option>
                  </select>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="text"
                    style={{
                      background: "var(--bg-canvas-subtle)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 12px",
                      flex: 1,
                      fontSize: "12px"
                    }}
                    placeholder="Alert reason / investigation rationale..."
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="search-action-btn font-mono"
                    style={{ padding: "6px 16px", fontSize: "12px" }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Adding..." : "Add Target"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
