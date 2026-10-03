import React, { useState } from "react";
import { api } from "../services/api";

export default function BlacklistModal({ isOpen, onClose, onSuccess }) {
  const [plate, setPlate] = useState("");
  const [reason, setReason] = useState("Wanted / suspicious vehicle");
  const [priority, setPriority] = useState("HIGH");
  const [status, setStatus] = useState("ACTIVE");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPlate = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (!cleanPlate || cleanPlate.length < 2) {
      setErrorMsg("Please enter a valid license plate number (alphanumeric).");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const payload = {
        plate: cleanPlate,
        reason: reason.trim() || "Wanted / suspicious vehicle",
        priority,
        status,
        is_active: status === "ACTIVE",
        notes: notes.trim() || null,
      };

      const res = await api.addBlacklist(payload);
      if (res && res.success) {
        setPlate("");
        setReason("Wanted / suspicious vehicle");
        setPriority("HIGH");
        setStatus("ACTIVE");
        setNotes("");
        if (onSuccess) onSuccess(res.entry);
        onClose();
      } else {
        setErrorMsg(res?.message || "Failed to register vehicle in blacklist.");
      }
    } catch (err) {
      setErrorMsg(err.message || "Network error while contacting MySQL database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="blacklist-modal-backdrop" onClick={onClose}>
      <div
        className="blacklist-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="blacklist-modal-header">
          <div className="blacklist-modal-title">
            <span className="blacklist-modal-icon">🚨</span>
            <div>
              <h3>Add Blacklisted Vehicle</h3>
              <p className="blacklist-modal-subtitle">
                Register a target plate into MySQL persistent surveillance database.
              </p>
            </div>
          </div>
          <button className="blacklist-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="blacklist-modal-error">
            <span>⚠️</span> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="blacklist-modal-form">
          <div className="form-group">
            <label htmlFor="modal-plate-input">
              License Plate Number <span className="required">*</span>
            </label>
            <input
              id="modal-plate-input"
              type="text"
              className="modal-text-input plate-code-font"
              placeholder="e.g. WB37E1275"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              autoFocus
              required
            />
            <small className="form-hint">
              Alphanumeric registration. Normalized automatically upon entry.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="modal-reason-input">
              Surveillance / Alert Reason <span className="required">*</span>
            </label>
            <input
              id="modal-reason-input"
              type="text"
              className="modal-text-input"
              placeholder="e.g. Wanted / suspicious vehicle"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="form-row" style={{ display: "flex", gap: "12px" }}>
            <div className="form-group flex-1">
              <label htmlFor="modal-priority-select">Alert Priority</label>
              <select
                id="modal-priority-select"
                className="modal-select-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="HIGH">HIGH (Immediate Alert)</option>
                <option value="MEDIUM">MEDIUM (Tactical Flag)</option>
                <option value="LOW">LOW (Corridor Monitor)</option>
              </select>
            </div>
            <div className="form-group flex-1">
              <label htmlFor="modal-status-select">Status</label>
              <select
                id="modal-status-select"
                className="modal-select-input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="modal-notes-input">Operational Notes (Optional)</label>
            <textarea
              id="modal-notes-input"
              className="modal-textarea-input"
              rows={2}
              placeholder="Case ref, reporting officer, FIR number, vehicle description..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="blacklist-modal-actions">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Registering in MySQL..." : "Add to Blacklist"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
