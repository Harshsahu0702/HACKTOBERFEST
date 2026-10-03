import React, { useState, useRef, useEffect } from "react";
import {
  Shield,
  BarChart3,
  ShieldAlert,
  PowerOff,
  X,
  AlertTriangle,
  Camera,
  Plus,
  Radio,
  Sparkles,
} from "lucide-react";
import { DrishtiEyeLogo } from "./DrishtiEyeLogo";

export function Header({
  onOpenAddBlacklist,
  activeTab = "surveillance",
  onSelectTab,
  activeAlertVehicles = [],
  onDeactivateVehicle,
  onGoToBlacklist,
  onSelectVehicle,
}) {
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const alertContainerRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        alertContainerRef.current &&
        !alertContainerRef.current.contains(event.target)
      ) {
        setIsAlertOpen(false);
      }
    }
    if (isAlertOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isAlertOpen]);

  const hasActiveAlerts = Boolean(activeAlertVehicles && activeAlertVehicles.length > 0);

  return (
    <header className="command-header">
      {/* LEFT: DRISHTI Logo & Brand Identity (Clicking opens System Validation & Empirical Benchmark) */}
      <div
        className="header-brand-nexus header-brand-nexus-clickable"
        onClick={() => onSelectTab && onSelectTab(activeTab === "validation" ? "surveillance" : "validation")}
        title="Click DRISHTI Logo to view Technical System Validation & Empirical Benchmarks"
        role="button"
        tabIndex={0}
      >
        {/* Futuristic Eye Symbol with Ambient Glow */}
        <div className="header-drishti-logo-slot">
          <DrishtiEyeLogo size={40} animated={true} />
        </div>

        <div className="brand-text-block">
          <div className="brand-primary-row">
            <h1 className="brand-core-title">
              DRISHTI
            </h1>
            {activeTab === "validation" && (
              <span className="brand-val-active-tag">SYSTEM VALIDATION</span>
            )}
          </div>
          <div className="brand-sub-descriptor">
            City-Wide AI Vehicle Surveillance & Mobility Intelligence
          </div>
        </div>
      </div>

      {/* CENTER: Navigation Page Switcher (Live ANPR placed on the right) */}
      {onSelectTab && (
        <nav className="header-nav-switcher">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "surveillance" ? "active" : ""}`}
            onClick={() => onSelectTab("surveillance")}
            title="City CCTV Feeds, Vehicle Search & Tracking"
          >
            <Shield size={16} className="nav-icon" />
            <span>Live Cameras & Tracking</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => onSelectTab("analytics")}
            title="City-Wide Traffic Analytics & Congestion Reports"
          >
            <BarChart3 size={16} className="nav-icon" />
            <span>Traffic Analytics</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "live_anpr" ? "active" : ""}`}
            onClick={() => onSelectTab("live_anpr")}
            title="Real-Time Camera ANPR & Optical Text Scanner"
          >
            <Camera size={16} className="nav-icon" />
            <span>Live ANPR</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "ai_intelligence" ? "active" : ""}`}
            onClick={() => onSelectTab("ai_intelligence")}
            title="Google Gemma 4 Multimodal Traffic Intelligence & Forensic Reasoning"
          >
            <Sparkles size={16} className="nav-icon" style={{ color: "#38bdf8" }} />
            <span>AI Intelligence</span>
            <span className="gemma-header-badge">GEMMA 4</span>
          </button>
        </nav>
      )}

      {/* RIGHT: Alert Beacon & Blacklist Action */}
      <div className="header-status-strip">
        {/* CONSTANT ALERT ICON (SHOWN ONLY WHEN ACTIVATED BLACKLISTED VEHICLE IS DETECTED) */}
        {hasActiveAlerts && (
          <div className="constant-alert-container" ref={alertContainerRef}>
            <button
              type="button"
              className="btn-header-constant-alert"
              onClick={() => setIsAlertOpen((prev) => !prev)}
              title={`CONSTANT ALERT: ${activeAlertVehicles.length} active blacklisted vehicle(s) detected on CCTV! Remains active until deactivated.`}
              aria-label="Active Blacklist Alert"
            >
              <span className="alert-beacon-ring"></span>
              <span className="alert-beacon-dot"></span>
              <ShieldAlert size={17} className="alert-beacon-icon" />
              <span className="alert-beacon-count">{activeAlertVehicles.length}</span>
            </button>

            {/* EXPANDABLE ALERT DETAILS POPOVER */}
            {isAlertOpen && (
              <div className="constant-alert-popover">
                <div className="alert-popover-top">
                  <div className="alert-popover-badge">
                    <span className="alert-popover-dot"></span>
                    <span className="alert-popover-badge-text">CONSTANT BLACKLIST ALERT</span>
                  </div>
                  <button
                    type="button"
                    className="alert-popover-close-btn"
                    onClick={() => setIsAlertOpen(false)}
                    title="Close popover (Alert icon remains pinned at top)"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="alert-popover-lead">
                  <div className="alert-popover-lead-title">
                    <AlertTriangle size={14} />
                    <span>Target Vehicle Sighted On CCTV</span>
                  </div>
                  <p className="alert-popover-lead-sub">
                    This constant alert stays active at the top of the dashboard until the vehicle is deactivated.
                  </p>
                </div>

                <div className="alert-popover-vehicle-list">
                  {activeAlertVehicles.map((vehicle) => (
                    <div
                      key={vehicle.id || vehicle.plate_number}
                      className="alert-popover-card"
                    >
                      <div className="alert-card-header">
                        <span className="alert-plate-text">
                          {vehicle.plate_number}
                        </span>
                        <span
                          className={`alert-priority-pill priority-${(
                            vehicle.priority || "HIGH"
                          ).toLowerCase()}`}
                        >
                          {vehicle.priority || "HIGH"}
                        </span>
                      </div>

                      <div className="alert-card-reason">
                        {vehicle.reason || "Flagged in enforcement blacklist"}
                      </div>

                      <div className="alert-card-meta">
                        <div className="alert-meta-line">
                          <span className="meta-k">Location:</span>
                          <span className="meta-v">
                            {vehicle.last_seen?.junction_name || "Vivekananda Sarani"} • {vehicle.last_seen?.camera_name || vehicle.last_seen?.camera_code || "Camera"}
                          </span>
                        </div>
                        {vehicle.detection_count > 0 && (
                          <div className="alert-meta-line">
                            <span className="meta-k">Occurrences:</span>
                            <span className="meta-v">
                              {vehicle.detection_count} CCTV detection(s) logged
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="alert-card-actions">
                        <button
                          type="button"
                          className="btn-alert-card-deactivate"
                          onClick={async () => {
                            if (onDeactivateVehicle) {
                              await onDeactivateVehicle(vehicle.id);
                            }
                          }}
                          title="Deactivate this vehicle to dismiss the alert"
                        >
                          <PowerOff size={13} />
                          <span>Deactivate</span>
                        </button>

                        <button
                          type="button"
                          className="btn-alert-card-manage"
                          onClick={() => {
                            setIsAlertOpen(false);
                            if (onGoToBlacklist) onGoToBlacklist(vehicle.plate_number);
                            if (onSelectVehicle) onSelectVehicle({ plate: vehicle.plate_number });
                          }}
                          title="View in Blacklist Management table"
                        >
                          <span>Manage in Blacklist ➔</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Prominent Action Button for Blacklist */}
        {onOpenAddBlacklist && (
          <button
            type="button"
            className="btn-header-add-blacklist"
            onClick={onOpenAddBlacklist}
            title="Register target plate to MySQL blacklist"
          >
            <Plus size={15} strokeWidth={2.5} className="btn-add-icon" />
            <span>Add Blacklisted Vehicle</span>
          </button>
        )}
      </div>
    </header>
  );
}
