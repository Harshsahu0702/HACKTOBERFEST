import React, { useState, useEffect, useRef, useMemo } from "react";
import { Header } from "./components/Header";
import { CameraGrid } from "./components/CameraGrid";
import { VehicleSearch } from "./components/VehicleSearch";
import { MapView } from "./components/MapView";
import { AnalyticsSection } from "./components/AnalyticsSection";
import { GlobalRegistry } from "./components/GlobalRegistry";
import { BlacklistManagement } from "./components/BlacklistManagement";
import BlacklistModal from "./components/BlacklistModal";
import { VehicleDetailModal } from "./components/VehicleDetailModal";
import { CyberLoadingScreen } from "./components/CyberLoadingScreen";
import { TrafficAnalyticsPage } from "./components/TrafficAnalyticsPage";
import { SystemValidationPage } from "./components/SystemValidationPage";
import { EvidencePlaybackModal } from "./components/EvidencePlaybackModal";
import { FullMapModal } from "./components/FullMapModal";
import { DrishtiGptCopilot } from "./components/DrishtiGptCopilot";
import { LiveWebcamAnpr } from "./components/LiveWebcamAnpr";
import { AiIntelligencePanel } from "./components/AiIntelligencePanel";
import {
  api,
  normalizeCameraId,
  getCanonicalCameraName,
  getCanonicalJunctionName,
} from "./services/api";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("surveillance");
  const [cameras, setCameras] = useState({});
  const [vehicles, setVehicles] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [alertsData, setAlertsData] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [blacklistVehicles, setBlacklistVehicles] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [isDbOnline, setIsDbOnline] = useState(false);

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isFullMapOpen, setIsFullMapOpen] = useState(false);
  const [isAddBlacklistModalOpen, setIsAddBlacklistModalOpen] = useState(false);
  const [evidenceModalData, setEvidenceModalData] = useState(null);
  const [blacklistRefreshTrigger, setBlacklistRefreshTrigger] = useState(0);
  const [toastMessage, setToastMessage] = useState(null);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((cur) => (cur === message ? null : cur));
    }, 3500);
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cameraGridRef = useRef(null);

  /* =========================================================
     LOAD DASHBOARD DATA
  ========================================================= */

  const loadDashboardData = async (isInitial = false) => {
    const startTime = Date.now();
    try {
      if (isInitial) {
        setLoading(true);
      }
      setError("");

      /* CAMERAS */
      let camRes = {};
      try {
        camRes = await api.getCameras();
      } catch (e) {
        console.warn("[Dashboard] Cameras failed:", e);
        camRes = {};
      }

      /* VEHICLES */
      let vehRes = [];
      try {
        vehRes = await api.getVehicles({ limit: 1000 });
      } catch (e) {
        console.warn("[Dashboard] Vehicles failed:", e);
        vehRes = [];
      }

      /* ANALYTICS */
      let anaRes = null;
      try {
        anaRes = await api.getAnalytics();
      } catch (e) {
        console.warn("[Dashboard] Analytics failed:", e);
        anaRes = null;
      }

      /* ALERTS */
      let altRes = null;
      try {
        altRes = await api.getAlerts();
      } catch (e) {
        console.warn("[Dashboard] Alerts failed:", e);
        altRes = null;
      }

      /* WATCHLIST */
      let wlRes = [];
      try {
        wlRes = await api.getWatchlist();
      } catch (e) {
        console.warn("[Dashboard] Watchlist failed:", e);
        wlRes = [];
      }

      /* BLACKLIST */
      let blRes = [];
      try {
        blRes = await api.getBlacklist();
      } catch (e) {
        console.warn("[Dashboard] Blacklist failed:", e);
        blRes = [];
      }

      /* SYSTEM HEALTH */
      let healthRes = null;
      try {
        healthRes = await api.getSystemHealth();
      } catch (e) {
        console.warn("[Dashboard] System health unavailable:", e);
        healthRes = null;
      }

      /* DB STATUS */
      try {
        const dbStatus = await api.getDbStatus();
        setIsDbOnline(dbStatus?.status === "connected");
      } catch (e) {
        setIsDbOnline(false);
      }

      /* UPDATE STATE */
      setCameras(camRes || {});
      setVehicles(Array.isArray(vehRes) ? vehRes : []);
      setAnalytics(anaRes || null);
      setAlertsData(altRes || null);
      setWatchlist(Array.isArray(wlRes) ? wlRes : []);
      setBlacklistVehicles(Array.isArray(blRes) ? blRes : []);
      setSystemHealth(healthRes || null);
      setIsBackendOnline(Boolean(healthRes));

      /* DEFAULT VEHICLE SELECTION */
      if (isInitial && Array.isArray(vehRes) && vehRes.length > 0) {
        const firstMatched =
          vehRes.find(
            (vehicle) => Number(vehicle.camera_count) > 1 && vehicle.has_plate
          ) ||
          vehRes.find((vehicle) => Number(vehicle.camera_count) > 1) ||
          vehRes.find((vehicle) => vehicle.has_plate) ||
          vehRes[0];

        setSelectedVehicle(firstMatched);

        // Immediately enrich with VAHAN RC & predictive interception
        const defaultPlate = firstMatched?.plate || firstMatched?.global_vehicle_id;
        if (defaultPlate) {
          api.getVehicle(defaultPlate)
            .then((fullVeh) => {
              if (fullVeh) {
                setSelectedVehicle((prev) =>
                  prev?.global_vehicle_id === firstMatched?.global_vehicle_id ||
                  prev?.plate === firstMatched?.plate
                    ? { ...prev, ...fullVeh }
                    : prev
                );
              }
            })
            .catch((err) => console.warn("[Dashboard] Enriched vehicle load error:", err));
        }

        if (firstMatched?.trajectory && firstMatched.trajectory.length > 0) {
          const firstCamera = firstMatched.trajectory[0]?.camera_id;
          if (firstCamera) {
            setSelectedCameraId(firstCamera);
          }
        }
      }
    } catch (err) {
      console.error("[Dashboard] Unexpected load error:", err);
      setError("Unable to load Traffic Intelligence dashboard.");
      setIsBackendOnline(false);
    } finally {
      if (isInitial) {
        const elapsed = Date.now() - startTime;
        const minBootTime = 1800;
        const delay = Math.max(0, minBootTime - elapsed);
        setTimeout(() => {
          setLoading(false);
        }, delay);
      }
    }
  };

  /* INITIAL LOAD + LIVE REFRESH */
  useEffect(() => {
    loadDashboardData(true);

    const pollInterval = setInterval(() => {
      loadDashboardData(false);
    }, 10000);

    return () => clearInterval(pollInterval);
  }, []);

  /* KEYBOARD SHORTCUT: CTRL + K TO TOGGLE DRISHTI-GPT */
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCopilotOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  /* EVIDENCE PLAY MODAL TRIGGER */
  const handlePlayEvent = (cameraId, timestampSeconds, label, extra = {}) => {
    console.info("[Video Event Play Requested]", { cameraId, timestampSeconds, label, extra });

    const canonicalCamId = normalizeCameraId(cameraId);
    const camObj = cameras[canonicalCamId] || cameras[cameraId] || {};
    const camName = getCanonicalCameraName(canonicalCamId, camObj.name || camObj.camera_name);
    const juncName = getCanonicalJunctionName(camObj.scene || camObj.junction_name);

    // Extract plate from label e.g. "WB37E1275 @ Camera 01" or extra or selectedVehicle
    let plate =
      extra.plate ||
      extra.plate_number ||
      extra.normalized_plate;

    if (!plate && label && label.includes("@")) {
      const candidate = label.split("@")[0].trim();
      if (candidate && candidate !== "undefined" && candidate !== "null" && candidate !== "Target") {
        plate = candidate;
      }
    }
    if (!plate && label && !label.startsWith("Alert:")) {
      const candidate = label.trim();
      if (candidate && candidate !== "undefined" && candidate !== "null") {
        plate = candidate;
      }
    }
    if (!plate && selectedVehicle) {
      plate =
        selectedVehicle.plate ||
        selectedVehicle.plate_number ||
        selectedVehicle.normalized_plate;
    }
    if (!plate || plate === "undefined" || plate === "null") {
      plate = "DETECTED VEHICLE";
    }

    // Look up plate crop image
    let plateImage = extra.plate_image || extra.plateImage || extra.plate_image_url;
    if (!plateImage && selectedVehicle?.plate_image_url) {
      plateImage = selectedVehicle.plate_image_url;
    }
    if (!plateImage && selectedVehicle?.trajectory) {
      const matchLoc = selectedVehicle.trajectory.find((t) => normalizeCameraId(t.camera_id) === canonicalCamId);
      if (matchLoc?.plate_image_url || matchLoc?.plate_image) {
        plateImage = matchLoc.plate_image_url || matchLoc.plate_image;
      }
    }

    // Check blacklist status
    const isBlacklisted =
      extra.isBlacklisted !== undefined
        ? extra.isBlacklisted
        : Boolean(
            blacklistVehicles.find(
              (b) =>
                b.plate_number === plate ||
                b.normalized_plate === plate ||
                (selectedVehicle &&
                  (b.plate_number === selectedVehicle.plate_number ||
                    b.normalized_plate === selectedVehicle.normalized_plate))
            )
          );

    setEvidenceModalData({
      cameraId: canonicalCamId,
      cameraName: camName,
      junctionName: juncName,
      timestamp: Number(timestampSeconds) || 0,
      plate,
      plateImage,
      vehicleType: extra.vehicle_type || selectedVehicle?.vehicle_type || "car",
      confidence: extra.confidence || 0.96,
      isBlacklisted,
      label: label || `${plate} @ ${camName}`,
    });
  };

  /* CONFIRM PLAYBACK: REDIRECT UP, SEEK -3s, AND HIGHLIGHT CAR */
  const handleConfirmEvidencePlayback = ({
    cameraId,
    seekTime,
    originalTimestamp,
    bbox,
    plate,
    label,
  }) => {
    setEvidenceModalData(null);

    // Switch to surveillance tab if on analytics or validation
    if (activeTab !== "surveillance") {
      setActiveTab("surveillance");
    }

    const canonicalCamId = normalizeCameraId(cameraId);
    setSelectedCameraId(canonicalCamId);

    // Smooth scroll up to CCTV Camera Grid
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Seek to 3 seconds before the event and play with bounding box highlight
    setTimeout(() => {
      if (
        cameraGridRef.current &&
        typeof cameraGridRef.current.seekAndPlay === "function"
      ) {
        cameraGridRef.current.seekAndPlay(canonicalCamId, seekTime, label, {
          plate,
          originalTimestamp,
          bbox,
        });
      }
    }, 250);
  };

  /* SELECT VEHICLE */
  const handleSelectVehicle = async (vehicleOrObj) => {
    if (!vehicleOrObj) return;

    let targetVehicle = vehicleOrObj;
    if (typeof vehicleOrObj === "string") {
      targetVehicle = { plate: vehicleOrObj };
    }

    // Immediately set for fast responsiveness
    setSelectedVehicle(targetVehicle);

    const plateToSearch =
      targetVehicle.plate ||
      targetVehicle.normalized_plate ||
      targetVehicle.plate_number ||
      targetVehicle.global_vehicle_id;

    // ALWAYS query canonical search to ensure full Inbound/Outbound details & corridor are loaded
    if (plateToSearch) {
      try {
        const searchResults = await api.searchVehicles(plateToSearch);
        let enriched = null;
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          enriched = searchResults[0];
        } else if (searchResults && Array.isArray(searchResults.results) && searchResults.results.length > 0) {
          enriched = searchResults.results[0];
        } else if (searchResults && searchResults.plate) {
          enriched = searchResults;
        }

        if (enriched) {
          if (Array.isArray(enriched.trajectory)) {
            enriched.trajectory = enriched.trajectory.map((item) => ({
              ...item,
              camera_name: getCanonicalCameraName(item.camera_id, item.camera_name),
              junction_name: getCanonicalJunctionName(item.junction_name || item.junction),
            }));
          }
          setSelectedVehicle(enriched);
          targetVehicle = enriched;
        }
      } catch (err) {
        console.warn("Failed to resolve journey for target:", err);
      }
    }

    if (Array.isArray(targetVehicle.trajectory)) {
      targetVehicle.trajectory = targetVehicle.trajectory.map((item) => ({
        ...item,
        camera_name: getCanonicalCameraName(item.camera_id, item.camera_name),
        junction_name: getCanonicalJunctionName(item.junction_name || item.junction),
      }));
    }

    if (Array.isArray(targetVehicle.trajectory) && targetVehicle.trajectory.length > 0) {
      const firstObservation = targetVehicle.trajectory[0];
      if (firstObservation?.camera_id) {
        setSelectedCameraId(normalizeCameraId(firstObservation.camera_id));
      }
    } else if (
      Array.isArray(targetVehicle.camera_ids) &&
      targetVehicle.camera_ids.length > 0
    ) {
      setSelectedCameraId(normalizeCameraId(targetVehicle.camera_ids[0]));
    }
  };

  /* TRACE VEHICLE JOURNEY ON FULL MAP */
  const handleTraceVehicleJourneyOnMap = async (vehicleOrObj) => {
    if (!vehicleOrObj) return;
    let targetVehicle = vehicleOrObj;
    if (typeof vehicleOrObj === "string") {
      targetVehicle = { plate: vehicleOrObj };
    }
    const plate =
      targetVehicle.plate ||
      targetVehicle.plate_number ||
      targetVehicle.normalized_plate;

    if (plate) {
      try {
        const searchResults = await api.searchVehicles(plate);
        if (searchResults && searchResults.length > 0) {
          targetVehicle = searchResults[0];
        }
      } catch (err) {
        console.warn("Failed to resolve journey for map trace:", err);
      }
    }
    setSelectedVehicle(targetVehicle);

    if (Array.isArray(targetVehicle.trajectory) && targetVehicle.trajectory.length > 0) {
      const firstCam = targetVehicle.trajectory[0]?.camera_id;
      if (firstCam) setSelectedCameraId(firstCam);
    }
    setIsFullMapOpen(true);
  };

  /* OPEN VEHICLE DOSSIER */
  const handleOpenDossier = async (vehicle) => {
    if (!vehicle) return;

    let targetVehicle = { ...vehicle };

    if (Array.isArray(targetVehicle.trajectory)) {
      targetVehicle.trajectory = targetVehicle.trajectory.map((item) => ({
        ...item,
        camera_name: getCanonicalCameraName(item.camera_id, item.camera_name),
        junction_name: getCanonicalJunctionName(item.junction_name || item.junction),
      }));
    }

    setSelectedVehicle(targetVehicle);
    setIsDetailModalOpen(true);

    if (Array.isArray(targetVehicle.trajectory) && targetVehicle.trajectory.length > 0) {
      const cameraId = targetVehicle.trajectory[0]?.camera_id;
      if (cameraId) {
        setSelectedCameraId(normalizeCameraId(cameraId));
      }
    }

    const plateToSearch =
      targetVehicle.plate ||
      targetVehicle.normalized_plate ||
      targetVehicle.plate_number ||
      targetVehicle.global_vehicle_id;

    if (plateToSearch) {
      try {
        const searchResults = await api.searchVehicles(plateToSearch);
        let enriched = null;
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          enriched = searchResults[0];
        } else if (searchResults && Array.isArray(searchResults.results) && searchResults.results.length > 0) {
          enriched = searchResults.results[0];
        } else if (searchResults && searchResults.plate) {
          enriched = searchResults;
        }

        if (enriched) {
          if (Array.isArray(enriched.trajectory)) {
            enriched.trajectory = enriched.trajectory.map((item) => ({
              ...item,
              camera_name: getCanonicalCameraName(item.camera_id, item.camera_name),
              junction_name: getCanonicalJunctionName(item.junction_name || item.junction),
            }));
          }
          setSelectedVehicle((prev) => ({
            ...prev,
            ...enriched,
          }));
        }
      } catch (err) {
        console.warn("Failed to enrich vehicle for dossier modal:", err);
      }
    }
  };

  /* CAMERA SELECTION */
  const handleCameraSelect = (cameraId) => {
    if (!cameraId) return;
    setSelectedCameraId(cameraId);
  };

  /* WATCHLIST ACTIONS */
  const handleAddToWatchlist = async (entry) => {
    await api.addToWatchlist(entry);
    const updatedWl = await api.getWatchlist();
    const updatedAlerts = await api.getAlerts();
    setWatchlist(updatedWl);
    setAlertsData(updatedAlerts);
  };

  const handleDeleteFromWatchlist = async (plate) => {
    await api.deleteFromWatchlist(plate);
    const updatedWl = await api.getWatchlist();
    const updatedAlerts = await api.getAlerts();
    setWatchlist(updatedWl);
    setAlertsData(updatedAlerts);
  };

  /* CONSTANT BLACKLIST ALERT:
     Triggered when vehicle is active (is_active: true) AND has been detected on CCTV (detection_count > 0 or last_seen).
     Dismissed ONLY when deactivated. */
  const activeAlertVehicles = useMemo(() => {
    return (blacklistVehicles || []).filter((v) => {
      const isActive = v.is_active === true || v.is_active === 1 || v.status === "blacklisted" || v.status === "ACTIVE";
      const isDetected = Number(v.detection_count || 0) > 0 || Boolean(v.last_seen);
      return isActive && isDetected;
    });
  }, [blacklistVehicles]);

  const handleDeactivateBlacklistVehicle = async (vehicleId) => {
    try {
      await api.updateBlacklist(vehicleId, { is_active: false });
      showToast("Target vehicle deactivated. Constant alert dismissed.");
      setBlacklistRefreshTrigger((prev) => prev + 1);
      await loadDashboardData(false);
    } catch (err) {
      console.error("Failed to deactivate vehicle:", err);
      showToast("Failed to deactivate target vehicle.");
    }
  };

  const handleGoToBlacklist = () => {
    setActiveTab("surveillance");
    setTimeout(() => {
      const el = document.getElementById("blacklist-management-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 150);
  };

  /* LOADING SCREEN */
  if (loading) {
    return <CyberLoadingScreen onFinished={() => setLoading(false)} />;
  }

  return (
    <div className="command-center-app">
      {/* 1. HEADER WITH NAVIGATION TABS & CONSTANT ALERT */}
      <Header
        onOpenAddBlacklist={() => setIsAddBlacklistModalOpen(true)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeAlertVehicles={activeAlertVehicles}
        onDeactivateVehicle={handleDeactivateBlacklistVehicle}
        onGoToBlacklist={handleGoToBlacklist}
        onSelectVehicle={handleSelectVehicle}
      />

      {/* 2. MAIN OPERATIONS BODY */}
      <main className={`command-center-body ${activeTab === "live_anpr" ? "live-anpr-tab-active" : ""}`}>
        {activeTab === "analytics" ? (
          /* DEDICATED TRAFFIC MOBILITY & FLOW ANALYTICS PAGE */
          <TrafficAnalyticsPage
            analytics={analytics}
            cameras={cameras}
            vehicles={vehicles}
            onBackToSurveillance={() => setActiveTab("surveillance")}
            onSelectVehicle={handleSelectVehicle}
          />
        ) : activeTab === "validation" ? (
          <SystemValidationPage
            onBackToSurveillance={() => setActiveTab("surveillance")}
          />
        ) : activeTab === "live_anpr" ? (
          <LiveWebcamAnpr
            onSelectVehicle={(veh) => {
              handleSelectVehicle(veh);
              setActiveTab("surveillance");
            }}
            onOpenAddBlacklist={(plate) => {
              setIsAddBlacklistModalOpen(true);
            }}
            onTraceVehicle={(plate) => {
              handleTraceVehicleJourneyOnMap(plate);
              setActiveTab("surveillance");
            }}
            showToast={showToast}
          />
        ) : activeTab === "ai_intelligence" ? (
          /* GEMMA 4 MULTIMODAL TRAFFIC INTELLIGENCE WORKBENCH */
          <AiIntelligencePanel
            onSelectVehicle={handleSelectVehicle}
            onFocusCamera={handleCameraSelect}
          />
        ) : (
          /* SURVEILLANCE & RE-ID COMMAND CENTER */
          <>
            {/* LIVE CAMERA NETWORK */}
            <CameraGrid
              ref={cameraGridRef}
              cameras={cameras}
              selectedCameraId={selectedCameraId}
              onCameraSelect={handleCameraSelect}
              isBackgroundPaused={Boolean(evidenceModalData)}
            />

            {/* VEHICLE SEARCH & GEOSPATIAL MAP DUO */}
            <div className="investigation-duo-grid">
              {/* Left: Vehicle Search */}
              <VehicleSearch
                vehicles={vehicles}
                selectedVehicle={selectedVehicle}
                onSelectVehicle={handleSelectVehicle}
                onPlayEvent={handlePlayEvent}
                onFocusCamera={handleCameraSelect}
                cameras={cameras}
              />

              {/* Right: Geospatial Journey Map with Dual Mode A / Mode B */}
              <MapView
                cameras={cameras}
                selectedVehicle={selectedVehicle}
                selectedCameraId={selectedCameraId}
                onCameraSelect={handleCameraSelect}
                analytics={analytics}
                onPlayEvent={handlePlayEvent}
                onOpenFullMap={() => setIsFullMapOpen(true)}
                onSelectVehicle={handleSelectVehicle}
                vehicles={vehicles}
              />
            </div>

            {/* OPERATOR BLACKLIST MANAGEMENT (MYSQL PERSISTENT SURVEILLANCE & VIEW DOSSIER) */}
            <BlacklistManagement
              onSelectVehicle={handleSelectVehicle}
              onTraceJourney={handleTraceVehicleJourneyOnMap}
              onOpenAddModal={() => setIsAddBlacklistModalOpen(true)}
              refreshTrigger={blacklistRefreshTrigger}
              onDeleteSuccess={(msg) => {
                showToast(msg);
                loadDashboardData(false);
              }}
              onStatusChangeSuccess={(msg) => {
                showToast(msg);
                loadDashboardData(false);
              }}
              onFocusCamera={handleCameraSelect}
              onPlayEvent={handlePlayEvent}
            />

            {/* GLOBAL VEHICLE IDENTITY REGISTRY (PLACED DIRECTLY BELOW BLACKLISTED) */}
            <GlobalRegistry
              vehicles={vehicles}
              selectedVehicleId={selectedVehicle?.global_vehicle_id}
              onSelectVehicle={handleOpenDossier}
              onOpenDossier={handleOpenDossier}
            />
          </>
        )}
      </main>

      {/* OPERATOR ADD BLACKLIST MODAL */}
      <BlacklistModal
        isOpen={isAddBlacklistModalOpen}
        onClose={() => setIsAddBlacklistModalOpen(false)}
        onSuccess={() => {
          showToast("Vehicle added to blacklist.");
          setBlacklistRefreshTrigger((prev) => prev + 1);
          loadDashboardData(false);
        }}
      />

      {/* VEHICLE INTELLIGENCE DOSSIER MODAL */}
      {isDetailModalOpen && selectedVehicle && (
        <VehicleDetailModal
          vehicle={selectedVehicle}
          cameras={cameras}
          onClose={() => setIsDetailModalOpen(false)}
          onPlayEvent={handlePlayEvent}
          onFocusCamera={handleCameraSelect}
        />
      )}

      {/* CCTV FORENSIC EVIDENCE PLAYBACK MODAL (-5s PRE-ROLL & TARGET AUTO-PAUSE) */}
      <EvidencePlaybackModal
        isOpen={Boolean(evidenceModalData)}
        eventData={evidenceModalData}
        onClose={() => setEvidenceModalData(null)}
        onPlay={handleConfirmEvidencePlayback}
      />

      {/* FULL EXPANDED GEOSPATIAL MAP & TRAJECTORY RECONSTRUCTION MODAL */}
      <FullMapModal
        isOpen={isFullMapOpen}
        onClose={() => setIsFullMapOpen(false)}
        cameras={cameras}
        selectedVehicle={selectedVehicle}
        selectedCameraId={selectedCameraId}
        onCameraSelect={handleCameraSelect}
        onPlayEvent={handlePlayEvent}
        onSelectVehicle={handleSelectVehicle}
        vehicles={vehicles}
        analytics={analytics}
      />

      {/* DRISHTI-GPT AI FORENSIC COPILOT HUD */}
      <DrishtiGptCopilot
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        onOpen={() => setIsCopilotOpen(true)}
        onTraceVehicle={handleTraceVehicleJourneyOnMap}
        onPlayEvidence={handlePlayEvent}
        onOpenDossier={handleOpenDossier}
        onIssueChallan={(plate, vehicle) => {
          setSelectedVehicle(vehicle || { plate });
          setIsDetailModalOpen(true);
        }}
        onSelectCamera={handleCameraSelect}
        onSwitchTab={(tab) => {
          const targetTab = tab === "live-anpr" || tab === "live_anpr" ? "live_anpr" : tab;
          setActiveTab(targetTab);
          setIsCopilotOpen(false);
        }}
        onOpenAddBlacklist={() => {
          setIsAddBlacklistModalOpen(true);
        }}
      />

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div
          className="floating-toast-alert font-mono"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: "var(--text-primary, #0f172a)",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: "8px",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          <span style={{ color: "var(--status-success, #22c55e)", fontSize: "16px" }}>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* FOOTER */}
      <footer className="command-footer font-mono">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>DRISHTI</span>
          <span>•</span>
          <span>CITY-WIDE VISUAL INTELLIGENCE FOR VEHICLE TRACKING & MOBILITY ANALYSIS</span>
          <span>•</span>
          <span style={{ color: "var(--status-success)" }}>OPERATIONAL PROTOCOL v3.5</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span>NETWORK: 4 CCTV NODES</span>
          <span>•</span>
          <span style={{ color: "var(--status-success)" }}>ALL CHANNELS SYNCHRONIZED</span>
        </div>
      </footer>
    </div>
  );
}