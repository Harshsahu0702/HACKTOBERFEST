import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Play,
  Pause,
  Maximize2,
  Camera,
  Clock,
  Navigation,
  MapPin,
  Car,
  ChevronRight,
  Flame,
  Activity,
  Printer,
  FileText,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { api, formatTime } from "../services/api";
import { PoliceDossierModal } from "./PoliceDossierModal";

import {
  CANONICAL_JUNCTIONS,
  JUNCTION_TACTICAL_ROUTE,
  buildJunctionListWithCameras,
  getJunctionPinIcon,
  MovingVehicleBlip,
} from "./MapView";

const TILE_PROVIDERS = {
  streets: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    name: "Streets",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    name: "3D Satellite",
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    name: "Cyber Dark",
  },
};

function createVehiclePinIcon(point, index, totalPoints, plate) {
  const isLatest = index === totalPoints - 1;
  const label = totalPoints === 1 ? (plate || "CAR") : (isLatest ? "TARGET" : `#${index + 1}`);

  return L.divIcon({
    className: "custom-leaflet-vehicle-pin-div",
    html: `
      <div class="leaflet-pin-wrapper ${isLatest ? "latest-pin" : ""}">
        <div class="leaflet-pin-pulse"></div>
        <div class="leaflet-pin-badge">${label}</div>
        <svg class="leaflet-pin-svg" xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 24 24" fill="#DC2626" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
          <circle cx="12" cy="10" r="3.2" fill="#FFFFFF"/>
        </svg>
      </div>
    `,
    iconSize: [32, 44],
    iconAnchor: [16, 38],
    popupAnchor: [0, -40],
  });
}

