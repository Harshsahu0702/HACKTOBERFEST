import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Car,
  ArrowRight,
  Camera,
  Clock,
  AlertCircle,
  Play,
  CheckCircle,
  ShieldAlert,
  X,
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import {
  api,
  formatTime,
  getCanonicalCameraName,
  getCanonicalJunctionName,
  normalizeCameraId,
} from "../services/api";
import { PoliceDossierModal } from "./PoliceDossierModal";
import { VahanCard } from "./VahanCard";

function normalizePlateSearch(query) {
  if (!query) return "";
  return String(query)
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]/g, "");
}

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const qClean = query.replace(/[\s\-_]/g, "");
  const index = text.toUpperCase().indexOf(qClean.toUpperCase());
  if (index === -1) return text;
  const before = text.slice(0, index);
  const match = text.slice(index, index + qClean.length);
  const after = text.slice(index + qClean.length);
  return (
    <>
      {before}
      <span className="search-match-highlight">{match}</span>
      {after}
    </>
  );
}

const QUICK_SEARCH_EXAMPLES = [
  { label: "JH10CS2095", type: "Target Plate", desc: "Primary Multi-Camera Target (4 Cameras across Junction A & B)" },
  { label: "Z48H9831N", type: "Target Plate", desc: "Cross-Camera & Cross-Junction (Junction A & B)" },
  { label: "WB37E1275", type: "Target Plate", desc: "Junction B Camera 01 (Confirmed Plate)" },
  { label: "JH10DL8792", type: "Target Plate", desc: "Junction A Camera 02 (Confirmed Plate)" },
  { label: "WB01BJ1415", type: "Target Plate", desc: "Junction A Camera 01 (Confirmed Plate)" },
];

