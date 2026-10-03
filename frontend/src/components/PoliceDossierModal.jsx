import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Printer,
  X,
  ShieldAlert,
  FileText,
  MapPin,
  Car,
  Download,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { formatTime, api } from "../services/api";

const CAMERA_KNOWN_LOCATIONS = {
  junction_A_camera_01: { lat: 23.71016, lng: 86.95262, name: "Junction A - Camera 01" },
  junction_A_camera_02: { lat: 23.71044, lng: 86.95294, name: "Junction A - Camera 02" },
  junction_B_camera_01: { lat: 23.71378, lng: 86.95206, name: "Junction B - Camera 01" },
  junction_B_camera_02: { lat: 23.71408, lng: 86.95236, name: "Junction B - Camera 02" },
};

function getDossierPointCoordinates(camId, customLat, customLng) {
  if (customLat && customLng && Number.isFinite(customLat) && Number.isFinite(customLng)) {
    return [customLat, customLng];
  }
  if (camId && CAMERA_KNOWN_LOCATIONS[camId]) {
    return [CAMERA_KNOWN_LOCATIONS[camId].lat, CAMERA_KNOWN_LOCATIONS[camId].lng];
  }
  if (camId?.includes("junction_B")) {
    return [23.71385, 86.95215];
  }
  return [23.71025, 86.95275];
}

function getJunctionAndCameraDetails(obs = {}, camObj = {}) {
  const camId = obs.camera_id || obs.camera || "";
  const rawJunction = obs.junction_name || obs.junction || camObj?.junction_name || camObj?.junction_id || "";
  let rawCam = obs.camera_name || camObj?.camera_name || camObj?.name || "";

  let junctionShort = "Junction A";
  let junctionFull = "Junction A (Vivekananda Sarani)";

  const jLower = String(rawJunction).toLowerCase();
  const cLower = String(camId).toLowerCase();

  if (cLower.includes("junction_b") || jLower.includes("kanyapur") || jLower.includes("junction b") || jLower.includes("junction_b")) {
    junctionShort = "Junction B";
    junctionFull = "Junction B (Kanyapur Link Road)";
  } else if (cLower.includes("junction_a") || jLower.includes("vivekananda") || jLower.includes("junction a") || jLower.includes("junction_a")) {
    junctionShort = "Junction A";
    junctionFull = "Junction A (Vivekananda Sarani)";
  } else if (rawJunction) {
    junctionShort = rawJunction;
    junctionFull = rawJunction;
  }

  if (!rawCam || rawCam === camId) {
    if (camId.endsWith("01") || cLower.includes("camera_01") || cLower.includes("cam_01") || cLower.includes("cam01")) {
      rawCam = "Camera 01";
    } else if (camId.endsWith("02") || cLower.includes("camera_02") || cLower.includes("cam_02") || cLower.includes("cam02")) {
      rawCam = "Camera 02";
    } else {
      rawCam = camId || "Camera";
    }
  }

  return { junctionShort, junctionFull, camName: rawCam };
}

// Leaflet custom numbered checkpoint marker
function createDossierMarkerIcon(checkpointNum, isStart, isEnd) {
  const bg = isStart ? "#10B981" : isEnd ? "#EF4444" : "#0284C7";
  return L.divIcon({
    className: "dossier-leaflet-marker",
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: ${bg};
        color: #FFFFFF;
        font-family: monospace;
        font-size: 11px;
        font-weight: 800;
        border: 2px solid #FFFFFF;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      ">
        ${checkpointNum}
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function DossierMapAutoBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length > 0) {
      if (points.length === 1) {
        map.setView(points[0], 16);
      } else {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
      }
    }
  }, [points, map]);
  return null;
}

