/**
 * frontend/src/services/api.js
 *
 * Backend-first API client for DRISHTI Traffic Intelligence System.
 * All data flows from the backend (which reads from detections.json).
 * Local JSON fallback is used only when backend is offline.
 */

/* =========================================================
   BACKEND URL CONFIGURATION
========================================================= */

/**
 * Resolves the active backend API base URL dynamically.
 * Priority:
 * 1. Runtime override saved in browser localStorage ("DRISHTI_BACKEND_URL")
 * 2. Build-time Vite environment variable (import.meta.env.VITE_API_BASE_URL)
 * 3. Localhost development (localhost or 127.0.0.1 -> :8000)
 * 4. Production fallback: "" (relative request)
 */
export function getApiBase() {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("DRISHTI_BACKEND_URL");
      if (stored && stored.trim()) {
        return stored.trim().replace(/\/+$/, "");
      }
    } catch (_) {}
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location) {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      return `http://${host}:8000`;
    }
  }

  // Production default connected to active Railway cloud backend
  return "https://web-production-deb65.up.railway.app";
}

export function setApiBase(url) {
  if (typeof window !== "undefined") {
    try {
      if (!url || !url.trim()) {
        localStorage.removeItem("DRISHTI_BACKEND_URL");
      } else {
        let clean = url.trim().replace(/\/+$/, "");
        if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
          clean = "https://" + clean;
        }
        localStorage.setItem("DRISHTI_BACKEND_URL", clean);
      }
    } catch (_) {}
  }
}

export const API_BASE = getApiBase();

/* =========================================================
   BACKEND REQUEST
========================================================= */