export function VehicleSearch({
  vehicles = [],
  onSelectVehicle,
  onPlayEvent,
  onFocusCamera,
  selectedVehicle,
  cameras = {},
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [vahanData, setVahanData] = useState(null);
  const [fraudCheckData, setFraudCheckData] = useState(null);
  const [loadingVahan, setLoadingVahan] = useState(false);

  const searchContainerRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Instagram-style real-time matching suggestions
  const suggestions = useMemo(() => {
    const q = normalizePlateSearch(searchTerm);
    if (!q || q.length < 1) return [];

    const pool = Array.isArray(vehicles) ? vehicles : [];
    const scored = [];
    const seenIds = new Set();

    // Prioritize quick examples if they match
    for (const ex of QUICK_SEARCH_EXAMPLES) {
      const normEx = normalizePlateSearch(ex.label);
      if (normEx.includes(q)) {
        seenIds.add(ex.label);
        scored.push({
          vehicle: {
            plate: ex.label,
            global_vehicle_id: ex.label,
            vehicle_type: "car",
            camera_count: 2,
            observation_count: 4,
            is_sample: true,
          },
          score: normEx.startsWith(q) ? 95 : 75,
        });
      }
    }

    for (const v of pool) {
      const plate = (v.plate || "").toUpperCase();
      const gid = (v.global_vehicle_id || v.id || "").toUpperCase();
      const normPlate = normalizePlateSearch(plate);
      const normGid = normalizePlateSearch(gid);
      const uniqueKey = v.global_vehicle_id || v.plate || v.id;

      if (!uniqueKey || seenIds.has(uniqueKey) || seenIds.has(plate)) continue;

      let score = 0;
      if (normPlate === q || normGid === q) {
        score = 100;
      } else if (normPlate.startsWith(q)) {
        score = 85;
      } else if (normPlate.includes(q)) {
        score = 65;
      } else if (normGid.includes(q)) {
        score = 45;
      }

      if (score > 0) {
        seenIds.add(uniqueKey);
        if (v.plate) score += 5;
        if ((v.camera_count || 1) > 1) score += 5;
        scored.push({ vehicle: v, score });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.vehicle.observation_count || 1) - (a.vehicle.observation_count || 1);
    });

    return scored.slice(0, 7).map((s) => s.vehicle);
  }, [searchTerm, vehicles]);

  const executeSearch = async (term) => {
    const q = normalizePlateSearch(term || searchTerm);
    if (!q) return;

    try {
      setIsSearching(true);
      setSearchError("");
      setSearchResult(null);
      setIsDropdownOpen(false);

      const res = await api.searchVehicles(q);

      let results = [];
      if (Array.isArray(res)) {
        results = res;
      } else if (res && res.results && Array.isArray(res.results)) {
        results = res.results;
      } else if (res && Array.isArray(res.vehicles)) {
        results = res.vehicles;
      }

      if (results.length > 0) {
        const vehicle = results[0];
        setSearchResult(vehicle);
        if (onSelectVehicle) {
          onSelectVehicle(vehicle);
        }
      } else {
        setSearchError(`No vehicle record found matching "${q}".`);
      }
    } catch (err) {
      console.error(err);
      setSearchError(err.message || "Search request failed");
      setSearchResult(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSuggestion = (vehicle) => {
    const term = vehicle.plate || vehicle.global_vehicle_id;
    setSearchTerm(term);
    setIsDropdownOpen(false);
    setActiveSuggestionIndex(-1);

    // If vehicle already has complete trajectory
    if (Array.isArray(vehicle.trajectory) && vehicle.trajectory.length > 0) {
      setSearchResult(vehicle);
      if (onSelectVehicle) onSelectVehicle(vehicle);
    } else {
      executeSearch(term);
    }
  };

  const handleKeyDown = (e) => {
    if (!isDropdownOpen || suggestions.length === 0) {
      if (e.key === "Enter") {
        executeSearch();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
        handleSelectSuggestion(suggestions[activeSuggestionIndex]);
      } else {
        executeSearch();
      }
    } else if (e.key === "Escape") {
      setIsDropdownOpen(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    setActiveSuggestionIndex(-1);
    setIsDropdownOpen(val.trim().length > 0);
  };

  const activeVehicle = selectedVehicle || searchResult;
  const targetPlate = activeVehicle?.plate || activeVehicle?.global_vehicle_id;

  useEffect(() => {
    if (!targetPlate) {
      setVahanData(null);
      setFraudCheckData(null);
      return;
    }

    if (activeVehicle?.vahan) {
      setVahanData(activeVehicle.vahan);
      setFraudCheckData(activeVehicle.fraud_check);
      return;
    }

    let isMounted = true;
    setLoadingVahan(true);

    Promise.all([
      api.getVahanDetails(targetPlate, activeVehicle?.vehicle_type).catch(() => null),
      api.getFraudCheck(targetPlate).catch(() => null),
    ]).then(([vahan, fraud]) => {
      if (!isMounted) return;
      if (vahan) setVahanData(vahan);
      if (fraud) setFraudCheckData(fraud);
      setLoadingVahan(false);
    });

    return () => {
      isMounted = false;
    };
  }, [targetPlate, activeVehicle?.vahan, activeVehicle?.vehicle_type]);

  const effectiveVahan = activeVehicle?.vahan || vahanData;
  const effectiveFraud = activeVehicle?.fraud_check || fraudCheckData;

  return (
    <div className="vehicle-search-card">
      {/* Search Header */}
      <div>
        <div className="section-eyebrow">Vehicle Search & Tracking</div>
        <h2 className="section-main-heading">Find a Vehicle</h2>
        <p className="section-subtext">
          Find any vehicle across city cameras by number plate or vehicle ID.
        </p>
      </div>

      {/* Hero Input Group with Instagram-Style Auto-Suggest */}
      <div className="search-input-wrapper-relative" ref={searchContainerRef}>
        <div className="search-input-group">
          <div className="search-input-box">
            <Search size={18} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              className="search-text-field font-mono"
              placeholder="Search by license plate number (e.g. Z48H9831N, WB37E1275)..."
              value={searchTerm}
              onChange={handleInputChange}
              onFocus={() => {
                if (searchTerm.trim().length > 0 && suggestions.length > 0) {
                  setIsDropdownOpen(true);
                }
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck="false"
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setSearchTerm("");
                  setIsDropdownOpen(false);
                }}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="search-action-btn"
            disabled={isSearching}
            onClick={() => executeSearch()}
          >
            {isSearching ? "Searching..." : "Search Vehicle"}
          </button>
        </div>

        {/* INSTAGRAM-STYLE SEARCH SUGGESTIONS DROPDOWN */}
        {isDropdownOpen && suggestions.length > 0 && (
          <div className="search-suggestions-dropdown">
            <div className="suggestions-header-bar font-mono">
              <span>MATCHING TARGETS ({suggestions.length})</span>
              <span className="suggestions-hint-key">USE ↑ ↓ TO NAVIGATE • ENTER TO SELECT</span>
            </div>

            <div className="suggestions-list">
              {suggestions.map((v, idx) => {
                const isSelected = idx === activeSuggestionIndex;
                const plate = v.plate;
                const gid = v.global_vehicle_id || v.id;
                const isBlacklisted = Boolean(
                  v.is_blacklisted || v.status === "blacklisted"
                );

                return (
                  <div
                    key={gid || plate || idx}
                    className={`suggestion-item ${isSelected ? "is-active" : ""}`}
                    onMouseEnter={() => setActiveSuggestionIndex(idx)}
                    onClick={() => handleSelectSuggestion(v)}
                  >
                    <div className="suggestion-left">
                      <div className={`suggestion-avatar ${plate ? "has-plate" : ""}`}>
                        <Car size={16} />
                      </div>
                      <div className="suggestion-info">
                        <div className="suggestion-primary-row">
                          <span className="suggestion-plate-text font-mono">
                            {plate
                              ? highlightMatch(plate, searchTerm)
                              : highlightMatch(gid, searchTerm)}
                          </span>
                          <span className="suggestion-type-tag">
                            {v.vehicle_type || "Car"}
                          </span>
                        </div>
                        <div className="suggestion-subline font-mono">
                          <span>{v.camera_count || 1} Cams</span>
                          <span>•</span>
                          <span>{v.observation_count || 1} Obs</span>
                          {v.junctions && v.junctions.length > 0 && (
                            <>
                              <span>•</span>
                              <span>{v.junctions.join(", ")}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="suggestion-right">
                      {isBlacklisted ? (
                        <span className="suggestion-badge-blacklisted font-mono">
                          BLACKLISTED
                        </span>
                      ) : plate ? (
                        <span className="suggestion-badge-verified font-mono">
                          VERIFIED
                        </span>
                      ) : null}
                      <ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Try a target suggestions */}
      <div className="sample-targets-row">
        <span className="sample-targets-label">Try a target:</span>
        {QUICK_SEARCH_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="target-sample-chip font-mono"
            onClick={() => {
              setSearchTerm(ex.label);
              executeSearch(ex.label);
            }}
            title={ex.desc}
          >
            <strong>{ex.label}</strong>
          </button>
        ))}
      </div>

      {searchError && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
            color: "var(--status-error)",
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            fontSize: "12px",
          }}
        >
          <AlertCircle size={15} />
          <span>{searchError}</span>
        </div>
      )}

      {/* Target Result Profile */}
      {activeVehicle && (
        <div className="vehicle-identity-profile">
          <div className="profile-header-strip">
            <div className="profile-identity-lead">
              {activeVehicle.plate ? (
                <div className="hsrp-plate-frame">
                  <div className="hsrp-blue-band">
                    <span>IND</span>
                  </div>
                  <div className="hsrp-number-text">
                    {activeVehicle.plate}
                  </div>
                </div>
              ) : (
                <div className="table-gid-tag font-mono" style={{ fontSize: "14px", padding: "6px 12px" }}>
                  {activeVehicle.global_vehicle_id}
                </div>
              )}
              <span className="vehicle-type-badge">
                <Car size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />
                {activeVehicle.vehicle_type || "Car"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--status-success)" }}>
                ● VEHICLE FOUND
              </div>
              <button
                type="button"
                onClick={() => setIsDossierOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "11.5px",
                  fontWeight: 800,
                  background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                  border: "none",
                  color: "#FFFFFF",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(2, 132, 199, 0.35)",
                  transition: "all 0.15s ease",
                }}
                title="Generate Official Investigation Report (Print / Save as PDF)"
              >
                <FileText size={13} />
                <span>Generate Report</span>
              </button>
            </div>
          </div>

          {/* Cloned / Tampered Plate Detection Alert */}
          {effectiveFraud?.is_cloned_fraud && (
            <div
              style={{
                background: "#FEF2F2",
                border: "2px solid #EF4444",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "#991B1B",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                fontSize: "11.5px",
                lineHeight: 1.4,
              }}
            >
              <ShieldAlert size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ fontSize: "12px", color: "#DC2626" }}>
                  CRITICAL FRAUD ALERT: CLONED / TAMPERED NUMBER PLATE DETECTED
                </strong>
                <div style={{ marginTop: "2px", color: "#7F1D1D" }}>
                  {effectiveFraud.reason}
                </div>
              </div>
            </div>
          )}

          {/* Compact Metrics Quad */}
          <div className="profile-metrics-quad">
            <div className="metric-quad-cell">
              <span className="quad-label">Cameras</span>
              <strong className="quad-value font-mono">
                {activeVehicle.camera_count || 1}
              </strong>
            </div>

            <div className="metric-quad-cell">
              <span className="quad-label">Sightings</span>
              <strong className="quad-value font-mono">
                {activeVehicle.observation_count || (activeVehicle.trajectory || []).length || 1}
              </strong>
            </div>

            <div className="metric-quad-cell">
              <span className="quad-label">Junctions</span>
              <strong className="quad-value font-mono">
                {activeVehicle.junction_count || 1}
              </strong>
            </div>

            <div className="metric-quad-cell">
              <span className="quad-label">First Seen</span>
              <span className="quad-value font-mono" style={{ fontSize: "13px" }}>
                {formatTime(activeVehicle.first_seen)}
              </span>
            </div>
          </div>

          {/* VAHAN 4.0 NATIONAL RC REGISTRY CARD (PROMINENT TOP PLACEMENT) */}
          {loadingVahan && !effectiveVahan && (
            <div
              style={{
                padding: "12px",
                background: "#F8FAFC",
                borderRadius: "8px",
                border: "1px dashed #CBD5E1",
                fontSize: "11.5px",
                color: "#64748B",
                textAlign: "center",
              }}
            >
              Connecting to MoRTH VAHAN 4.0 National Registry...
            </div>
          )}
          <VahanCard vahanData={effectiveVahan} defaultExpanded={false} />

          {/* Camera Journey Stepper inside Search Result */}
          {Array.isArray(activeVehicle.trajectory) && activeVehicle.trajectory.length > 0 && (
            <div className="search-trajectory-passage-box">
              <div className="search-passage-header">
                <span className="search-passage-title">
                  CAMERA TRAVEL TIMELINE ({activeVehicle.trajectory.length} SIGHTINGS)
                </span>
              </div>
              <div className="search-stepper-nodes-row">
                {activeVehicle.trajectory.map((event, idx) => {
                  const isLast = idx === activeVehicle.trajectory.length - 1;
                  const rawCamId = event.camera_id;
                  const canonicalCam = normalizeCameraId(rawCamId);
                  const timestamp =
                    event.first_time_sec ??
                    event.timestamp_seconds ??
                    event.timestamp_sec ??
                    event.start_timestamp ??
                    0;
                  const duration = event.duration_sec ?? event.duration;
                  const cameraTitle = getCanonicalCameraName(canonicalCam, event.camera_name);
                  const junctionTitle = getCanonicalJunctionName(event.junction_name || event.junction || event.junction_id);

                  return (
                    <div key={`${canonicalCam}-${idx}`} className="search-stepper-node">
                      <div className="search-node-badge font-mono">{idx + 1}</div>
                      <div className="search-node-details">
                        <div className="search-node-name">
                          {cameraTitle}
                        </div>
                        <div className="search-node-sub font-mono">
                          {junctionTitle} • {event.vehicle_type || activeVehicle.vehicle_type || "Vehicle"}
                        </div>
                        <div className="search-node-time font-mono">
                          {formatTime(timestamp)}
                          {duration ? ` (${formatTime(duration)})` : ""}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="search-node-play-btn font-mono"
                        onClick={() => {
                          const targetPlate = activeVehicle.plate || activeVehicle.global_vehicle_id;
                          if (onPlayEvent) {
                            onPlayEvent(
                              canonicalCam,
                              timestamp,
                              `${targetPlate} @ ${cameraTitle}`,
                              {
                                plate: targetPlate,
                                plate_image: event.plate_image || event.plate_image_url || activeVehicle.plate_image_url,
                                vehicle_type: event.vehicle_type || activeVehicle.vehicle_type,
                                isBlacklisted: Boolean(activeVehicle.is_blacklisted || activeVehicle.status === "blacklisted"),
                                confidence: event.plate_confidence || event.ocr_confidence || 0.96,
                              }
                            );
                          }
                          if (onFocusCamera) {
                            onFocusCamera(canonicalCam);
                          }
                        }}
                        title={`Seek ${cameraTitle} to ${formatTime(timestamp)} and play evidence`}
                      >
                        <Play size={10} fill="currentColor" />
                        PLAY
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {/* OFFICIAL POLICE INVESTIGATION DOSSIER & EVIDENCE MODAL */}
      {isDossierOpen && activeVehicle && (
        <PoliceDossierModal
          isOpen={isDossierOpen}
          onClose={() => setIsDossierOpen(false)}
          vehicle={activeVehicle}
          cameras={cameras}
        />
      )}
    </div>
  );
}