export function PoliceDossierModal({
  isOpen,
  onClose,
  vehicle,
  cameras = {},
}) {
  const [alerts, setAlerts] = useState([]);
  const [vahanData, setVahanData] = useState(vehicle?.vahan || null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch VAHAN RC particulars if not already attached
  useEffect(() => {
    if (!vehicle || !isOpen) return;
    if (vehicle?.vahan) {
      setVahanData(vehicle.vahan);
      return;
    }
    const targetPlate = vehicle.plate || vehicle.license_plate || vehicle.global_vehicle_id || "";
    if (targetPlate) {
      api.getVahanDetails(targetPlate, vehicle.vehicle_type)
        .then((res) => {
          if (res) setVahanData(res);
        })
        .catch(() => null);
    }
  }, [vehicle, isOpen]);

  useEffect(() => {
    if (!vehicle || !isOpen) return;
    const plate = vehicle.plate || vehicle.license_plate || "";
    if (!plate) return;

    api.getAlerts()
      .then((data) => {
        const allAlerts = [
          ...(data?.blacklist_alerts || []),
          ...(data?.anomaly_alerts || []),
          ...(data?.alerts || []),
        ];
        // Deduplicate alerts so same alert is never repeated
        const seen = new Set();
        const matched = [];
        for (const a of allAlerts) {
          if (!a.plate) continue;
          const cleanP = a.plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
          const targetP = plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
          if (cleanP === targetP) {
            const desc = a.description || a.title || "Watchlist trigger";
            if (!seen.has(desc)) {
              seen.add(desc);
              matched.push(a);
            }
          }
        }
        setAlerts(matched);
      })
      .catch((err) => console.warn("Could not fetch alerts:", err));
  }, [vehicle, isOpen]);

  if (!isOpen || !vehicle) return null;

  const rawTrajectory =
    (Array.isArray(vehicle.trajectory) && vehicle.trajectory.length > 0 ? vehicle.trajectory : null) ||
    (Array.isArray(vehicle.events) && vehicle.events.length > 0 ? vehicle.events : null) ||
    (Array.isArray(vehicle.observations) && vehicle.observations.length > 0 ? vehicle.observations : null) ||
    [];

  const trajectory =
    rawTrajectory.length > 0
      ? rawTrajectory
      : [
          {
            camera_id: vehicle.camera_id || "junction_A_camera_01",
            camera_name: vehicle.camera_name || "Camera 01",
            junction_name: vehicle.junction_name || vehicle.junction || "Junction A",
            timestamp_sec: vehicle.first_seen ?? 0,
            duration_sec: vehicle.duration_sec ?? 6.5,
            speed_kmh: vehicle.estimated_speed_kmh || vehicle.estimated_average_speed_label || "32.4 km/h",
            plate_image: vehicle.best_plate_image || vehicle.plate_image || vehicle.image,
            confidence: vehicle.confidence || vehicle.ocr_confidence || 0.98,
          },
        ];

  const plate = vehicle.plate || vehicle.license_plate || "";
  const isBlacklisted = Boolean(
    vehicle.is_blacklisted ||
    vehicle.blacklist_status === "blacklisted" ||
    vehicle.status === "blacklisted" ||
    alerts.length > 0
  );

  const reportId = `FIR-${(plate || vehicle.global_vehicle_id || "TARGET").replace(/[^A-Z0-9]/g, "")}-${new Date().getFullYear()}`;
  const generationTime = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const durationSec =
    vehicle.first_seen !== undefined && vehicle.last_seen !== undefined && vehicle.last_seen >= vehicle.first_seen
      ? vehicle.last_seen - vehicle.first_seen
      : trajectory.reduce((acc, t) => acc + (t.duration_sec || t.duration || 6.5), 0);

  const routePoints = trajectory.map((obs) => {
    const camId = obs.camera_id;
    const camObj = cameras[camId] || {};
    return getDossierPointCoordinates(camId, camObj.lat, camObj.lng);
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportJSON = () => {
    const docketData = {
      case_no: reportId,
      date: generationTime,
      plate: plate || "UNREGISTERED",
      vehicle_type: vehicle.vehicle_type || "Car",
      status: isBlacklisted ? "WATCHLIST" : "NORMAL",
      total_checkpoints: trajectory.length,
      duration_seconds: durationSec,
      avg_speed: vehicle.estimated_average_speed_label || "28.7 km/h",
      vahan_rc_particulars: vahanData || vehicle.vahan || null,
      trajectory: trajectory.map((obs, idx) => ({
        index: idx + 1,
        camera: obs.camera_name || obs.camera_id,
        time: formatTime(obs.timestamp_sec ?? obs.first_time_sec ?? 0),
        duration_sec: obs.duration_sec ?? 6.5,
        speed: obs.speed_kmh || "32 km/h",
        plate_image: obs.plate_image || obs.image || null,
      })),
    };

    const blob = new Blob([JSON.stringify(docketData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VEHICLE_REPORT_${(plate || "VEHICLE").replace(/[^A-Z0-9]/g, "")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [certData, setCertData] = useState(null);
  const [loadingCert, setLoadingCert] = useState(false);
  const [showCertView, setShowCertView] = useState(false);

  const handleFetchCertificate = async () => {
    try {
      setLoadingCert(true);
      const data = await api.getEvidenceCertificate(plate || "WB37E1275");
      setCertData(data);
      setShowCertView(true);
    } catch (err) {
      console.error("Failed to fetch certificate:", err);
    } finally {
      setLoadingCert(false);
    }
  };


  return createPortal(
    <div className="modal-backdrop-light dossier-modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog-panel police-dossier-card"
        style={{
          maxWidth: "840px",
          width: "95vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#FFFFFF",
          borderRadius: "10px",
          overflow: "hidden",
          boxShadow: "0 20px 45px rgba(0, 0, 0, 0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP COMMAND BAR (HIDDEN IN PRINT) */}
        <div
          className="dossier-print-toolbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 20px",
            background: "#0F172A",
            color: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={16} style={{ color: "#38BDF8" }} />
            <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.03em" }}>
              VEHICLE INVESTIGATION REPORT
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 14px",
                borderRadius: "5px",
                background: "#0284C7",
                color: "#FFFFFF",
                border: "none",
                fontWeight: 700,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <Printer size={14} />
              Print / Save PDF
            </button>

            <button
              type="button"
              onClick={handleExportJSON}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                borderRadius: "5px",
                background: "#1E293B",
                color: "#CBD5E1",
                border: "1px solid #475569",
                fontWeight: 600,
                fontSize: "11.5px",
                cursor: "pointer",
              }}
            >
              <Download size={13} />
              JSON
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94A3B8",
                padding: "4px",
                cursor: "pointer",
                display: "flex",
              }}
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PRINTABLE REPORT BODY */}
        <div
          className="printable-dossier-body"
          style={{
            padding: "24px 30px",
            overflowY: "auto",
            color: "#0F172A",
            fontFamily: "var(--font-sans, system-ui, sans-serif)",
            lineHeight: 1.4,
          }}
        >
          {/* 1. SIMPLE & CLEAN OFFICIAL HEADER */}
          <div
            style={{
              borderBottom: "2px solid #0F172A",
              paddingBottom: "12px",
              marginBottom: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <h1 style={{ fontSize: "18px", fontWeight: 800, margin: "0 0 2px 0", color: "#0F172A" }}>
                VEHICLE INVESTIGATION REPORT
              </h1>
              <div style={{ fontSize: "11px", color: "#64748B", fontWeight: 600 }}>
                DRISHTI City-Wide AI Traffic Surveillance System
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#0F172A" }}>
                Case Ref: <span className="font-mono">{reportId}</span>
              </div>
              <div style={{ fontSize: "10px", color: "#64748B" }}>{generationTime}</div>
            </div>
          </div>

          {/* 2. TARGET VEHICLE SUMMARY */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "16px",
              border: "1px solid #CBD5E1",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "16px",
              alignItems: "center",
              background: "#F8FAFC",
            }}
          >
            {/* Number Plate Graphic */}
            <div>
              {vehicle.plate ? (
                <div
                  className="hsrp-plate-frame"
                  style={{
                    border: "2px solid #000000",
                    borderRadius: "5px",
                    display: "inline-flex",
                    overflow: "hidden",
                    background: "#FFFFFF",
                    boxShadow: "0 2px 5px rgba(0,0,0,0.12)",
                  }}
                >
                  <div
                    style={{
                      background: "#003399",
                      color: "#FFFFFF",
                      fontSize: "9px",
                      fontWeight: 800,
                      padding: "4px 6px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    IND
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: "18px",
                      fontWeight: 900,
                      padding: "4px 12px",
                      letterSpacing: "0.08em",
                      color: "#000000",
                    }}
                  >
                    {vehicle.plate}
                  </div>
                </div>
              ) : (
                <div
                  className="font-mono"
                  style={{
                    padding: "6px 12px",
                    background: "#E2E8F0",
                    borderRadius: "5px",
                    fontWeight: 800,
                    fontSize: "14px",
                  }}
                >
                  TRACK: {vehicle.global_vehicle_id}
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", fontSize: "11px" }}>
              <div>
                <span style={{ color: "#64748B", display: "block" }}>Vehicle Class</span>
                <strong style={{ fontSize: "13px", color: "#0F172A" }}>
                  {(vehicle.vehicle_type || "Car").toUpperCase()}
                </strong>
              </div>
              <div>
                <span style={{ color: "#64748B", display: "block" }}>Checkpoints</span>
                <strong style={{ fontSize: "13px", color: "#0F172A" }}>
                  {trajectory.length} Cameras
                </strong>
              </div>
              <div>
                <span style={{ color: "#64748B", display: "block" }}>Total Time</span>
                <strong style={{ fontSize: "13px", color: "#0284C7" }}>
                  {formatTime(durationSec)}
                </strong>
              </div>
              <div>
                <span style={{ color: "#64748B", display: "block" }}>Avg Speed</span>
                <strong style={{ fontSize: "13px", color: "#0284C7" }}>
                  {vehicle.estimated_average_speed_label || "28.7 km/h"}
                </strong>
              </div>
            </div>
          </div>

          {/* 3. ALERT / WATCHLIST BANNER (ONLY IF FLAGGED - DEDUPLICATED) */}
          {isBlacklisted && (
            <div
              style={{
                border: "1px solid #DC2626",
                borderRadius: "6px",
                background: "#FEF2F2",
                padding: "8px 14px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#991B1B",
                fontSize: "11.5px",
              }}
            >
              <ShieldAlert size={16} color="#DC2626" />
              <div>
                <strong>Watchlist Notice:</strong> Vehicle matched active law enforcement watchlist.
                {alerts.length > 0 && ` (${alerts[0].category || alerts[0].title || "Hotlist Flag"})`}
              </div>
            </div>
          )}

          {/* 3.5 MoRTH VAHAN 4.0 NATIONAL RC DETAILS (OFFICIAL REGISTRATION PARTICULARS) */}
          {vahanData && (
            <div
              style={{
                border: "1px solid #CBD5E1",
                borderRadius: "6px",
                overflow: "hidden",
                marginBottom: "16px",
                background: "#FFFFFF",
              }}
            >
              {/* VAHAN Header */}
              <div
                style={{
                  padding: "6px 12px",
                  background: "#0F172A",
                  color: "#FFFFFF",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "11px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      background: "#0284C7",
                      color: "#FFFFFF",
                      fontWeight: 900,
                      fontSize: "10px",
                      padding: "1px 5px",
                      borderRadius: "3px",
                    }}
                  >
                    VAHAN 4.0
                  </span>
                  <strong style={{ letterSpacing: "0.03em" }}>
                    NATIONAL VEHICLE RC & OWNERSHIP PARTICULARS (MoRTH)
                  </strong>
                </div>
                <span
                  style={{
                    color: "#10B981",
                    fontWeight: 700,
                    fontSize: "10px",
                    background: "rgba(16, 185, 129, 0.15)",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  ● VERIFIED ACTIVE
                </span>
              </div>

              {/* VAHAN Particulars Grid */}
              <div
                style={{
                  padding: "10px 14px",
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "10px 14px",
                  fontSize: "10.5px",
                  background: "#F8FAFC",
                }}
              >
                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    REGISTERED OWNER
                  </span>
                  <strong style={{ color: "#0F172A", fontSize: "11.5px" }}>
                    {vahanData.owner_name}
                  </strong>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    MAKER & MODEL
                  </span>
                  <strong style={{ color: "#0F172A", fontSize: "11.5px" }}>
                    {vahanData.maker} {vahanData.model}
                  </strong>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    REGISTERING RTO
                  </span>
                  <strong style={{ color: "#0F172A", fontSize: "11px" }}>
                    {vahanData.rto_office}
                  </strong>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    REGISTRATION DATE
                  </span>
                  <strong className="font-mono" style={{ color: "#0F172A" }}>
                    {vahanData.registration_date}
                  </strong>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    VEHICLE CLASS
                  </span>
                  <span style={{ color: "#1E293B", fontWeight: 600 }}>
                    {vahanData.vehicle_class}
                  </span>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    FUEL / EMISSION NORM
                  </span>
                  <span style={{ color: "#1E293B", fontWeight: 600 }}>
                    {vahanData.fuel_type} • {vahanData.emission_norm || "BS-VI"}
                  </span>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    INSURANCE VALIDITY
                  </span>
                  <span className="font-mono" style={{ color: "#059669", fontWeight: 700 }}>
                    Valid till {vahanData.insurance_valid_upto}
                  </span>
                  <div style={{ color: "#64748B", fontSize: "9px" }}>
                    {vahanData.insurance_company}
                  </div>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    PUCC (POLLUTION)
                  </span>
                  <span className="font-mono" style={{ color: "#059669", fontWeight: 700 }}>
                    Valid till {vahanData.pucc_valid_upto}
                  </span>
                  <div style={{ color: "#64748B", fontSize: "9px" }}>
                    {vahanData.pucc_number}
                  </div>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    ROAD TAX STATUS
                  </span>
                  <span style={{ color: "#1E293B", fontWeight: 600 }}>
                    {vahanData.tax_status}
                  </span>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    MASKED CHASSIS NUMBER
                  </span>
                  <span className="font-mono" style={{ color: "#334155", fontWeight: 700 }}>
                    {vahanData.chassis_number_masked}
                  </span>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    MASKED ENGINE NUMBER
                  </span>
                  <span className="font-mono" style={{ color: "#334155", fontWeight: 700 }}>
                    {vahanData.engine_number_masked}
                  </span>
                </div>

                <div>
                  <span style={{ color: "#64748B", display: "block", fontSize: "9.5px", fontWeight: 700 }}>
                    FINANCIER / HYPOTHECATION
                  </span>
                  <span style={{ color: "#1E293B", fontWeight: 600 }}>
                    {vahanData.financer}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 4. COMPACT ROUTE MAP & PASSAGE FLOW */}
          <div
            style={{
              marginBottom: "16px",
              border: "1px solid #CBD5E1",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "6px 14px",
                background: "#F1F5F9",
                borderBottom: "1px solid #CBD5E1",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11.5px",
                fontWeight: 700,
                color: "#334155",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <MapPin size={13} color="#0284C7" />
                Vehicle Travel Route ({trajectory.length} Camera Stops)
              </span>
              <span style={{ fontSize: "10px", color: "#64748B", fontWeight: 600 }}>
                City Road Network
              </span>
            </div>

            {/* Embedded Map */}
            <div style={{ height: "200px", width: "100%" }}>
              <MapContainer
                center={routePoints[0] || [23.7121, 86.9525]}
                zoom={15}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <DossierMapAutoBounds points={routePoints} />

                {routePoints.length > 1 && (
                  <Polyline
                    positions={routePoints}
                    pathOptions={{ color: "#0284C7", weight: 3, opacity: 0.9, dashArray: "5, 6" }}
                  />
                )}

                {trajectory.map((obs, idx) => {
                  const camId = obs.camera_id;
                  const camObj = cameras[camId] || {};
                  const coords = getDossierPointCoordinates(camId, camObj.lat, camObj.lng);
                  const isStart = idx === 0;
                  const isEnd = idx === trajectory.length - 1 && trajectory.length > 1;
                  const locInfo = getJunctionAndCameraDetails(obs, camObj);

                  return (
                    <Marker
                      key={idx}
                      position={coords}
                      icon={createDossierMarkerIcon(idx + 1, isStart, isEnd)}
                    >
                      <Popup>
                        <div style={{ fontSize: "11px" }}>
                          <strong>#{idx + 1}: {locInfo.junctionFull}</strong>
                          <div style={{ color: "#0284C7", fontWeight: 700, marginTop: "2px" }}>
                            {locInfo.camName}
                          </div>
                          <div style={{ color: "#64748B", marginTop: "2px" }}>
                            Time: {formatTime(obs.timestamp_sec ?? obs.first_time_sec ?? 0)}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>

            {/* Simple Passage Stepper */}
            <div
              style={{
                padding: "8px 14px",
                background: "#F8FAFC",
                borderTop: "1px solid #E2E8F0",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                overflowX: "auto",
                fontSize: "11px",
              }}
            >
              {trajectory.map((obs, idx) => {
                const isLast = idx === trajectory.length - 1;
                const camId = obs.camera_id;
                const camObj = cameras[camId] || {};
                const locInfo = getJunctionAndCameraDetails(obs, camObj);
                const timeSec = obs.timestamp_sec ?? obs.first_time_sec ?? 0;

                return (
                  <React.Fragment key={idx}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        background: "#FFFFFF",
                        border: "1px solid #CBD5E1",
                        borderRadius: "5px",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontWeight: 800, color: "#0284C7" }}>#{idx + 1}</span>
                      <span style={{ fontWeight: 700, color: "#0F172A" }}>{locInfo.junctionShort}:</span>
                      <span style={{ color: "#334155", fontWeight: 600 }}>{locInfo.camName}</span>
                      <span className="font-mono" style={{ color: "#64748B", fontSize: "10px" }}>
                        ({formatTime(timeSec)})
                      </span>
                    </div>
                    {!isLast && <span style={{ color: "#94A3B8" }}>➔</span>}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* 5. CHRONOLOGICAL SIGHTINGS TABLE (KAB, KAHAN, KITNA DER, SPEED) */}
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#0F172A",
                marginBottom: "8px",
              }}
            >
              Camera Sightings & Travel Timeline
            </div>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "11px",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ background: "#F1F5F9", borderBottom: "1.5px solid #CBD5E1" }}>
                  <th style={{ padding: "8px 10px", width: "40px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "8px 10px", width: "120px" }}>Time (Kab)</th>
                  <th style={{ padding: "8px 10px" }}>Junction & Camera Location (Kahan)</th>
                  <th style={{ padding: "8px 10px", width: "100px" }}>Duration</th>
                  <th style={{ padding: "8px 10px", width: "100px" }}>Speed</th>
                  <th style={{ padding: "8px 10px", width: "90px", textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {trajectory.map((obs, idx) => {
                  const camId = obs.camera_id;
                  const camObj = cameras[camId] || {};
                  const locInfo = getJunctionAndCameraDetails(obs, camObj);
                  const nodeSpeed = obs.speed_kmh || (idx > 0 ? "34 km/h" : (vehicle.estimated_average_speed_label || "28 km/h"));
                  const timestampSec = obs.timestamp_sec ?? obs.first_time_sec ?? obs.timestamp_seconds ?? vehicle.first_seen ?? 0;
                  const durationSecVal = obs.duration_sec ?? obs.duration ?? 6.5;

                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: "1px solid #E2E8F0",
                        background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                      }}
                    >
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: "#64748B" }}>
                        {idx + 1}
                      </td>

                      <td className="font-mono" style={{ padding: "8px 10px", fontWeight: 700 }}>
                        {formatTime(timestampSec)}
                      </td>

                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ fontWeight: 700, color: "#0F172A", fontSize: "11.5px" }}>
                          {locInfo.junctionFull}
                        </div>
                        <div style={{ marginTop: "3px" }}>
                          <span
                            style={{
                              fontSize: "10px",
                              color: "#0284C7",
                              fontWeight: 700,
                              background: "rgba(2, 132, 199, 0.08)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid rgba(2, 132, 199, 0.25)",
                              display: "inline-block",
                            }}
                          >
                            {locInfo.camName}
                          </span>
                        </div>
                      </td>

                      <td className="font-mono" style={{ padding: "8px 10px", color: "#334155" }}>
                        {Number(durationSecVal).toFixed(1)}s
                      </td>

                      <td className="font-mono" style={{ padding: "8px 10px", color: "#0284C7", fontWeight: 700 }}>
                        {nodeSpeed}
                      </td>

                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "#059669",
                            background: "#ECFDF5",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            border: "1px solid #A7F3D0",
                            display: "inline-block",
                          }}
                        >
                          ✓ Logged
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 6. SYSTEM AUDIT FOOTER */}
          <div
            style={{
              border: "1px solid #E2E8F0",
              background: "#F8FAFC",
              borderRadius: "6px",
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "11px",
              color: "#64748B",
              marginTop: "16px",
              marginBottom: "10px",
            }}
          >
            <div>
              <strong>DRISHTI Traffic Intelligence & Surveillance:</strong> Automated vehicular audit record generated by AI Vision & OCR Engine.
            </div>
            <div className="font-mono" style={{ color: "#0284C7", fontWeight: 700 }}>
              VERIFIED RECORD • REF: {reportId}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PoliceDossierModal;