async function request(path, options = {}) {
  const base = getApiBase();
  const url = base ? `${base}${path}` : path;
  const response = await fetch(url, options);

  if (!response.ok) {
    let msg = `HTTP ${response.status} from ${path}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        msg = errJson.detail;
      }
    } catch (_) {}
    throw new Error(msg);
  }

  return response.json();
}

/* =========================================================
   HELPERS
========================================================= */

function firstDefined(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== ""
  );
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* =========================================================
   NORMALIZE OBSERVATION (for backend vehicle trajectory)
========================================================= */

function normalizeObservation(observation = {}, index = 0) {
  const cameraId = firstDefined(
    observation.camera_id,
    observation.camera,
    observation.cam_id,
    observation.cameraId,
    observation.source_camera,
    `camera_${String(index + 1).padStart(2, "0")}`
  );

  const junctionId = firstDefined(
    observation.junction_id,
    observation.junction,
    observation.site_id,
    observation.site,
    observation.location_id,
    null
  );

  const timestamp = firstDefined(
    observation.timestamp_sec,
    observation.first_time_sec,
    observation.timestamp,
    observation.time,
    observation.time_seconds,
    observation.video_timestamp,
    observation.frame_time,
    observation.seconds,
    observation.start_timestamp,
    null
  );

  const timestampSeconds = toNumber(timestamp, 0);

  const endTimestamp = firstDefined(
    observation.last_timestamp_sec,
    observation.last_time_sec,
    observation.end_timestamp,
    observation.end_time_sec,
    null
  );

  const endTimestampSeconds = toNumber(endTimestamp, timestampSeconds);

  const duration = firstDefined(
    observation.duration_sec,
    observation.duration,
    null
  );

  const durationSeconds = toNumber(duration, null);

  const vehicleId = firstDefined(
    observation.vehicle_track_id,
    observation.vehicle_id,
    observation.track_id,
    observation.id,
    null
  );

  const canonicalCamId = normalizeCameraId(cameraId);
  const canonicalCamName = getCanonicalCameraName(
    canonicalCamId,
    firstDefined(observation.camera_name, observation.camera, cameraId)
  );
  const canonicalJuncName = getCanonicalJunctionName(
    junctionId || observation.junction_name || observation.junction
  );

  return {
    ...observation,

    camera_id: canonicalCamId,
    junction_id: junctionId,

    camera_name: canonicalCamName,
    junction_name: canonicalJuncName,

    timestamp: timestamp,
    timestamp_seconds: timestampSeconds,
    start_timestamp: timestampSeconds,
    end_timestamp: endTimestampSeconds,
    duration: durationSeconds,
    first_time_sec: timestampSeconds,
    last_time_sec: endTimestampSeconds,
    duration_sec: durationSeconds,

    frame: firstDefined(
      observation.frame,
      observation.frame_number,
      observation.frame_id,
      observation.first_frame,
      null
    ),

    track_id: vehicleId,
    vehicle_id: vehicleId,

    confidence: toNumber(
      firstDefined(
        observation.ocr_confidence,
        observation.confidence,
        observation.detection_confidence,
        observation.vehicle_confidence
      ),
      null
    ),
  };
}

/* =========================================================
   NORMALIZE VEHICLE (works with backend /api/vehicles data)
========================================================= */

function normalizeVehicle(vehicle = {}, index = 0) {
  const globalVehicleId = firstDefined(
    vehicle.global_vehicle_id,
    vehicle.global_id,
    vehicle.plate,
    vehicle.vehicle_id,
    vehicle.track_id,
    vehicle.id,
    `VEHICLE_${String(index + 1).padStart(5, "0")}`
  );

  const plate = firstDefined(
    vehicle.plate,
    vehicle.plate_number,
    vehicle.license_plate,
    vehicle.registration_number,
    vehicle.number_plate,
    vehicle.anpr_plate,
    null
  );

  const vehicleType = firstDefined(
    vehicle.vehicle_type,
    vehicle.type,
    vehicle.class_name,
    vehicle.class,
    vehicle.vehicle_class,
    "Unknown"
  );

  let rawTrajectory = firstDefined(
    vehicle.trajectory,
    vehicle.detections,
    vehicle.timeline,
    vehicle.observations,
    vehicle.path,
    vehicle.vehicle_path,
    vehicle.camera_path,
    vehicle.events,
    []
  );

  if (!Array.isArray(rawTrajectory)) {
    rawTrajectory = [];
  }

  const trajectory = rawTrajectory
    .map((obs, i) => normalizeObservation(obs, i))
    .sort((a, b) => {
      const timeA = a.timestamp_seconds ?? a.first_time_sec ?? a.start_timestamp ?? 0;
      const timeB = b.timestamp_seconds ?? b.first_time_sec ?? b.start_timestamp ?? 0;
      return timeA - timeB;
    });

  const cameraIdsFromTrajectory = [
    ...new Set(
      trajectory.map((obs) => obs.camera_id).filter(Boolean)
    ),
  ];

  const junctionIdsFromTrajectory = [
    ...new Set(
      trajectory
        .map((obs) => obs.junction_id || obs.junction)
        .filter(Boolean)
    ),
  ];

  const explicitCameras = firstDefined(
    vehicle.camera_ids,
    vehicle.cameras,
    vehicle.camera_list,
    []
  );

  const cameraList = Array.isArray(explicitCameras) ? explicitCameras : [];

  const cameraIds = [
    ...new Set([
      ...cameraIdsFromTrajectory,
      ...cameraList.map((camera) =>
        typeof camera === "string"
          ? camera
          : firstDefined(camera?.camera_id, camera?.id, camera?.camera, null)
      ),
    ].filter(Boolean)),
  ];

  const explicitJunctions = firstDefined(
    vehicle.junctions,
    vehicle.junction_ids,
    vehicle.sites,
    []
  );

  const junctionList = Array.isArray(explicitJunctions) ? explicitJunctions : [];

  const junctionIds = [
    ...new Set([
      ...junctionIdsFromTrajectory,
      ...junctionList.map((junction) =>
        typeof junction === "string"
          ? junction
          : firstDefined(junction?.junction_id, junction?.id, junction?.junction, null)
      ),
    ].filter(Boolean)),
  ];

  const cameraCount = Number(firstDefined(
    vehicle.camera_count,
    vehicle.num_cameras,
    vehicle.cameras_count,
    cameraIds.length
  )) || cameraIds.length;

  const junctionCount = Number(firstDefined(
    vehicle.junction_count,
    vehicle.num_junctions,
    junctionIds.length
  )) || junctionIds.length;

  const observationCount = Number(firstDefined(
    vehicle.observation_count,
    vehicle.num_observations,
    trajectory.length
  )) || trajectory.length;

  const hasPlate =
    vehicle.has_plate !== undefined
      ? Boolean(vehicle.has_plate)
      : Boolean(plate);

  const firstSeen = trajectory.length > 0
    ? firstDefined(
        vehicle.first_seen,
        vehicle.first_timestamp,
        trajectory[0]?.timestamp_seconds,
        trajectory[0]?.first_time_sec,
        trajectory[0]?.start_timestamp,
        null
      )
    : null;

  const lastSeen = trajectory.length > 0
    ? firstDefined(
        vehicle.last_seen,
        vehicle.last_timestamp,
        trajectory[trajectory.length - 1]?.timestamp_seconds,
        trajectory[trajectory.length - 1]?.last_time_sec,
        trajectory[trajectory.length - 1]?.end_timestamp,
        null
      )
    : null;

  return {
    ...vehicle,
    global_vehicle_id: globalVehicleId,
    plate: plate,
    plate_number: plate,
    plate_text: plate,
    has_plate: hasPlate,
    vehicle_type: vehicleType,
    trajectory,
    camera_ids: cameraIds,
    cameras: cameraIds,
    junction_ids: junctionIds,
    junctions: junctionIds,
    camera_count: cameraCount,
    junction_count: junctionCount,
    observation_count: observationCount,
    first_seen: firstSeen,
    last_seen: lastSeen,
    reid_confidence: toNumber(
      firstDefined(
        vehicle.reid_confidence,
        vehicle.reid_score,
        vehicle.similarity
      ),
      null
    ),
  };
}

/* =========================================================
   SEARCH HELPER (for local fallback)
========================================================= */

function matchesVehicle(vehicle, query) {
  if (!query) return true;
  const q = String(query).trim().toLowerCase();
  if (!q) return true;

  const searchableFields = [
    vehicle.global_vehicle_id,
    vehicle.plate,
    vehicle.plate_number,
    vehicle.plate_text,
    vehicle.vehicle_type,
    ...(vehicle.camera_ids || []),
    ...(vehicle.junction_ids || []),
    ...(vehicle.cameras || []),
    ...(vehicle.junctions || []),
  ];

  return searchableFields.some((value) =>
    String(value ?? "").toLowerCase().includes(q)
  );
}

/* =========================================================
   API OBJECT
========================================================= */

export const api = {
  /* -------------------------------------------------------
     HEALTH
  ------------------------------------------------------- */

  getHealth: () => request("/api/health"),

  getSystemHealth: () => request("/api/system/health"),

  /* -------------------------------------------------------
     CAMERAS — Backend first, local fallback
  ------------------------------------------------------- */

  getCameras: async () => {
    try {
      const data = await request("/api/cameras");
      const normalized = {};
      if (typeof data === "object" && data !== null) {
        Object.entries(data).forEach(([key, cam]) => {
          const normKey = normalizeCameraId(key);
          normalized[normKey] = {
            ...cam,
            id: normKey,
            camera_id: normKey,
            name: getCanonicalCameraName(normKey, cam.camera_name || cam.name),
            camera_name: getCanonicalCameraName(normKey, cam.camera_name || cam.name),
            junction_name: getCanonicalJunctionName(cam.junction_name || cam.scene),
            scene: getCanonicalJunctionName(cam.scene || cam.junction_name),
          };
        });
      }
      return normalized;
    } catch (error) {
      console.warn("[Cameras] Backend unavailable:", error);
      return {};
    }
  },

  /* -------------------------------------------------------
     VEHICLES — Backend first (reads from detections.json)
  ------------------------------------------------------- */

  getVehicles: async (params = {}) => {
    try {
      const queryParts = [];
      if (params.limit) queryParts.push(`limit=${params.limit}`);
      if (params.matched_only) queryParts.push("matched_only=true");
      if (params.has_plate !== undefined) queryParts.push(`has_plate=${params.has_plate}`);
      if (params.camera_id) queryParts.push(`camera_id=${encodeURIComponent(params.camera_id)}`);

      const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
      const data = await request(`/api/vehicles${qs}`);

      if (Array.isArray(data)) {
        return data.map((v, i) => normalizeVehicle(v, i));
      }
      return [];
    } catch (error) {
      console.warn("[Vehicles] Backend unavailable, returning empty:", error);
      return [];
    }
  },

  /* -------------------------------------------------------
     SINGLE VEHICLE
  ------------------------------------------------------- */

  getVehicle: async (globalVehicleId) => {
    try {
      const data = await request(
        `/api/vehicles/${encodeURIComponent(globalVehicleId)}`
      );
      return normalizeVehicle(data, 0);
    } catch (error) {
      console.warn("[Vehicle Detail] Backend unavailable:", error);
      return null;
    }
  },

  /* -------------------------------------------------------
     VEHICLE SEARCH — Backend first
  ------------------------------------------------------- */

  searchVehicles: async (q) => {
    try {
      const data = await request(
        `/api/vehicles/search?q=${encodeURIComponent(q)}`
      );
      if (data && data.found) {
        return [normalizeVehicle(data, 0)];
      }
      return [];
    } catch (error) {
      console.warn("[Search] Backend unavailable:", error);
      return [];
    }
  },

  /* -------------------------------------------------------
     STATS
  ------------------------------------------------------- */

  getStats: async () => {
    try {
      return await request("/api/stats");
    } catch (error) {
      console.warn("[Stats] Backend unavailable:", error);
      return {
        total_vehicles: 0,
        total_cameras: 4,
      };
    }
  },

  /* -------------------------------------------------------
     ANALYTICS
  ------------------------------------------------------- */

  getAnalytics: async () => {
    try {
      return await request("/api/analytics");
    } catch (error) {
      console.warn("[Analytics] Backend unavailable:", error);
      return {
        kpis: {
          cameras_online: 4,
          total_tracks: 0,
          total_detections: 0,
          unique_plates: 0,
        },
        vehicle_types: [],
        camera_volumes: [],
        cross_flows: [],
      };
    }
  },

  /* -------------------------------------------------------
     MAP
  ------------------------------------------------------- */

  getMapModel: async () => {
    try {
      return await request("/api/map/model");
    } catch (error) {
      console.warn("[Map] Backend map model unavailable:", error);
      return {
        cameras: {},
        vehicles: [],
      };
    }
  },

  /* -------------------------------------------------------
     ALERTS & ANOMALIES
  ------------------------------------------------------- */

  getAlerts: async () => {
    try {
      return await request("/api/alerts");
    } catch (error) {
      console.warn("[Alerts] Backend unavailable:", error);
      return {
        total_alerts: 0,
        blacklist_alerts: [],
        anomaly_alerts: [],
        congestion_alerts: [],
        all_alerts_sorted: [],
      };
    }
  },

  /* -------------------------------------------------------
     MYSQL DATABASE STATUS
  ------------------------------------------------------- */

  getDbStatus: async () => {
    try {
      return await request("/api/db/status");
    } catch (error) {
      console.warn("[DB Status] Unavailable:", error);
      return { status: "disconnected" };
    }
  },

  /* -------------------------------------------------------
     BEL SPECIALIZED SERVICES (SECTION 65B & SIGNAL ADVISOR)
  ------------------------------------------------------- */

  getEvidenceCertificate: async (plate) => {
    return await request(`/api/vehicles/${encodeURIComponent(plate)}/evidence-certificate`);
  },

  getSignalRecommendations: async () => {
    return await request("/api/traffic/signal-recommendations");
  },

  getHealthSummary: async () => {
    return await request("/api/system/health-summary");
  },

  /* -------------------------------------------------------
     LIVE WEBCAM ANPR & OPTICAL TEXT RECOGNITION
  ------------------------------------------------------- */
  scanLiveFrame: async (payload) => {
    return await request("/api/anpr/scan-frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  getLiveAnprHistory: async (limit = 50) => {
    return await request(`/api/anpr/live-history?limit=${limit}`);
  },

  clearLiveAnprHistory: async () => {
    return await request("/api/anpr/clear-history", {
      method: "POST",
    });
  },

  getLiveAnprStatus: async () => {
    return await request("/api/anpr/status");
  },

  /* -------------------------------------------------------
     MYSQL BLACKLIST CRUD (PHASE 5, 6, 7)
  ------------------------------------------------------- */

  getBlacklist: async (params = {}) => {
    try {
      const q = [];
      if (params.status) q.push(`status=${encodeURIComponent(params.status)}`);
      if (params.priority) q.push(`priority=${encodeURIComponent(params.priority)}`);
      const qs = q.length > 0 ? `?${q.join("&")}` : "";
      return await request(`/api/blacklist${qs}`);
    } catch (error) {
      console.warn("[Blacklist] API error, falling back to watchlist:", error);
      return [];
    }
  },

  addBlacklist: async (entry) => {
    return await request("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  },

  updateBlacklist: async (id, data) => {
    return await request(`/api/blacklist/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  deleteBlacklist: async (id) => {
    return await request(`/api/blacklist/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  getBlacklistEvents: async (plate) => {
    try {
      return await request(`/api/blacklist/${encodeURIComponent(plate)}/events`);
    } catch (error) {
      console.warn("[Blacklist Events] Error:", error);
      return { plate, events: [], count: 0 };
    }
  },

  /* -------------------------------------------------------
     MYSQL ALERTS & POLLING
  ------------------------------------------------------- */

  getUnreadAlerts: async () => {
    try {
      return await request("/api/alerts/unread");
    } catch (error) {
      return { unread_count: 0, alerts: [] };
    }
  },

  markAlertRead: async (id) => {
    return await request(`/api/alerts/${encodeURIComponent(id)}/read`, {
      method: "POST",
    });
  },

  markAllAlertsRead: async () => {
    return await request("/api/alerts/read-all", {
      method: "POST",
    });
  },

  /* -------------------------------------------------------
     WATCHLIST CRUD (LEGACY)
  ------------------------------------------------------- */

  getWatchlist: async () => {
    try {
      return await request("/api/watchlist");
    } catch (error) {
      console.warn("[Watchlist] Backend unavailable:", error);
      return [];
    }
  },

  addToWatchlist: async (entry) => {
    return await request("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  },

  deleteFromWatchlist: async (plate) => {
    return await request(`/api/watchlist/${encodeURIComponent(plate)}`, {
      method: "DELETE",
    });
  },

  /* -------------------------------------------------------
     SPECIALIZED ANALYTICS (OD, Congestion, Speed)
  ------------------------------------------------------- */

  getOriginDestination: async () => {
    try {
      return await request("/api/analytics/od");
    } catch (error) {
      console.warn("[OD Analytics] Backend unavailable:", error);
      return { od_matrix: [], cross_flows: [] };
    }
  },

  getCongestionAnalytics: async () => {
    try {
      return await request("/api/analytics/congestion");
    } catch (error) {
      console.warn("[Congestion Analytics] Backend unavailable:", error);
      return { bottlenecks: [], junction_volumes: [], camera_volumes: [] };
    }
  },

  getSpeedAnalytics: async () => {
    try {
      return await request("/api/analytics/speed");
    } catch (error) {
      console.warn("[Speed Analytics] Backend unavailable:", error);
      return { speed_summary: {}, speed_samples: [] };
    }
  },

  /* -------------------------------------------------------
     SYSTEM HEALTH
  ------------------------------------------------------- */

  getSystemHealth: async () => {
    try {
      return await request("/api/system/health");
    } catch (error) {
      console.warn("[System Health] Backend unavailable:", error);
      return null;
    }
  },

  /* -------------------------------------------------------
     TECHNICAL VALIDATION & ADVANCED ANALYTICS (SIH PS 26127)
  ------------------------------------------------------- */

  getSystemValidation: async () => {
    try {
      return await request("/api/system/validation");
    } catch (error) {
      console.warn("[System Validation] Backend unavailable:", error);
      return null;
    }
  },

  getTrafficTimeseries: async (interval = "15s") => {
    try {
      return await request(`/api/traffic/timeseries?interval=${encodeURIComponent(interval)}`);
    } catch (error) {
      return null;
    }
  },

  getTrafficHeatmap: async () => {
    try {
      return await request("/api/traffic/heatmap");
    } catch (error) {
      return null;
    }
  },

  getObservations: async (limit = 100) => {
    try {
      return await request(`/api/observations?limit=${limit}`);
    } catch (error) {
      return [];
    }
  },

  reviewPlateDetection: async (detectionId, correctedPlate, notes = "") => {
    return await request(`/api/detections/${encodeURIComponent(detectionId)}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corrected_plate: correctedPlate, reviewer_notes: notes }),
    });
  },

  /* -------------------------------------------------------
     PLATE IMAGE
  ------------------------------------------------------- */

  getPlateImageUrl: (imageName) => {
    const base = getApiBase();
    return imageName
      ? `${base}/api/plates/${encodeURIComponent(
          typeof imageName === "string" && imageName.includes("/")
            ? imageName.split("/").pop()
            : imageName
        )}`
      : null;
  },

  /* -------------------------------------------------------
     CAMERA VIDEO & EVIDENCE
  ------------------------------------------------------- */

  getCameraVideoUrl: (cameraId, quality = "high") => {
    const norm = normalizeCameraId(cameraId);
    const base = getApiBase();
    return `${base}/api/cameras/${encodeURIComponent(norm)}/video${quality !== "high" ? `?quality=${quality}` : ""}`;
  },

  getEvidenceClipUrl: (cameraId, timestamp, preRoll = 5, duration = 15) => {
    const norm = normalizeCameraId(cameraId);
    const t = Math.max(0, Math.round(Number(timestamp) || 0));
    const base = getApiBase();
    return `${base}/api/cameras/${encodeURIComponent(norm)}/evidence?timestamp=${t}&pre_roll=${preRoll}&duration=${duration}`;
  },

  getEvidenceYoloTracks: (cameraId, timestamp, plate, preRoll = 5, duration = 15) => {
    const norm = normalizeCameraId(cameraId);
    const t = Math.max(0, Math.round(Number(timestamp) || 0));
    return request(
      `/api/cameras/${encodeURIComponent(norm)}/yolo-tracks?timestamp=${t}&plate=${encodeURIComponent(plate || "")}&pre_roll=${preRoll}&duration=${duration}`
    );
  },


  /* -------------------------------------------------------
     MAP BACKGROUND
  ------------------------------------------------------- */

  getMapBackgroundUrl: () => {
    const base = getApiBase();
    return `${base}/api/map/background`;
  },

  /* -------------------------------------------------------
     DASHBOARD (consolidated endpoint)
  ------------------------------------------------------- */

  getDashboard: async () => {
    try {
      return await request("/api/dashboard");
    } catch (error) {
      console.warn("[Dashboard] Backend unavailable:", error);
      return null;
    }
  },

  /* -------------------------------------------------------
     ALERTS & WATCHLIST (PHASE 7, 8, 9)
  ------------------------------------------------------- */

  getAlerts: async () => {
    try {
      return await request("/api/alerts");
    } catch (error) {
      console.warn("[Alerts] Failed to fetch alerts:", error);
      return { total_alerts: 0, alerts: [] };
    }
  },

  getWatchlist: async () => {
    try {
      return await request("/api/watchlist");
    } catch (error) {
      console.warn("[Watchlist] Failed to fetch watchlist:", error);
      return [];
    }
  },

  addToWatchlist: async (plate, reason, priority = "HIGH") => {
    return await request("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate, reason, priority }),
    });
  },

  removeFromWatchlist: async (plate) => {
    return await request(`/api/watchlist/${encodeURIComponent(plate)}`, {
      method: "DELETE",
    });
  },

  /* -------------------------------------------------------
     EXTENDED ANALYTICS (PHASE 2, 3, 5, 6)
  ------------------------------------------------------- */

  getOdMatrix: async () => {
    try {
      return await request("/api/analytics/od");
    } catch (error) {
      return [];
    }
  },

  getSpeedAnalytics: async () => {
    try {
      return await request("/api/analytics/speed");
    } catch (error) {
      return {};
    }
  },

  getCongestion: async () => {
    try {
      return await request("/api/analytics/congestion");
    } catch (error) {
      return {};
    }
  },

  getBottlenecks: async () => {
    try {
      return await request("/api/analytics/bottlenecks");
    } catch (error) {
      return [];
    }
  },

  /* =========================================================
     ENTERPRISE FEATURES: VAHAN, INTERCEPTION & E-CHALLAN
  ========================================================= */
  async getVahanDetails(plate, vehicleType = "Car") {
    try {
      const cleanPlate = encodeURIComponent(String(plate).trim());
      const vtypeParam = vehicleType ? `?vehicle_type=${encodeURIComponent(vehicleType)}` : "";
      return await request(`/api/vehicles/${cleanPlate}/vahan${vtypeParam}`);
    } catch (error) {
      console.warn(`[API] getVahanDetails failed for ${plate}:`, error);
      return null;
    }
  },

  async getInterceptionData(plate, lastCameraId = null, speedKmh = null) {
    try {
      const cleanPlate = encodeURIComponent(String(plate).trim());
      let url = `/api/vehicles/${cleanPlate}/interception`;
      const params = [];
      if (lastCameraId) params.push(`last_camera_id=${encodeURIComponent(lastCameraId)}`);
      if (speedKmh) params.push(`speed_kmh=${speedKmh}`);
      if (params.length > 0) url += `?${params.join("&")}`;
      return await request(url);
    } catch (error) {
      console.warn(`[API] getInterceptionData failed for ${plate}:`, error);
      return null;
    }
  },

  async dispatchPcrUnit(payload) {
    try {
      return await request("/api/interception/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn("[API] dispatchPcrUnit failed:", error);
      throw error;
    }
  },

  async getEChallanData(plate, speed = null) {
    try {
      const cleanPlate = encodeURIComponent(String(plate).trim());
      const url = speed ? `/api/vehicles/${cleanPlate}/echallan?speed=${speed}` : `/api/vehicles/${cleanPlate}/echallan`;
      return await request(url);
    } catch (error) {
      console.warn(`[API] getEChallanData failed for ${plate}:`, error);
      return null;
    }
  },

  async getFraudCheck(plate) {
    try {
      const cleanPlate = encodeURIComponent(String(plate).trim());
      return await request(`/api/vehicles/${cleanPlate}/fraud-check`);
    } catch (error) {
      console.warn(`[API] getFraudCheck failed for ${plate}:`, error);
      return null;
    }
  },

  /* =========================================================
     DRISHTI-GPT AI COPILOT
  ========================================================= */
  async askDrishtiGpt(query, context = null) {
    try {
      return await request("/api/v1/copilot/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, context }),
      });
    } catch (error) {
      console.warn("[API] askDrishtiGpt failed:", error);
      throw error;
    }
  },

  async getDrishtiGptSuggestions() {
    try {
      const res = await request("/api/v1/copilot/suggestions");
      return res?.suggestions || [];
    } catch (error) {
      console.warn("[API] getDrishtiGptSuggestions failed:", error);
      return [];
    }
  },

  /* =========================================================
     GEMMA 4 MULTIMODAL TRAFFIC INTELLIGENCE
  ========================================================= */

  async analyzeTrafficScene(payload = {}) {
    try {
      return await request("/api/ai/analyze-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn("[API] analyzeTrafficScene failed:", error);
      throw error;
    }
  },

  async getFrameDetections(cameraId, timestampSec = 0, windowSec = 3.0) {
    try {
      const q = new URLSearchParams({
        camera_id: cameraId,
        timestamp_sec: String(timestampSec),
        window_sec: String(windowSec),
      });
      return await request(`/api/ai/frame-detections?${q.toString()}`);
    } catch (error) {
      console.warn("[API] getFrameDetections failed:", error);
      return {
        status: "error",
        plates: [],
        class_breakdown: {},
        blacklisted_count: 0,
      };
    }
  },

  async getCameraLandmarks(cameraId) {
    try {
      const q = new URLSearchParams({ camera_id: cameraId });
      return await request(`/api/ai/camera-landmarks?${q.toString()}`);
    } catch (error) {
      console.warn("[API] getCameraLandmarks failed:", error);
      return { status: "error", landmarks: [] };
    }
  },

  async explainTrafficIncident(payload = {}) {
    try {
      return await request("/api/ai/explain-incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn("[API] explainTrafficIncident failed:", error);
      throw error;
    }
  },

  async getJourneyIntelligence(plate) {
    try {
      return await request("/api/ai/journey-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate }),
      });
    } catch (error) {
      console.warn("[API] getJourneyIntelligence failed:", error);
      throw error;
    }
  },

  async askDrishtiAi(query, activeCameraId = null) {
    try {
      return await request("/api/ai/ask-drishti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, active_camera_id: activeCameraId }),
      });
    } catch (error) {
      console.warn("[API] askDrishtiAi failed:", error);
      throw error;
    }
  },

  async generateAiReport(payload = {}) {
    try {
      return await request("/api/ai/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn("[API] generateAiReport failed:", error);
      throw error;
    }
  },

  async inspectUploadedFrame(payload = {}) {
    try {
      return await request("/api/ai/upload-inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn("[API] inspectUploadedFrame failed:", error);
      throw error;
    }
  },

  async getAiAnomaliesList() {
    try {
      const res = await request("/api/ai/anomalies-list");
      return res?.anomalies || [];
    } catch (error) {
      console.warn("[API] getAiAnomaliesList failed:", error);
      return [];
    }
  },
};

/* =========================================================
   FORMATTERS
========================================================= */

export function formatTime(seconds) {
  if (seconds === null || seconds === undefined) {
    return "-";
  }

  const value = Number(seconds);

  if (!Number.isFinite(value)) {
    return "-";
  }

  const minutes = Math.floor(value / 60);
  const secs = (value % 60).toFixed(1);

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
}

export function formatTimestampSec(seconds) {
  if (seconds === null || seconds === undefined) {
    return "00:00";
  }

  const value = Number(seconds);

  if (!Number.isFinite(value)) {
    return "00:00";
  }

  const minutes = Math.floor(value / 60);
  const secs = Math.floor(value % 60);

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatPercent(value) {
  if (value === null || value === undefined) {
    return "-";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return number <= 1
    ? `${(number * 100).toFixed(1)}%`
    : `${number.toFixed(1)}%`;
}

export function normalizeCameraId(cameraId) {
  if (!cameraId) return "junction_A_camera_01";
  const c = String(cameraId).trim();
  const cLower = c.toLowerCase().replace(/[\s\-]/g, "_");
  if (cLower.includes("a_camera_01") || cLower.includes("a_camera_1") || cLower === "camera_01" || cLower === "camera_1" || cLower === "c01" || cLower === "a_c01" || cLower === "a_c1") {
    return "junction_A_camera_01";
  }
  if (cLower.includes("a_camera_02") || cLower.includes("a_camera_2") || cLower === "camera_02" || cLower === "camera_2" || cLower === "c02" || cLower === "a_c02" || cLower === "a_c2") {
    return "junction_A_camera_02";
  }
  if (cLower.includes("b_camera_01") || cLower.includes("b_camera_1") || cLower === "camera_03" || cLower === "camera_3" || cLower === "c03" || cLower === "b_c01" || cLower === "b_c1") {
    return "junction_B_camera_01";
  }
  if (cLower.includes("b_camera_02") || cLower.includes("b_camera_2") || cLower === "camera_04" || cLower === "camera_4" || cLower === "c04" || cLower === "b_c02" || cLower === "b_c2") {
    return "junction_B_camera_02";
  }
  return c;
}

export function getCanonicalCameraName(camId, fallback) {
  const norm = normalizeCameraId(camId);
  switch (norm) {
    case "junction_A_camera_01":
      return "Junction A — Camera 01 (Inbound Entry)";
    case "junction_A_camera_02":
      return "Junction A — Camera 02 (Outbound Exit)";
    case "junction_B_camera_01":
      return "Junction B — Camera 01 (Inbound Entry)";
    case "junction_B_camera_02":
      return "Junction B — Camera 02 (Outbound Exit)";
    default:
      return fallback || camId || "Surveillance Camera";
  }
}

export function getCanonicalJunctionName(juncId, fallback) {
  const j = String(juncId || "").toLowerCase();
  if (j.includes("junction_a") || j.includes("junction a") || j.includes("south gate") || j.includes("sarani")) {
    return "Junction A — South Gate Quad";
  }
  if (j.includes("junction_b") || j.includes("junction b") || j.includes("north gate") || j.includes("kanyapur")) {
    return "Junction B — North Gate Quad";
  }
  return fallback || juncId || "Traffic Junction";
}

api.getApiBase = getApiBase;
api.setApiBase = setApiBase;

console.info("[API] Backend-first API client initialized. Base:", getApiBase() || "(proxy/relative)");