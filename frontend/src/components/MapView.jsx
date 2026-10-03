import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  Camera,
  Maximize2,
  Flame,
  Layers,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Compass,
  Crosshair,
  Radio,
  Eye,
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
import { FullMapModal } from "./FullMapModal";
import { JourneyRouteSummary } from "./JourneyRouteSummary";

// Canonical Smart City Junction Nodes (Only 2: Junction A & Junction B)
export const CANONICAL_JUNCTIONS = {
  junction_A: {
    id: "junction_A",
    name: "Junction A",
    code: "A",
    lat: 23.710299,
    lng: 86.952779,
    cameraIds: ["junction_A_camera_01", "junction_A_camera_02"],
  },
  junction_B: {
    id: "junction_B",
    name: "Junction B",
    code: "B",
    lat: 23.713932,
    lng: 86.952211,
    cameraIds: ["junction_B_camera_01", "junction_B_camera_02"],
  },
};

// Route directly between Junction A and Junction B
export const JUNCTION_TACTICAL_ROUTE = [
  {
    junction_id: "junction_A",
    junction_name: "Junction A",
    lat: 23.710299,
    lng: 86.952779,
    speed: 46.5,
  },
  {
    junction_id: "junction_B",
    junction_name: "Junction B",
    lat: 23.713932,
    lng: 86.952211,
    speed: 51.2,
  },
];

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

// Aggregates cameras for the 2 junctions
export function buildJunctionListWithCameras(cameras) {
  const cameraMap = cameras || {};
  return Object.values(CANONICAL_JUNCTIONS).map((junc) => {
    const juncCameras = junc.cameraIds.map((camId) => {
      const cam = cameraMap[camId];
      const is01 = camId.includes("01");
      const defaultName = is01
        ? `${junc.name} — Camera 01 (Inbound Entry)`
        : `${junc.name} — Camera 02 (Outbound Exit)`;
      return {
        id: camId,
        camera_id: camId,
        name: cam?.camera_name || cam?.name || defaultName,
        camera_name: cam?.camera_name || cam?.name || defaultName,
        direction: is01 ? "Inbound" : "Outbound",
      };
    });

    return {
      ...junc,
      cameras: juncCameras,
    };
  });
}

// Rock-Solid Static Icon Cache (Prevents Leaflet DOM destruction / vibrating)
const JUNCTION_ICON_CACHE = {};
export function getJunctionPinIcon(junctionId) {
  const isA = junctionId === "junction_A" || junctionId === "A";
  const key = isA ? "A" : "B";
  if (!JUNCTION_ICON_CACHE[key]) {
    const pinColor = isA ? "#2563EB" : "#DC2626";
    JUNCTION_ICON_CACHE[key] = L.divIcon({
      className: "clean-leaflet-junction-div",
      html: `
        <div class="clean-junc-pin-root" title="${isA ? "Junction A" : "Junction B"}">
          <div class="clean-pin-body">
            <svg width="36" height="46" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 0C7.61116 0 0 7.61116 0 17C0 28.5 17 44 17 44C17 44 34 28.5 34 17C34 7.61116 26.3888 0 17 0Z" fill="${pinColor}"/>
              <circle cx="17" cy="16" r="11" fill="#FFFFFF"/>
              <text x="17" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="900" fill="${pinColor}" text-anchor="middle">${key}</text>
            </svg>
          </div>
        </div>
      `,
      iconSize: [36, 46],
      iconAnchor: [18, 46],
      popupAnchor: [0, -48],
    });
  }
  return JUNCTION_ICON_CACHE[key];
}

export function createJunctionIcon(junction) {
  return getJunctionPinIcon(junction?.id || junction);
}

