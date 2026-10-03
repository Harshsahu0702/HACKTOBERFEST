import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Search,
  Eye,
  Edit2,
  Trash2,
  Power,
  ExternalLink,
  Clock,
  Camera,
  Calendar,
  AlertTriangle,
  X,
  CheckCircle,
  Video,
  Play,
} from "lucide-react";
import { api, formatTime } from "../services/api";

export function BlacklistManagement({
  onSelectVehicle,
  onOpenAddModal,
  refreshTrigger,
  onDeleteSuccess,
  onStatusChangeSuccess,
  onFocusCamera,
  onPlayEvent,
  onTraceJourney,
}) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // View Details Modal State
  const [viewDetailsModal, setViewDetailsModal] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Delete Confirmation Modal State
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(null);

  // Edit Modal State
  const [editModalData, setEditModalData] = useState(null);
  const [editReason, setEditReason] = useState("");
  const [editPriority, setEditPriority] = useState("HIGH");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editNotes, setEditNotes] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadBlacklist = async () => {
    setLoading(true);
    try {
      const data = await api.getBlacklist();
      setVehicles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load blacklist vehicles:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlacklist();
  }, [refreshTrigger]);

  const handleToggleActive = async (vehicle) => {
    setActionLoadingId(vehicle.id);
    try {
      const nextActive = !vehicle.is_active;
      await api.updateBlacklist(vehicle.id, { is_active: nextActive });
      await loadBlacklist();
      if (onStatusChangeSuccess) {
        onStatusChangeSuccess(
          nextActive
            ? `Target ${vehicle.plate_number} activated.`
            : `Target ${vehicle.plate_number} deactivated.`
        );
      }
    } catch (err) {
      console.error("Error updating status:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteClick = (vehicleId, plate) => {
    setDeleteConfirmModal({ id: vehicleId, plate });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmModal) return;
    const { id, plate } = deleteConfirmModal;
    setActionLoadingId(id);
    try {
      await api.deleteBlacklist(id);
      setDeleteConfirmModal(null);
      await loadBlacklist();
      if (onDeleteSuccess) {
        onDeleteSuccess(`Vehicle ${plate} removed from blacklist.`);
      }
    } catch (err) {
      console.error("Error deleting vehicle:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePlayVehicleEvidence = async (vehicle) => {
    if (!vehicle) return;
    const plate =
      vehicle.normalized_plate || vehicle.plate_number || vehicle.plate;

    // 1. Check if last_seen has camera_code and timestamp_sec
    if (vehicle.last_seen?.camera_code && (vehicle.last_seen?.timestamp_sec !== undefined && vehicle.last_seen?.timestamp_sec !== null)) {
      if (onPlayEvent) {
        onPlayEvent(
          vehicle.last_seen.camera_code,
          vehicle.last_seen.timestamp_sec,
          `${plate} @ ${vehicle.last_seen.camera_name || vehicle.last_seen.camera_code}`,
          {
            plate,
            isBlacklisted: true,
          }
        );
        if (onFocusCamera) onFocusCamera(vehicle.last_seen.camera_code);
        return;
      }
    }

    // 2. Fallback to searching vehicle journey to find recent sighting
    try {
      const searchRes = await api.searchVehicles(plate);
      const vehObj = Array.isArray(searchRes) ? searchRes[0] : (searchRes?.results?.[0] || searchRes);
      if (vehObj?.trajectory && vehObj.trajectory.length > 0) {
        const obs = vehObj.trajectory[vehObj.trajectory.length - 1];
        const camId = obs.camera_id;
        const ts = obs.timestamp_sec ?? obs.timestamp_seconds ?? obs.first_time_sec ?? 0;
        if (onPlayEvent && camId) {
          onPlayEvent(
            camId,
            ts,
            `${plate} @ ${obs.camera_name || camId}`,
            {
              plate,
              plate_image: obs.plate_image || obs.plate_image_url,
              isBlacklisted: true,
            }
          );
          if (onFocusCamera) onFocusCamera(camId);
          return;
        }
      }
    } catch (e) {
      console.warn("Could not find sighting for evidence playback:", e);
    }
  };

  const openViewDetails = async (vehicle) => {
    setViewLoading(true);
    setViewDetailsModal({ ...vehicle, vehicle });
    const plate = vehicle.normalized_plate || vehicle.plate_number;
    try {
      const data = await api.getBlacklistEvents(plate);
      const events = data?.events || [];
      setViewDetailsModal((prev) => ({
        ...prev,
        events,
        detection_count: events.length || prev?.detection_count || 0,
        vehicle: { ...prev?.vehicle, events },
      }));
    } catch (e) {
      console.warn("Failed to fetch extended blacklist details:", e);
    } finally {
      setViewLoading(false);
    }
  };

  const openEditModal = (vehicle) => {
    setEditModalData(vehicle);
    setEditReason(vehicle.reason || "");
    setEditPriority(vehicle.priority || "HIGH");
    setEditStatus(vehicle.is_active ? "ACTIVE" : "INACTIVE");
    setEditNotes(vehicle.notes || "");
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editModalData) return;
    setIsSavingEdit(true);
    try {
      await api.updateBlacklist(editModalData.id, {
        reason: editReason,
        priority: editPriority,
        is_active: editStatus === "ACTIVE",
        notes: editNotes,
      });
      setEditModalData(null);
      await loadBlacklist();
    } catch (err) {
      alert(`Error saving updates: ${err.message}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filter logic
  const filteredVehicles = vehicles.filter((v) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchPlate = (v.normalized_plate || v.plate_number || "")
        .toLowerCase()
        .includes(q);
      const matchReason = (v.reason || "").toLowerCase().includes(q);
      if (!matchPlate && !matchReason) return false;
    }

    if (filterTab === "active") return v.is_active;
    if (filterTab === "inactive") return !v.is_active;
    if (filterTab === "HIGH") return v.priority === "HIGH";
    if (filterTab === "MEDIUM") return v.priority === "MEDIUM";
    if (filterTab === "LOW") return v.priority === "LOW";
    return true;
  });

  return (
    <div className="blacklist-management-card" id="blacklist-management-section">
      <div className="blacklist-management-header">
        <div className="blacklist-title-area">
          <div className="blacklist-section-badge">
            <span className="badge-pulse"></span>
            MYSQL ENFORCEMENT REGISTRY
          </div>
          <h2 className="blacklist-section-title">BLACKLISTED VEHICLES</h2>
          <p className="blacklist-section-subtitle">
            Operator-governed surveillance watchlist backed by MySQL. Automatic cross-camera detection, audit trails & alert generation.
          </p>
        </div>

        {/* Secondary styling for the section button, primary is in Header */}
        <button
          type="button"
          className="btn-add-blacklist-secondary"
          onClick={onOpenAddModal}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            background: "var(--bg-canvas, #ffffff)",
            border: "1px solid var(--accent-red, #dc2626)",
            color: "var(--accent-red, #dc2626)",
            borderRadius: "6px",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span> Add Blacklisted Vehicle
        </button>
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="blacklist-controls-bar">
        <div className="blacklist-filter-tabs">
          {[
            { key: "all", label: `All (${vehicles.length})` },
            {
              key: "active",
              label: `Active (${vehicles.filter((v) => v.is_active).length})`,
            },
            {
              key: "inactive",
              label: `Inactive (${vehicles.filter((v) => !v.is_active).length})`,
            },
            {
              key: "HIGH",
              label: `High Priority (${
                vehicles.filter((v) => v.priority === "HIGH").length
              })`,
            },
            {
              key: "MEDIUM",
              label: `Medium Priority (${
                vehicles.filter((v) => v.priority === "MEDIUM").length
              })`,
            },
            {
              key: "LOW",
              label: `Low Priority (${
                vehicles.filter((v) => v.priority === "LOW").length
              })`,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`filter-tab-btn ${
                filterTab === tab.key ? "active" : ""
              }`}
              onClick={() => setFilterTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="blacklist-search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="blacklist-search-input"
            placeholder="Search plate or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="blacklist-table-container">
        {loading ? (
          <div className="blacklist-loading-state">
            <div className="spinner-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p>Querying MySQL database...</p>
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="blacklist-empty-state">
            <ShieldAlert size={36} style={{ color: "var(--text-muted, #94a3b8)", marginBottom: "8px" }} />
            <h4>No vehicles match current filter criteria</h4>
            <p>
              Click "+ Add Blacklisted Vehicle" to register target plates into
              MySQL.
            </p>
          </div>
        ) : (
          <table className="blacklist-table">
            <thead>
              <tr>
                <th>PLATE NUMBER</th>
                <th>REASON / VIOLATION</th>
                <th>PRIORITY</th>
                <th>STATUS</th>
                <th>ADDED ON</th>
                <th>LAST SEEN</th>
                <th>DETECTIONS</th>
                <th style={{ textAlign: "right" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => {
                const isLoading = actionLoadingId === v.id;

                return (
                  <tr
                    key={v.id}
                    className={!v.is_active ? "row-inactive" : ""}
                    onClick={() => onSelectVehicle && onSelectVehicle(v)}
                    style={{ cursor: "pointer" }}
                    title="Click to track vehicle on Map and CCTV Timeline"
                  >
                    {/* Plate */}
                    <td>
                      <div className="plate-badge-cell">
                        <span className="plate-badge-visual">
                          <span className="plate-flag">IND</span>
                          <span className="plate-number-text">
                            {v.normalized_plate || v.plate_number}
                          </span>
                        </span>
                      </div>
                    </td>

                    {/* Reason */}
                    <td>
                      <div className="reason-text-cell">
                        <span className="reason-main">{v.reason}</span>
                        {v.notes && (
                          <span className="reason-notes">{v.notes}</span>
                        )}
                      </div>
                    </td>

                    {/* Priority */}
                    <td>
                      <span
                        className={`priority-badge priority-${(
                          v.priority || "HIGH"
                        ).toLowerCase()}`}
                      >
                        {v.priority || "HIGH"}
                      </span>
                    </td>

                    {/* Status */}
                    <td>
                      <span
                        className={`status-pill ${
                          v.is_active ? "status-active" : "status-inactive"
                        }`}
                      >
                        <span className="status-dot"></span>
                        {v.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Added On */}
                    <td>
                      <span className="date-cell font-mono">
                        {v.created_at
                          ? new Date(v.created_at).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )
                          : "System"}
                      </span>
                    </td>

                    {/* Last Seen */}
                    <td>
                      {v.last_seen ? (
                        <div className="last-seen-cell">
                          <span className="last-seen-cam">
                            {v.last_seen.camera_name || v.last_seen.camera_code}
                          </span>
                          <span className="last-seen-time font-mono">
                            T+{v.last_seen.timestamp_sec?.toFixed(1)}s
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted font-mono" style={{ fontSize: "11px" }}>
                          No detections
                        </span>
                      )}
                    </td>

                    {/* Detection Count */}
                    <td>
                      <span
                        className={`detection-count-badge font-mono ${
                          v.detection_count > 0 ? "has-detections" : ""
                        }`}
                      >
                        {v.detection_count}{" "}
                        {v.detection_count === 1 ? "hit" : "hits"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: "right" }}>
                      <div className="action-button-group">
                        <button
                          type="button"
                          className="btn-action btn-view"
                          onClick={(e) => {
                            e.stopPropagation();
                            openViewDetails(v);
                          }}
                          title="View blacklist dossier & detection history"
                        >
                          <Eye size={12} style={{ display: "inline", marginRight: "3px" }} />
                          View
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-evidence"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayVehicleEvidence(v);
                          }}
                          title="Play CCTV Evidence video for this blacklisted target"
                        >
                          <Play size={11} fill="currentColor" style={{ display: "inline", marginRight: "3px" }} />
                          Evidence
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(v);
                          }}
                          disabled={isLoading}
                          title="Edit reason, priority, or notes"
                        >
                          <Edit2 size={12} style={{ display: "inline", marginRight: "3px" }} />
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`btn-action ${
                            v.is_active ? "btn-deactivate" : "btn-activate"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(v);
                          }}
                          disabled={isLoading}
                          title={
                            v.is_active
                              ? "Deactivate (sets is_active=0)"
                              : "Re-activate"
                          }
                        >
                          <Power size={11} style={{ display: "inline", marginRight: "3px" }} />
                          {v.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(
                              v.id,
                              v.normalized_plate || v.plate_number
                            );
                          }}
                          disabled={isLoading}
                          title="Permanently remove from MySQL"
                        >
                          <Trash2 size={11} style={{ display: "inline", marginRight: "3px" }} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* VIEW DETAILS MODAL / DRAWER */}
      {viewDetailsModal && (
        <div
          className="blacklist-modal-backdrop"
          onClick={() => setViewDetailsModal(null)}
        >
          <div
            className="blacklist-modal-card"
            style={{ maxWidth: "780px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="blacklist-modal-header">
              <div className="blacklist-modal-title">
                <span className="blacklist-modal-icon">🛡️</span>
                <div>
                  <h3>Blacklist Surveillance Dossier</h3>
                  <p className="blacklist-modal-subtitle font-mono">
                    Plate: {viewDetailsModal.vehicle?.plate_number} • Target ID #
                    {viewDetailsModal.vehicle?.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="blacklist-modal-close"
                onClick={() => setViewDetailsModal(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "20px 24px", maxHeight: "75vh", overflowY: "auto" }}>
              {/* Top Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--bg-canvas-subtle, #f8fafc)",
                  border: "1px solid var(--border-default, #e2e8f0)",
                  borderRadius: "8px",
                  padding: "16px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div className="plate-badge-visual">
                    <span className="plate-flag">IND</span>
                    <span className="plate-number-text" style={{ fontSize: "16px" }}>
                      {viewDetailsModal.vehicle?.normalized_plate ||
                        viewDetailsModal.vehicle?.plate_number}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                      Reason:
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "14px" }}>
                      {viewDetailsModal.vehicle?.reason}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <span
                    className={`priority-badge priority-${(
                      viewDetailsModal.vehicle?.priority || "HIGH"
                    ).toLowerCase()}`}
                  >
                    {viewDetailsModal.vehicle?.priority} PRIORITY
                  </span>
                  <div style={{ marginTop: "4px" }}>
                    <span
                      className={`status-pill ${
                        viewDetailsModal.vehicle?.is_active
                          ? "status-active"
                          : "status-inactive"
                      }`}
                    >
                      <span className="status-dot"></span>
                      {viewDetailsModal.vehicle?.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metadata Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    background: "var(--bg-canvas, #ffffff)",
                    border: "1px solid var(--border-subtle, #e2e8f0)",
                    borderRadius: "6px",
                    padding: "10px 14px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Added Date
                  </div>
                  <div className="font-mono" style={{ fontSize: "13px", fontWeight: 600 }}>
                    {viewDetailsModal.vehicle?.created_at
                      ? new Date(
                          viewDetailsModal.vehicle.created_at
                        ).toLocaleString()
                      : "System Watchlist"}
                  </div>
                </div>

                <div
                  style={{
                    background: "var(--bg-canvas, #ffffff)",
                    border: "1px solid var(--border-subtle, #e2e8f0)",
                    borderRadius: "6px",
                    padding: "10px 14px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Total Detections
                  </div>
                  <div className="font-mono" style={{ fontSize: "13px", fontWeight: 700 }}>
                    {viewDetailsModal.detection_count ??
                      viewDetailsModal.vehicle?.detection_count ??
                      0}{" "}
                    Corridor Hits
                  </div>
                </div>
              </div>

              {/* TACTICAL INTERCEPTION ALERTS (THE EXACT CARDS FROM THE PREVIOUS BOTTOM DIV) */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--text-primary, #1e293b)" }}>
                    Tactical Interception Alerts & Camera Detections ({
                      (viewDetailsModal.events?.length || viewDetailsModal.recent_alerts?.length || viewDetailsModal.alerts?.length || 0)
                    })
                  </h4>
                  <span className="font-mono" style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                    MySQL Threat Feed
                  </span>
                </div>

                {((viewDetailsModal.events && viewDetailsModal.events.length > 0) ||
                  (viewDetailsModal.recent_alerts && viewDetailsModal.recent_alerts.length > 0) ||
                  (viewDetailsModal.alerts && viewDetailsModal.alerts.length > 0)) ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {(viewDetailsModal.events && viewDetailsModal.events.length > 0
                      ? viewDetailsModal.events
                      : (viewDetailsModal.recent_alerts || viewDetailsModal.alerts || [])
                    ).map((ev, idx) => {
                      const plateNum =
                        viewDetailsModal.vehicle?.normalized_plate ||
                        viewDetailsModal.vehicle?.plate_number ||
                        viewDetailsModal.normalized_plate ||
                        viewDetailsModal.plate_number;
                      const priorityTag =
                        viewDetailsModal.vehicle?.priority ||
                        viewDetailsModal.priority ||
                        ev.severity ||
                        "HIGH";
                      const timestampSec = ev.timestamp_sec || 0;
                      const confPercent = ev.confidence
                        ? (ev.confidence * 100).toFixed(1)
                        : "95.0";

                      return (
                        <div
                          key={ev.event_id || ev.id || idx}
                          className="alert-card alert-card-critical"
                          style={{
                            borderLeft: "4px solid var(--accent-red, #dc2626)",
                            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
                            background: "#ffffff",
                            margin: 0,
                          }}
                        >
                          {/* Alert Top */}
                          <div className="alert-card-top">
                            <div className="alert-type-group" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div className="alert-badge alert-badge-red font-mono">
                                <ShieldAlert size={12} />
                                BLACKLISTED VEHICLE
                              </div>
                              <span className="alert-priority-tag font-mono">
                                {priorityTag}
                              </span>
                            </div>

                            <div className="alert-time font-mono">
                              <Clock size={12} />
                              {timestampSec > 0
                                ? `${formatTime(timestampSec)} (${ev.time_str || `T+${timestampSec.toFixed(1)}s`})`
                                : "Active Interception"}
                            </div>
                          </div>

                          {/* Alert Body */}
                          <div className="alert-card-body">
                            <div className="alert-title-row">
                              <span className="alert-plate-pill font-mono">{plateNum}</span>
                              <h4 className="alert-main-title">
                                Blacklisted Target Alert: {plateNum}
                              </h4>
                            </div>

                            <p className="alert-description">
                              {ev.message ||
                                `🚨 BLACKLIST VEHICLE DETECTED: Plate ${plateNum} captured at ${
                                  ev.camera_name || ev.camera_code || "Surveillance Camera"
                                } (Time: ${timestampSec.toFixed(1)}s, Conf: ${confPercent}%)`}
                            </p>

                            <div className="alert-meta-strip font-mono">
                              <span>
                                Node: <strong>{ev.camera_name || ev.camera_code || "Corridor Entry"}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Junction: <strong>{ev.junction_name || "Surveillance Corridor"}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Confidence: <strong>{confPercent}%</strong>
                              </span>
                            </div>
                          </div>

                          {/* Alert Footer with Interactive Buttons */}
                          <div
                            className="alert-card-footer"
                            style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}
                          >
                            <button
                              type="button"
                              className="alert-btn alert-btn-primary"
                              onClick={() => {
                                setViewDetailsModal(null);
                                if (onSelectVehicle) onSelectVehicle({ plate: plateNum });
                              }}
                            >
                              <ExternalLink size={12} />
                              View Journey
                            </button>

                            {ev.camera_code && (
                              <button
                                type="button"
                                className="alert-btn alert-btn-secondary"
                                onClick={() => {
                                  setViewDetailsModal(null);
                                  if (onFocusCamera) onFocusCamera(ev.camera_code);
                                }}
                              >
                                <Video size={12} />
                                View Camera
                              </button>
                            )}

                            {onPlayEvent && ev.camera_code && (
                              <button
                                type="button"
                                className="node-play-event-btn font-mono"
                                style={{ marginLeft: "auto" }}
                                onClick={() => {
                                  setViewDetailsModal(null);
                                  onPlayEvent(
                                    ev.camera_code,
                                    timestampSec,
                                    `${plateNum} @ ${ev.camera_name || ev.camera_code}`,
                                    {
                                      plate: plateNum,
                                      plate_image: ev.plate_image,
                                      isBlacklisted: true,
                                    }
                                  );
                                  if (onFocusCamera) onFocusCamera(ev.camera_code);
                                }}
                              >
                                <Play size={11} fill="currentColor" />
                                PLAY EVENT ▶
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--text-muted)",
                      padding: "16px",
                      background: "var(--bg-canvas-subtle, #f8fafc)",
                      borderRadius: "6px",
                      border: "1px solid var(--border-subtle, #e2e8f0)",
                      textAlign: "center",
                    }}
                  >
                    🛡️ No optical detections logged across current 4 cameras yet. System is monitoring feeds in real-time.
                  </div>
                )}
              </div>

              {/* Action: Play Evidence & Trace Journey */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setViewDetailsModal(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn-modal-evidence font-mono"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#EEF2FF",
                    color: "#4338CA",
                    border: "1px solid #C7D2FE",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                  onClick={() => {
                    const v = viewDetailsModal.vehicle || viewDetailsModal;
                    setViewDetailsModal(null);
                    handlePlayVehicleEvidence(v);
                  }}
                >
                  <Play size={12} fill="currentColor" /> Play Evidence
                </button>
                <button
                  type="button"
                  className="btn-modal-submit"
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  onClick={() => {
                    const targetPlate =
                      viewDetailsModal.vehicle?.normalized_plate ||
                      viewDetailsModal.vehicle?.plate_number ||
                      viewDetailsModal.normalized_plate ||
                      viewDetailsModal.plate_number;
                    setViewDetailsModal(null);
                    if (onTraceJourney && targetPlate) {
                      onTraceJourney(targetPlate);
                    } else if (onSelectVehicle && targetPlate) {
                      onSelectVehicle({ plate: targetPlate });
                    }
                  }}
                >
                  <ExternalLink size={14} /> Trace Vehicle Journey & Map Route
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT BLACKLIST MODAL */}
      {editModalData && (
        <div
          className="blacklist-modal-backdrop"
          onClick={() => setEditModalData(null)}
        >
          <div
            className="blacklist-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="blacklist-modal-header">
              <div className="blacklist-modal-title">
                <span className="blacklist-modal-icon">✏️</span>
                <div>
                  <h3>Edit Blacklisted Record</h3>
                  <p className="blacklist-modal-subtitle font-mono">
                    Updating Plate: {editModalData.plate_number} in MySQL
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="blacklist-modal-close"
                onClick={() => setEditModalData(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="blacklist-modal-form">
              <div className="form-group">
                <label>License Plate Number</label>
                <input
                  type="text"
                  className="modal-text-input plate-code-font"
                  value={editModalData.plate_number}
                  disabled
                  style={{ background: "var(--bg-canvas-subtle, #f1f5f9)", cursor: "not-allowed" }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-reason-input">
                  Surveillance / Alert Reason <span className="required">*</span>
                </label>
                <input
                  id="edit-reason-input"
                  type="text"
                  className="modal-text-input"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  required
                />
              </div>

              <div className="form-row" style={{ display: "flex", gap: "12px" }}>
                <div className="form-group flex-1">
                  <label htmlFor="edit-priority-select">Alert Priority</label>
                  <select
                    id="edit-priority-select"
                    className="modal-select-input"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                  >
                    <option value="HIGH">HIGH Priority</option>
                    <option value="MEDIUM">MEDIUM Priority</option>
                    <option value="LOW">LOW Priority</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="edit-status-select">Status</label>
                  <select
                    id="edit-status-select"
                    className="modal-select-input"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="ACTIVE">ACTIVE (Triggers alerts)</option>
                    <option value="INACTIVE">INACTIVE (Alerts suppressed)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="edit-notes-input">Operational Notes</label>
                <textarea
                  id="edit-notes-input"
                  className="modal-textarea-input"
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Case notes, investigator ID, or court order number..."
                />
              </div>

              <div className="blacklist-modal-actions">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setEditModalData(null)}
                  disabled={isSavingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-modal-submit"
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? "Updating MySQL..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL (IN-APP DIALOG, NOT BROWSER POPUP) */}
      {deleteConfirmModal && (
        <div
          className="blacklist-modal-backdrop"
          onClick={() => setDeleteConfirmModal(null)}
        >
          <div
            className="blacklist-modal-card"
            style={{ maxWidth: "460px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="blacklist-modal-header" style={{ borderBottom: "none", paddingBottom: "4px" }}>
              <div className="blacklist-modal-title">
                <span
                  className="blacklist-modal-icon"
                  style={{
                    background: "rgba(220, 38, 38, 0.12)",
                    color: "var(--accent-red, #dc2626)",
                    fontSize: "18px",
                  }}
                >
                  ⚠️
                </span>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Remove from Blacklist?</h3>
                  <p className="blacklist-modal-subtitle">
                    Confirm deletion from MySQL surveillance database
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="blacklist-modal-close"
                onClick={() => setDeleteConfirmModal(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "16px 24px 20px" }}>
              <p style={{ fontSize: "13px", color: "var(--text-secondary, #475569)", lineHeight: 1.6, margin: "0 0 16px" }}>
                Are you sure you want to permanently remove target vehicle{" "}
                <strong className="font-mono" style={{ color: "var(--accent-red, #dc2626)", fontSize: "14px" }}>
                  {deleteConfirmModal.plate}
                </strong>{" "}
                from the surveillance blacklist?
              </p>
              <div
                style={{
                  background: "var(--bg-canvas-subtle, #f8fafc)",
                  border: "1px solid var(--border-subtle, #e2e8f0)",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "var(--text-muted, #64748b)",
                }}
              >
                ℹ️ All surveillance interception alerts and watchlist flags for this vehicle will cease.
              </div>
            </div>

            <div className="blacklist-modal-actions" style={{ padding: "12px 24px 20px" }}>
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setDeleteConfirmModal(null)}
                disabled={actionLoadingId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-submit"
                style={{
                  background: "var(--accent-red, #dc2626)",
                  borderColor: "var(--accent-red, #dc2626)",
                  color: "#ffffff",
                }}
                onClick={confirmDelete}
                disabled={actionLoadingId !== null}
              >
                {actionLoadingId !== null ? "Deleting from MySQL..." : "Yes, Delete Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BlacklistManagement;