function createDroneBlipIcon(headingAngle) {
  const safeHeading = Number.isFinite(headingAngle) ? headingAngle : 0;
  return L.divIcon({
    className: "clean-leaflet-blip-div",
    html: `
      <div class="clean-blip-root">
        <div class="clean-blip-pulse"></div>
        <div class="clean-blip-rotator" style="transform: rotate(${safeHeading}deg);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L21 20L12 16L3 20L12 2Z" fill="#DC2626" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="12" cy="11" r="2.5" fill="#FDE047"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function getInterpolatedTrajectoryState(points, progress) {
  if (!points || points.length === 0) return null;
  if (points.length === 1) {
    return {
      lat: points[0].lat,
      lng: points[0].lng,
      heading: 0,
      currentSegmentIndex: 0,
      nextPointName: points[0].shortName || points[0].junction_name || "Junction Node",
      currentSpeed: points[0].speed || 45,
      activeJunctionId: points[0].junction_id,
    };
  }

  let totalDist = 0;
  const segDists = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dLat = points[i + 1].lat - points[i].lat;
    const dLng = (points[i + 1].lng - points[i].lng) * Math.cos((points[i].lat * Math.PI) / 180);
    const d = Math.sqrt(dLat * dLat + dLng * dLng) || 0.000001;
    segDists.push(d);
    totalDist += d;
  }

  const targetDist = Math.max(0, Math.min(1, progress)) * totalDist;
  let accumulated = 0;
  let segIdx = 0;
  let u = 0;

  for (let i = 0; i < segDists.length; i++) {
    if (accumulated + segDists[i] >= targetDist || i === segDists.length - 1) {
      segIdx = i;
      u = segDists[i] > 0 ? (targetDist - accumulated) / segDists[i] : 0;
      break;
    }
    accumulated += segDists[i];
  }
  u = Math.max(0, Math.min(1, u));

  const pCurrent = points[segIdx];
  const pNext = points[segIdx + 1];

  const lat = pCurrent.lat + u * (pNext.lat - pCurrent.lat);
  const lng = pCurrent.lng + u * (pNext.lng - pCurrent.lng);

  const dLat = pNext.lat - pCurrent.lat;
  const dLng = (pNext.lng - pCurrent.lng) * Math.cos((pCurrent.lat * Math.PI) / 180);
  let heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  if (heading < 0) heading += 360;

  const s0 = Number(pCurrent.speed) || 45;
  const s1 = Number(pNext.speed) || 52;
  const currentSpeed = (s0 + u * (s1 - s0)).toFixed(1);

  let activeJunctionId = null;
  if (u < 0.22) {
    activeJunctionId = pCurrent.junction_id;
  } else if (u > 0.78) {
    activeJunctionId = pNext.junction_id;
  }

  return {
    lat,
    lng,
    heading,
    currentSegmentIndex: segIdx,
    nextPointName: pNext.shortName || pNext.junction_name || `Junction #${segIdx + 2}`,
    currentSpeed,
    activeJunctionId,
    u,
  };
}

function MapController({ bounds, centerTarget }) {
  const map = useMap();

  useEffect(() => {
    if (centerTarget) {
      map.flyTo([centerTarget.lat, centerTarget.lng], 17, { animate: true, duration: 1 });
    } else if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }, [bounds, centerTarget, map]);

  return null;
}

export function FullMapModal({
  isOpen,
  onClose,
  cameras,
  selectedVehicle,
  selectedCameraId,
  onCameraSelect,
  onPlayEvent,
  onSelectVehicle,
  vehicles = [],
  analytics,
}) {
  const [focusedCoord, setFocusedCoord] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isDossierOpen, setIsDossierOpen] = useState(false);

  // Map Layer State
  const [mapLayer, setMapLayer] = useState("streets");

  // Crazy Trajectory State
  const [isPlaying, setIsPlaying] = useState(true);
  const [animProgress, setAnimProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDemoActive, setIsDemoActive] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const trajectory = useMemo(() => {
    if (!selectedVehicle) return [];
    return (
      selectedVehicle.trajectory ||
      selectedVehicle.events ||
      selectedVehicle.timeline ||
      []
    );
  }, [selectedVehicle]);

  // Aggregate cameras into canonical city junctions with live telemetry
  const junctionsList = useMemo(() => {
    return buildJunctionListWithCameras(cameras, analytics);
  }, [cameras, analytics]);

  // Clean Junction-to-Junction trajectory checkpoints
  const trajectoryPoints = useMemo(() => {
    if (trajectory.length > 0) {
      const jPoints = [];
      trajectory.forEach((point) => {
        let jId = point.junction_id || point.junction || "";
        if (!jId) {
          if (point.camera_id?.includes("junction_a") || point.camera_id?.includes("south_gate")) jId = "junction_A";
          else if (point.camera_id?.includes("junction_b") || point.camera_id?.includes("north_gate")) jId = "junction_B";
          else if (point.camera_id?.includes("corridor")) jId = "corridor_A_B";
          else jId = "junction_A";
        }
        const canon = CANONICAL_JUNCTIONS[jId] || CANONICAL_JUNCTIONS["junction_A"];
        if (jPoints.length === 0 || jPoints[jPoints.length - 1].junction_id !== jId) {
          jPoints.push({
            junction_id: jId,
            junction_name: canon.name,
            shortName: canon.shortName,
            lat: canon.lat,
            lng: canon.lng,
            speed: point.speed || 48,
            timestamp_sec: point.timestamp_sec || point.timestamp,
          });
        }
      });
      return jPoints;
    }

    if (selectedVehicle) {
      let jId = selectedVehicle.junction_id || selectedVehicle.junction || "";
      if (!jId) {
        const cId = selectedVehicle.last_camera_id || selectedVehicle.camera_id || "";
        if (cId.includes("junction_a")) jId = "junction_A";
        else if (cId.includes("junction_b")) jId = "junction_B";
        else if (cId.includes("corridor")) jId = "corridor_A_B";
        else jId = "junction_A";
      }
      const canon = CANONICAL_JUNCTIONS[jId] || CANONICAL_JUNCTIONS["junction_A"];
      return [
        {
          junction_id: jId,
          junction_name: canon.name,
          shortName: canon.shortName,
          lat: canon.lat,
          lng: canon.lng,
          speed: 48,
          timestamp_sec: selectedVehicle.last_seen_sec || 200,
        },
      ];
    }

    return [];
  }, [trajectory, selectedVehicle]);

  const activeTrajectoryPoints = useMemo(() => {
    if (trajectoryPoints.length > 1) {
      return trajectoryPoints;
    }
    if (isDemoActive || (!selectedVehicle && trajectoryPoints.length === 0)) {
      return JUNCTION_TACTICAL_ROUTE;
    }
    return trajectoryPoints;
  }, [trajectoryPoints, isDemoActive, selectedVehicle]);

  // Detailed optical camera sightings for sidebar evidence playback
  const rawSightingEvents = useMemo(() => {
    if (trajectory.length > 0) return trajectory;
    if (selectedVehicle) {
      const cId = selectedVehicle.last_camera_id || selectedVehicle.first_camera_id || selectedVehicle.camera_id;
      if (cId) {
        return [
          {
            camera_id: cId,
            camera_name: cameras?.[cId]?.camera_name || cId,
            junction_id: selectedVehicle.junction_id || "junction_A",
            timestamp_sec: selectedVehicle.last_seen_sec || 200,
            speed: selectedVehicle.estimated_speed || 48,
            ocr_confidence: selectedVehicle.confidence || 0.98,
            plate_image_url: selectedVehicle.plate_image_url,
          },
        ];
      }
    }
    if (isDemoActive || !selectedVehicle) {
      return [
        { camera_id: "junction_A_camera_01", camera_name: "Junction A — Camera 01 (Inbound Entry)", junction_name: "Junction A — South Gate Quad", junction_id: "junction_A", timestamp_sec: 198.0, speed: 42.5, ocr_confidence: 0.98 },
        { camera_id: "junction_A_camera_02", camera_name: "Junction A — Camera 02 (Outbound Exit)", junction_name: "Junction A — South Gate Quad", junction_id: "junction_A", timestamp_sec: 204.2, speed: 48.0, ocr_confidence: 0.96 },
        { camera_id: "arterial_link_corridor", camera_name: "Vivekananda Arterial Link Corridor", junction_name: "Vivekananda Link Corridor", junction_id: "corridor_A_B", timestamp_sec: 216.5, speed: 64.2, ocr_confidence: 0.99 },
        { camera_id: "junction_B_camera_01", camera_name: "Junction B — Camera 01 (Inbound Entry)", junction_name: "Junction B — North Transit Plaza", junction_id: "junction_B", timestamp_sec: 225.3, speed: 51.7, ocr_confidence: 0.97 },
        { camera_id: "junction_B_camera_02", camera_name: "Junction B — Camera 02 (Outbound Exit)", junction_name: "Junction B — North Transit Plaza", junction_id: "junction_B", timestamp_sec: 229.7, speed: 46.8, ocr_confidence: 0.97 },
      ];
    }
    return [];
  }, [trajectory, selectedVehicle, cameras, isDemoActive]);

  const activePlate = useMemo(() => {
    if (selectedVehicle) {
      return (
        selectedVehicle.plate ||
        selectedVehicle.plate_number ||
        selectedVehicle.normalized_plate ||
        selectedVehicle.global_vehicle_id ||
        "TARGET"
      );
    }
    return isDemoActive ? "JH10CS2095" : "TARGET RECON";
  }, [selectedVehicle, isDemoActive]);

  // Throttled telemetry state so FullMapModal NEVER lags
  const [displaySpeed, setDisplaySpeed] = useState(48);

  const handleTelemetry = (prog, spd) => {
    setAnimProgress(prog);
    setDisplaySpeed(spd);
  };

  const mapBounds = useMemo(() => {
    if (activeTrajectoryPoints.length > 0) {
      return activeTrajectoryPoints.map((p) => [p.lat, p.lng]);
    }
    if (junctionsList.length > 0) {
      return junctionsList.map((j) => [j.lat, j.lng]);
    }
    return null;
  }, [activeTrajectoryPoints, junctionsList]);

  const handleTriggerCrazyDemo = () => {
    if (vehicles && vehicles.length > 0 && onSelectVehicle) {
      const targetVehicle =
        vehicles.find((v) => (v.trajectory && v.trajectory.length > 1) || v.plate === "JH10CS2095") ||
        vehicles[0];
      if (targetVehicle) {
        onSelectVehicle(targetVehicle);
        setIsDemoActive(false);
        setAnimProgress(0);
        setIsPlaying(true);
        return;
      }
    }
    setIsDemoActive(true);
    setAnimProgress(0);
    setIsPlaying(true);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop-light full-map-fixed-backdrop" onClick={onClose}>
      <div
        className="full-map-modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="modal-header-strip full-map-header">
          <div>
            <div className="section-eyebrow">City Map & Route GIS Tracker</div>
            <div className="full-map-title-row">
              <h2 className="full-map-heading">
                City Map & Autonomous Route Tracker
              </h2>
              {selectedVehicle ? (
                <div className="full-map-target-chip font-mono">
                  <span className="target-chip-dot"></span>
                  <span>VEHICLE: {activePlate}</span>
                  <span className="target-chip-sep">•</span>
                  <span>{activeTrajectoryPoints.length} SIGHTINGS</span>
                  {selectedVehicle.estimated_average_speed_label && (
                    <>
                      <span className="target-chip-sep">•</span>
                      <span>SPD: {selectedVehicle.estimated_average_speed_label}</span>
                    </>
                  )}
                </div>
              ) : isDemoActive ? (
                <div className="full-map-target-chip font-mono" style={{ borderColor: "#10B981", color: "#10B981" }}>
                  <span className="target-chip-dot" style={{ backgroundColor: "#10B981" }}></span>
                  <span>⚡ LIVE DEMO: JH10CS2095 • 4 SIGHTINGS • DUAL CORRIDOR</span>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>

            {/* MAP LAYER SELECTOR */}
            <div className="map-layer-pill-group font-mono">
              <button
                type="button"
                className={`layer-pill-btn ${mapLayer === "streets" ? "active" : ""}`}
                onClick={() => setMapLayer("streets")}
                title="Standard Street Map"
              >
                Street
              </button>
              <button
                type="button"
                className={`layer-pill-btn ${mapLayer === "satellite" ? "active" : ""}`}
                onClick={() => setMapLayer("satellite")}
                title="ESRI Photorealistic Satellite Imagery"
              >
                Satellite
              </button>
              <button
                type="button"
                className={`layer-pill-btn ${mapLayer === "dark" ? "active" : ""}`}
                onClick={() => setMapLayer("dark")}
                title="Dark Cyber Tactical"
              >
                Dark
              </button>
            </div>

            {/* TRAFFIC HEATMAP */}
            <button
              type="button"
              onClick={() => setShowHeatmap(!showHeatmap)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "6px",
                border: showHeatmap ? "1.5px solid #DC2626" : "1px solid var(--border-default, #cbd5e1)",
                background: showHeatmap ? "rgba(220, 38, 38, 0.12)" : "var(--bg-canvas-subtle, #f8fafc)",
                color: showHeatmap ? "#DC2626" : "var(--text-primary, #0f172a)",
                fontWeight: 700,
                fontSize: "12px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: showHeatmap ? "0 0 10px rgba(220, 38, 38, 0.25)" : "none",
              }}
              title="Toggle City-Wide Traffic Density Heatmap"
            >
              <Flame size={14} style={{ color: showHeatmap ? "#DC2626" : "var(--text-muted)" }} />
              <span>{showHeatmap ? "HEATMAP: ACTIVE" : "TRAFFIC HEATMAP"}</span>
            </button>

            {/* CRAZY DEMO LAUNCHER */}
            {!selectedVehicle && !isDemoActive && (
              <button
                type="button"
                onClick={handleTriggerCrazyDemo}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #DC2626",
                  background: "rgba(220, 38, 38, 0.12)",
                  color: "#DC2626",
                  fontWeight: 800,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
                title="Run Crazy Trajectory Animation Demo"
              >
                <Sparkles size={14} />
                <span>RUN CRAZY DEMO</span>
              </button>
            )}

            {selectedVehicle && (
              <button
                type="button"
                onClick={() => setIsDossierOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: "12px",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(2, 132, 199, 0.35)",
                  transition: "all 0.15s ease",
                }}
                title="Generate Official Investigation Report (Print / Save PDF)"
              >
                <FileText size={14} />
                <span>GENERATE REPORT</span>
              </button>
            )}

            <button
              type="button"
              className="modal-close-icon-btn"
              onClick={onClose}
              title="Close Fullscreen Map (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* BODY SPLIT: LARGE MAP (LEFT) + TIMELINE DETAILS (RIGHT) */}
        <div className="full-map-body-grid">
          {/* LEFT: EXPANSIVE LEAFLET MAP WITH CRAZY TRAJECTORY */}
          <div className="full-map-canvas-pane">
            <MapContainer
              center={[23.7121, 86.9525]}
              zoom={16}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                key={mapLayer}
                url={TILE_PROVIDERS[mapLayer].url}
                attribution={TILE_PROVIDERS[mapLayer].attribution}
                maxZoom={19}
              />

              {/* TRAFFIC DENSITY HEATMAP LAYER */}
              {showHeatmap && junctionsList.map((junc) => (
                <React.Fragment key={`heatmap-${junc.id}`}>
                  <Circle
                    center={[junc.lat, junc.lng]}
                    radius={120}
                    pathOptions={{
                      color: "#DC2626",
                      fillColor: "#DC2626",
                      fillOpacity: 0.14,
                      weight: 0,
                    }}
                  />
                  <Circle
                    center={[junc.lat, junc.lng]}
                    radius={70}
                    pathOptions={{
                      color: "#D97706",
                      fillColor: "#D97706",
                      fillOpacity: 0.26,
                      weight: 0,
                    }}
                  />
                  <Circle
                    center={[junc.lat, junc.lng]}
                    radius={32}
                    pathOptions={{
                      color: "#EF4444",
                      fillColor: "#EF4444",
                      fillOpacity: 0.45,
                      weight: 1,
                    }}
                  />
                </React.Fragment>
              ))}

              {/* CRAZYYYYYY MULTI-LAYER TRAJECTORY LASER PATHS */}
              {activeTrajectoryPoints.length > 1 && (
                <>
                  <Polyline
                    positions={activeTrajectoryPoints.map((p) => [p.lat, p.lng])}
                    pathOptions={{
                      color: "#DC2626",
                      weight: 5,
                      opacity: 0.95,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                  <Polyline
                    positions={activeTrajectoryPoints.map((p) => [p.lat, p.lng])}
                    pathOptions={{
                      color: "#FDE047",
                      weight: 2,
                      opacity: 0.95,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />

                  {/* Clean Moving Vehicle Blip (Isolated for zero lag) */}
                  <MovingVehicleBlip
                    points={activeTrajectoryPoints}
                    isPlaying={isPlaying}
                    playbackSpeed={playbackSpeed}
                    manualProgress={animProgress}
                    onTelemetry={handleTelemetry}
                  />
                </>
              )}

              {/* 2 JUNCTION PINS ONLY (Click to open clean popup with 2 cameras, NO VIDEO) */}
              {junctionsList.map((junction) => {
                const isA = junction.id === "junction_A" || junction.code === "A";
                return (
                  <Marker
                    key={`fullmap-junction-${junction.id}`}
                    position={[junction.lat, junction.lng]}
                    icon={getJunctionPinIcon(junction.id)}
                  >
                    <Popup className="clean-junction-popup-wrapper" minWidth={260} maxWidth={300}>
                      <div className="clean-junc-popup-card">
                        {/* Header */}
                        <div className="clean-popup-header">
                          <div className="clean-popup-title-box">
                            <span
                              className="clean-popup-badge-dot"
                              style={{ background: isA ? "#2563EB" : "#DC2626" }}
                            />
                            <span className="clean-popup-title">{junction.name}</span>
                          </div>
                          <span className="clean-popup-count-badge">2 Cameras</span>
                        </div>

                        {/* Camera Names Only — Zero Video, Super Fast & Clean */}
                        <div className="clean-popup-cams-list">
                          {junction.cameras.map((cam, idx) => (
                            <div
                              key={cam.id}
                              className="clean-popup-cam-row"
                              onClick={() => onCameraSelect?.(cam.id)}
                              title={`Click to focus ${cam.name}`}
                            >
                              <div className="clean-popup-cam-badge">
                                <Camera size={14} color={isA ? "#2563EB" : "#DC2626"} />
                                <span>0{idx + 1}</span>
                              </div>
                              <div className="clean-popup-cam-text-block">
                                <div className="clean-popup-cam-name-text">{cam.name}</div>
                                <div className="clean-popup-cam-meta-text">
                                  <span className="clean-status-indicator">● Active</span>
                                  <span className="clean-focus-btn">Focus ➔</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              <MapController bounds={mapBounds} centerTarget={focusedCoord} />
            </MapContainer>

            {/* REPLAY CONTROL DECK DOCKED IN MODAL */}
            {activeTrajectoryPoints.length > 1 && (
              <div className="trajectory-replay-deck font-mono modal-replay-deck">
                <div className="deck-playback-group">
                  <button
                    type="button"
                    className={`deck-play-btn ${isPlaying ? "playing" : ""}`}
                    onClick={() => setIsPlaying(!isPlaying)}
                    title={isPlaying ? "Pause Trajectory Replay" : "Play Trajectory Replay"}
                  >
                    {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                    <span>{isPlaying ? "PAUSE" : "PLAY"}</span>
                  </button>

                  <button
                    type="button"
                    className="deck-reset-btn"
                    onClick={() => setAnimProgress(0)}
                    title="Rewind to Trajectory Origin"
                  >
                    <RotateCcw size={12} />
                  </button>

                  <div className="deck-speed-selector">
                    {[0.5, 1, 2, 4].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        className={`deck-speed-chip ${playbackSpeed === spd ? "active" : ""}`}
                        onClick={() => setPlaybackSpeed(spd)}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="deck-scrub-bar-wrapper">
                  <span className="deck-progress-pct">
                    {Math.round(animProgress * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    value={Math.round(animProgress * 1000)}
                    onChange={(e) => setAnimProgress(Number(e.target.value) / 1000)}
                    className="deck-slider-input"
                    title="Scrub Trajectory Position"
                  />
                </div>

                <div className="deck-telemetry-status">
                  <span className="telemetry-live-dot"></span>
                  <span className="telemetry-spd-val">{displaySpeed || 48} KM/H</span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: CAMERA SIGHTINGS & PLAY EVENT ACTION LIST */}
          <div className="full-map-timeline-sidebar">
            <div className="full-map-sidebar-header">
              <span className="sidebar-header-title">Camera Sighting Timeline</span>
              <span className="sidebar-header-count font-mono">
                {rawSightingEvents.length} SIGHTING{rawSightingEvents.length === 1 ? "" : "S"}
              </span>
            </div>

            <div className="full-map-event-list">
              {rawSightingEvents.length === 0 ? (
                <div className="full-map-empty-state">
                  <Car size={32} style={{ color: "var(--text-dim)", marginBottom: "8px" }} />
                  <div>No vehicle selected.</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Select a vehicle or click "RUN CRAZY DEMO" above to track its full journey.
                  </div>
                </div>
              ) : (
                rawSightingEvents.map((event, index) => {
                  const timestamp =
                    event.first_time_sec ??
                    event.timestamp_seconds ??
                    event.timestamp_sec ??
                    event.timestamp ??
                    0;
                  const duration = event.duration_sec ?? event.duration;
                  const isLatest = index === rawSightingEvents.length - 1;
                  const activeNodeIndex = rawSightingEvents.length > 1
                    ? Math.min(rawSightingEvents.length - 1, Math.round(animProgress * (rawSightingEvents.length - 1)))
                    : 0;
                  const isCurrentTargetNode = activeNodeIndex === index;

                  return (
                    <div
                      key={`timeline-card-${index}`}
                      className={`full-map-event-card ${isLatest ? "is-latest-card" : ""} ${isCurrentTargetNode ? "node-active-highlight" : ""}`}
                      onClick={() => {
                        const fraction = rawSightingEvents.length > 1
                          ? index / (rawSightingEvents.length - 1)
                          : 0;
                        setAnimProgress(fraction);
                        const junc = junctionsList.find(
                          (j) => j.id === event.junction_id || j.cameraIds?.includes(event.camera_id)
                        );
                        if (junc) {
                          setFocusedCoord({ lat: junc.lat, lng: junc.lng });
                        }
                      }}
                      style={{ cursor: "pointer" }}
                      title="Click to jump trajectory drone directly to this sighting checkpoint"
                    >
                      <div className="event-card-top-row">
                        <div className="event-card-seq-badge font-mono">
                          {index + 1}
                        </div>
                        <div className="event-card-lead">
                          <div className="event-card-cam-title">
                            {event.camera_name || cameraId}
                          </div>
                          <div className="event-card-junction-sub font-mono">
                            {event.junction_name || event.junction || (event.junction_id === "junction_B" ? "Kanyapur Link Road" : "Vivekananda Sarani")}
                          </div>
                        </div>

                        {/* PLAY EVENT BUTTON */}
                        <button
                          type="button"
                          className="event-card-play-btn font-mono"
                          onClick={(e) => {
                            e.stopPropagation();
                            const targetPlate =
                              event.plate ||
                              event.raw_plate ||
                              selectedVehicle?.plate ||
                              selectedVehicle?.plate_number ||
                              selectedVehicle?.normalized_plate ||
                              selectedVehicle?.global_vehicle_id ||
                              "";

                            if (onPlayEvent) {
                              onPlayEvent(
                                cameraId,
                                timestamp,
                                `${targetPlate || "Target"} @ ${event.camera_name || cameraId}`,
                                {
                                  plate: targetPlate,
                                  plate_number: targetPlate,
                                  normalized_plate: targetPlate,
                                  timestamp,
                                  duration,
                                  vehicle_track_id: event.vehicle_track_id,
                                  vehicle_type: event.vehicle_type || selectedVehicle?.vehicle_type || "car",
                                  plate_image_url: event.plate_image_url,
                                }
                              );
                            }
                          }}
                          title="Play Recorded Optical CCTV Footage"
                        >
                          <Play size={10} fill="currentColor" />
                          <span>EVIDENCE</span>
                        </button>
                      </div>

                      {/* STATS ROW */}
                      <div className="event-card-metrics-grid font-mono">
                        <div className="metric-pill">
                          <Clock size={11} className="metric-icon" />
                          <span>{formatTime(timestamp)}</span>
                        </div>
                        {event.speed && (
                          <div className="metric-pill">
                            <Activity size={11} className="metric-icon" />
                            <span>{event.speed} km/h</span>
                          </div>
                        )}
                        <div
                          className="metric-pill"
                          style={{
                            color: "var(--status-success)",
                            background: "rgba(16, 185, 129, 0.08)",
                            borderColor: "rgba(16, 185, 129, 0.25)",
                          }}
                        >
                          <span>MATCH {(event.ocr_confidence ? (event.ocr_confidence * 100).toFixed(0) : "99")}%</span>
                        </div>
                      </div>

                      {/* PLATE CROP PREVIEW */}
                      {event.plate_image_url && (
                        <div className="event-card-plate-thumb">
                          <img
                            src={event.plate_image_url}
                            alt={event.plate || "Number Plate"}
                            className="event-plate-img"
                            onError={(e) => (e.target.style.display = "none")}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* POLICE DOSSIER MODAL */}
        {selectedVehicle && (
          <PoliceDossierModal
            isOpen={isDossierOpen}
            onClose={() => setIsDossierOpen(false)}
            vehicle={selectedVehicle}
            trajectory={activeTrajectoryPoints}
            cameras={cameras}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