// Cached Drone Blip Icon (Quantized heading avoids object churn)
const BLIP_ICON_CACHE = {};
export function getDroneBlipIcon(headingAngle) {
  const safeHeading = Number.isFinite(headingAngle) ? headingAngle : 0;
  const bucket = Math.round(safeHeading / 4) * 4;
  if (!BLIP_ICON_CACHE[bucket]) {
    BLIP_ICON_CACHE[bucket] = L.divIcon({
      className: "clean-leaflet-blip-div",
      html: `
        <div class="clean-blip-root">
          <div class="clean-blip-rotator" style="transform: rotate(${bucket}deg);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L21 20L12 16L3 20L12 2Z" fill="#DC2626" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
              <circle cx="12" cy="11" r="2.5" fill="#FDE047"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  return BLIP_ICON_CACHE[bucket];
}

export function createDroneBlipIcon(headingAngle) {
  return getDroneBlipIcon(headingAngle);
}

// Isolated Moving Vehicle Marker to eliminate MapView re-render lag
export function MovingVehicleBlip({ points, isPlaying, playbackSpeed, manualProgress, onTelemetry }) {
  const [progress, setProgress] = useState(manualProgress || 0);
  const animRef = useRef({ progress: manualProgress || 0, lastTime: performance.now() });
  const lastTelemetryRef = useRef(0);

  useEffect(() => {
    if (manualProgress !== undefined && Math.abs(manualProgress - animRef.current.progress) > 0.008) {
      animRef.current.progress = manualProgress;
      setProgress(manualProgress);
    }
  }, [manualProgress]);

  useEffect(() => {
    if (!isPlaying || !points || points.length < 2) return;

    let animId;
    animRef.current.lastTime = performance.now();
    const durationMs = 12000;

    const loop = (now) => {
      const delta = now - animRef.current.lastTime;
      animRef.current.lastTime = now;

      let next = animRef.current.progress + (delta * playbackSpeed) / durationMs;
      if (next >= 1) next = 0;
      animRef.current.progress = next;

      setProgress(next);

      if (now - lastTelemetryRef.current > 150) {
        lastTelemetryRef.current = now;
        if (onTelemetry) {
          const st = getInterpolatedTrajectoryState(points, next);
          onTelemetry(next, st?.currentSpeed || 48);
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playbackSpeed, points, onTelemetry]);

  const blipState = useMemo(() => {
    if (!points || points.length < 2) return null;
    return getInterpolatedTrajectoryState(points, progress);
  }, [points, progress]);

  if (!blipState) return null;

  return (
    <Marker
      position={[blipState.lat, blipState.lng]}
      icon={getDroneBlipIcon(blipState.heading)}
      zIndexOffset={2500}
    />
  );
}

// Coordinate interpolation and heading calculation along multi-segment trajectory (Junction to Junction)
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

  // Forward Azimuth Heading
  const dLat = pNext.lat - pCurrent.lat;
  const dLng = (pNext.lng - pCurrent.lng) * Math.cos((pCurrent.lat * Math.PI) / 180);
  let heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  if (heading < 0) heading += 360;

  const s0 = Number(pCurrent.speed) || 45;
  const s1 = Number(pNext.speed) || 52;
  const currentSpeed = (s0 + u * (s1 - s0)).toFixed(1);

  // Check if drone is near a junction node for intercept ping
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

function MapBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [bounds, map]);
  return null;
}

export function MapView({
  cameras,
  selectedVehicle,
  selectedCameraId,
  onCameraSelect,
  analytics,
  onPlayEvent,
  onOpenFullMap,
  onSelectVehicle,
  vehicles = [],
}) {
  const [isFullMapOpen, setIsFullMapOpen] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);


  // Map Layer State
  const [mapLayer, setMapLayer] = useState("streets"); // "streets" | "satellite" | "dark"

  // Crazy Trajectory Animation State
  const [isPlaying, setIsPlaying] = useState(true);
  const [animProgress, setAnimProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.5x, 1x, 2x, 4x
  const [isDemoActive, setIsDemoActive] = useState(false);

  // Raw vehicle trajectory from props
  const trajectory = useMemo(() => {
    if (!selectedVehicle) return [];
    return (
      selectedVehicle.trajectory ||
      selectedVehicle.events ||
      selectedVehicle.timeline ||
      []
    );
  }, [selectedVehicle]);

  // Generate canonical junction list with all assigned cameras & analytics
  const junctionsList = useMemo(() => {
    return buildJunctionListWithCameras(cameras, analytics);
  }, [cameras, analytics]);

  // Generate junction-to-junction vehicle trajectory points
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
        // Avoid consecutive duplicate junctions to keep clean junction-to-junction route
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
        },
      ];
    }

    return [];
  }, [trajectory, selectedVehicle]);

  // Active path for the crazy trajectory animation (ALWAYS junction-to-junction)
  const activeTrajectoryPoints = useMemo(() => {
    if (trajectoryPoints.length > 1) {
      return trajectoryPoints;
    }
    if (isDemoActive || (!selectedVehicle && trajectoryPoints.length === 0)) {
      return JUNCTION_TACTICAL_ROUTE;
    }
    return trajectoryPoints;
  }, [trajectoryPoints, isDemoActive, selectedVehicle]);

  // Active vehicle plate identifier
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

  // Throttled telemetry state so MapView NEVER lags
  const [displaySpeed, setDisplaySpeed] = useState(48);

  const handleTelemetry = useCallback((prog, spd) => {
    setAnimProgress(prog);
    setDisplaySpeed(spd);
  }, []);

  // Calculate map bounds
  const mapBounds = useMemo(() => {
    if (activeTrajectoryPoints.length > 0) {
      return activeTrajectoryPoints.map((point) => [point.lat, point.lng]);
    }
    if (junctionsList.length > 0) {
      return junctionsList.map((j) => [j.lat, j.lng]);
    }
    return null;
  }, [activeTrajectoryPoints, junctionsList]);

  // Handler to trigger crazy demo immediately
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

  return (
    <div className="geospatial-map-card">
      {/* CARD HEADER & CONTROLS */}
      <div className="section-header-block map-card-header-flex" style={{ marginBottom: "8px" }}>
        <div>
          <div className="section-eyebrow">City Surveillance & GIS Tracking</div>
          <h2 className="section-main-heading">
            Vehicle Journey & Route Map
          </h2>
          <p className="section-subtext">
            Autonomous trajectory tracking across city optical nodes & intersections.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* MAP TILE LAYER SWITCHER */}
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

          {/* HEATMAP TOGGLE */}
          <button
            type="button"
            className="btn-map-expand font-mono"
            onClick={() => setShowHeatmap(!showHeatmap)}
            style={{
              border: showHeatmap ? "1.5px solid #DC2626" : undefined,
              color: showHeatmap ? "#DC2626" : undefined,
              background: showHeatmap ? "rgba(220, 38, 38, 0.12)" : undefined,
            }}
            title="Toggle City-Wide Traffic Density Heatmap"
          >
            <Flame size={13} style={{ color: showHeatmap ? "#DC2626" : "var(--text-muted)" }} />
            <span>{showHeatmap ? "Heatmap: ON" : "Heatmap"}</span>
          </button>

          {/* FULLSCREEN EXPAND */}
          <button
            type="button"
            className="btn-map-expand font-mono"
            onClick={() => (onOpenFullMap ? onOpenFullMap() : setIsFullMapOpen(true))}
            title="Open Fullscreen Route Map & Video Playback"
          >
            <Maximize2 size={13} />
            <span>Large Map</span>
          </button>
        </div>
      </div>

      {/* TARGET SUBHEAD BANNER */}
      <div className="map-subhead-banner font-mono">
        {selectedVehicle ? (
          <span className="map-active-target-tag">
            SELECTED VEHICLE: {activePlate} ({selectedVehicle.camera_count || activeTrajectoryPoints.length} Cameras • {selectedVehicle.observation_count || activeTrajectoryPoints.length} Sightings • Speed: {selectedVehicle.estimated_average_speed_label || "52 km/h"})
          </span>
        ) : isDemoActive ? (
          <span className="map-active-target-tag demo-tag">
            ⚡ LIVE CRAZY TRAJECTORY RECON: JH10CS2095 (4 SIGHTINGS • DUAL-JUNCTION CORRIDOR)
          </span>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span style={{ color: "var(--text-muted)" }}>
              SELECT A TARGET VEHICLE OR LAUNCH REAL-TIME CRAZY TRAJECTORY RECON
            </span>
            <button
              type="button"
              className="quick-recon-btn font-mono"
              onClick={handleTriggerCrazyDemo}
              title="Launch High-Speed Trajectory Animation Demo"
            >
              <Sparkles size={11} />
              <span>RUN CRAZY DEMO</span>
            </button>
          </div>
        )}
      </div>

      {/* LEAFLET MAP FRAME */}
      <div className="map-container-frame">

        <MapContainer
          center={[23.7121, 86.9525]}
          zoom={16}
          style={{ height: "100%", width: "100%" }}
        >
          {/* DYNAMIC TILE LAYER (STREET / SATELLITE / DARK) */}
          <TileLayer
            key={mapLayer}
            url={TILE_PROVIDERS[mapLayer].url}
            attribution={TILE_PROVIDERS[mapLayer].attribution}
            maxZoom={19}
          />

          {/* Traffic Density Heatmap Layer */}
          {showHeatmap && junctionsList.map((junc) => (
            <React.Fragment key={`mini-heatmap-${junc.id}`}>
              <Circle
                center={[junc.lat, junc.lng]}
                radius={100}
                pathOptions={{
                  color: "#DC2626",
                  fillColor: "#DC2626",
                  fillOpacity: 0.14,
                  weight: 0,
                }}
              />
              <Circle
                center={[junc.lat, junc.lng]}
                radius={60}
                pathOptions={{
                  color: "#D97706",
                  fillColor: "#D97706",
                  fillOpacity: 0.25,
                  weight: 0,
                }}
              />
              <Circle
                center={[junc.lat, junc.lng]}
                radius={28}
                pathOptions={{
                  color: "#EF4444",
                  fillColor: "#EF4444",
                  fillOpacity: 0.42,
                  weight: 1,
                }}
              />
            </React.Fragment>
          ))}

          {/* HIGH-PERFORMANCE CLEAN TACTICAL TRAJECTORY */}
          {activeTrajectoryPoints.length > 1 && (
            <>
              {/* Outer clean casing */}
              <Polyline
                positions={activeTrajectoryPoints.map((p) => [p.lat, p.lng])}
                pathOptions={{
                  color: "#DC2626",
                  weight: 5,
                  opacity: 0.92,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              {/* Inner yellow directional line */}
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

              {/* Moving Vehicle Blip — Isolated component so MapView NEVER lags! */}
              <MovingVehicleBlip
                points={activeTrajectoryPoints}
                isPlaying={isPlaying}
                playbackSpeed={playbackSpeed}
                manualProgress={animProgress}
                onTelemetry={handleTelemetry}
              />
            </>
          )}

          {/* 2 JUNCTION PINS ONLY (Click to open clean popup with 2 camera names, NO VIDEO) */}
          {junctionsList.map((junction) => {
            const isA = junction.id === "junction_A" || junction.code === "A";
            return (
              <Marker
                key={`junction-marker-${junction.id}`}
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

                    {/* Camera Names Only — Zero Video, Instant Click */}
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

          {mapBounds && <MapBounds bounds={mapBounds} />}
        </MapContainer>

        {/* TRAJECTORY REPLAY CONTROL DECK */}
        {activeTrajectoryPoints.length > 1 && (
          <div className="trajectory-replay-deck font-mono">
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

            {/* Interactive Progress Scrub Slider */}
            <div className="deck-scrub-bar-wrapper">
              <span className="deck-progress-pct">
                {Math.round(animProgress * 100)}%
              </span>
              <input
                type="range"
                min="0"
                max="1000"
                value={Math.round(animProgress * 1000)}
                onChange={(e) => {
                  setAnimProgress(Number(e.target.value) / 1000);
                }}
                className="deck-slider-input"
                title="Scrub Trajectory Position"
              />
            </div>

            {/* Clean Telemetry */}
            <div className="deck-telemetry-status">
              <span className="telemetry-live-dot"></span>
              <span className="telemetry-spd-val">{displaySpeed || 48} KM/H</span>
            </div>
          </div>
        )}
      </div>

      {/* CLEAN & SPACIOUS CROSS-JUNCTION JOURNEY SUMMARY */}
      <JourneyRouteSummary
        selectedVehicle={selectedVehicle}
        cameras={cameras}
      />

      {/* FULL EXPANDED MAP & PLAYBACK MODAL (when self-contained) */}
      {!onOpenFullMap && (
        <FullMapModal
          isOpen={isFullMapOpen}
          onClose={() => setIsFullMapOpen(false)}
          cameras={cameras}
          selectedVehicle={selectedVehicle}
          selectedCameraId={selectedCameraId}
          onCameraSelect={onCameraSelect}
          onPlayEvent={onPlayEvent}
          onSelectVehicle={onSelectVehicle}
          vehicles={vehicles}
          analytics={analytics}
        />
      )}
    </div>
  );
}
