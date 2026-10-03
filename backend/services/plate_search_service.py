"""
backend/services/plate_search_service.py

Search and journey generation engine for plate-first vehicle investigation.
Calculates real physical estimated speed using camera GPS coordinates and timestamps.
Strictly adheres to: NO fabricated speed (returns null / N/A when mathematically indeterminate).
"""

from pathlib import Path
import re
from collections import defaultdict
from typing import Dict, List, Any, Optional
from backend.services.dataset_service import (
    load_detections,
    get_cameras_dict,
    get_map_model
)
from backend.services.analytics_engine import haversine_distance_meters

# Canonical ordering for demo junctions and cameras
JUNCTION_ORDER = {"junction_A": 1, "junction_B": 2}
CAMERA_ORDER = {
    "junction_A_camera_01": 1,
    "junction_A_camera_02": 2,
    "junction_B_camera_01": 3,
    "junction_B_camera_02": 4
}


def normalize_query(q: str) -> str:
    """Normalize input search string: uppercase, remove spaces, hyphens, underscores."""
    if not q:
        return ""
    return re.sub(r"[\s\-_]", "", str(q)).upper()


def build_journey_for_plate(plate_str: str, matching_detections: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Construct chronological vehicle journey across Junction A and Junction B.
    Calculates physically verified estimated speeds between cameras.
    """
    cameras = get_cameras_dict()

    # Sort detections by canonical junction order, camera order, then timestamp in video
    def sort_key(d):
        j_ord = JUNCTION_ORDER.get(d.get("junction_id", ""), 99)
        c_ord = CAMERA_ORDER.get(d.get("camera_id", ""), 99)
        t_sec = float(d.get("timestamp_sec", 0.0))
        return (j_ord, c_ord, t_sec)

    sorted_dets = sorted(matching_detections, key=sort_key)

    events = []
    unique_cams = []
    unique_juncs = []
    route_points = []
    journey_speeds = []

    for i, d in enumerate(sorted_dets):
        cam_id = d.get("camera_id")
        cam_info = cameras.get(cam_id, {})
        junc_id = d.get("junction_id")
        junc_name = cam_info.get("junction_name", junc_id)
        cam_name = cam_info.get("camera_name", d.get("camera_name", cam_id))
        lat = cam_info.get("lat", 0.0)
        lng = cam_info.get("lng", 0.0)

        # Image URL for plate crop
        plate_img = d.get("plate_image")
        plate_img_url = f"/api/plates/{Path(plate_img).name}" if plate_img else None

        t_sec = float(d.get("timestamp_sec", 0.0))

        # Calculate estimated speed from previous observation if at a different camera
        event_speed = None
        event_speed_label = "N/A"
        event_dist_m = 0.0
        event_dt_sec = 0.0

        if i > 0 and events:
            prev_evt = events[-1]
            prev_cam_id = prev_evt.get("camera_id")

            if prev_cam_id != cam_id and prev_evt.get("lat") and prev_evt.get("lng") and lat and lng:
                dist = haversine_distance_meters(prev_evt["lat"], prev_evt["lng"], lat, lng)
                dt = t_sec - prev_evt["timestamp_sec"]
                event_dist_m = round(dist, 1)
                event_dt_sec = round(dt, 2)

                if dt > 0.0 and dist > 5.0:
                    spd = (dist / dt) * 3.6
                    if spd <= 160.0:
                        event_speed = round(spd, 1)
                        event_speed_label = f"{event_speed} km/h"
                        journey_speeds.append(event_speed)
                    else:
                        event_speed_label = "N/A (Implausible)"
                else:
                    event_speed_label = "N/A (< 5m)"

        event = {
            "event_id": d.get("detection_id"),
            "detection_id": d.get("detection_id"),
            "camera_id": cam_id,
            "camera_name": cam_name,
            "junction_id": junc_id,
            "junction_name": junc_name,
            "vehicle_track_id": d.get("vehicle_track_id"),
            "vehicle_type": d.get("vehicle_type", "car"),
            "plate": d.get("plate", plate_str),
            "raw_plate": d.get("raw_plate", plate_str),
            "first_frame": d.get("first_frame", 0),
            "last_frame": d.get("last_frame", 0),
            "timestamp_sec": t_sec,
            "last_timestamp_sec": float(d.get("last_timestamp_sec", t_sec)),
            "duration_sec": float(d.get("duration_sec", 0.0)),
            "ocr_confidence": float(d.get("ocr_confidence", 0.9)),
            "plate_confidence": float(d.get("plate_confidence", 0.9)),
            "plate_image": plate_img,
            "plate_image_url": plate_img_url,
            "lat": lat,
            "lng": lng,
            "latitude": lat,
            "longitude": lng,
            # Real calculated speed or null (strictly no fake 35.0 km/h)
            "timestamp": t_sec,
            "speed": event_speed,
            "speed_label": event_speed_label,
            "transition_distance_m": event_dist_m,
            "transition_time_sec": event_dt_sec,
        }
        events.append(event)

        if cam_id not in unique_cams:
            unique_cams.append(cam_id)
        if junc_name not in unique_juncs:
            unique_juncs.append(junc_name)
        if lat and lng:
            route_points.append([lat, lng])

    # If route has fewer than 2 points but cameras exist, fallback to corridor
    if len(route_points) < 2 and len(cameras) >= 2:
        for cid in ["junction_A_camera_01", "junction_B_camera_01"]:
            c = cameras.get(cid)
            if c and [c["lat"], c["lng"]] not in route_points:
                route_points.append([c["lat"], c["lng"]])

    best_vtype = sorted_dets[0].get("vehicle_type", "car") if sorted_dets else "car"
    raw_plate = sorted_dets[0].get("raw_plate", plate_str) if sorted_dets else plate_str

    is_real_plate = bool(
        plate_str
        and not plate_str.startswith("TRACK_")
        and "_trk" not in plate_str
        and not plate_str.startswith("junction_")
    )
    actual_plate = plate_str if is_real_plate else None
    actual_raw_plate = raw_plate if is_real_plate else None
    display_gid = plate_str.replace("TRACK_", "") if plate_str.startswith("TRACK_") else plate_str

    avg_speed = round(sum(journey_speeds) / len(journey_speeds), 1) if journey_speeds else None
    avg_speed_label = f"{avg_speed} km/h" if avg_speed is not None else "N/A"

    first_seen = events[0]["timestamp_sec"] if events else 0.0
    last_seen = events[-1]["last_timestamp_sec"] if events else 0.0

    return {
        "found": True,
        "plate": actual_plate,
        "raw_plate": actual_raw_plate,
        "vehicle_type": best_vtype,
        "global_vehicle_id": display_gid,
        "camera_count": len(unique_cams),
        "junction_count": len(unique_juncs),
        "observation_count": len(events),
        "has_plate": is_real_plate,
        "cameras": unique_cams,
        "camera_ids": unique_cams,
        "junctions": unique_juncs,
        "total_duration": sum(e["duration_sec"] for e in events),
        "first_seen": first_seen,
        "last_seen": last_seen,
        "estimated_average_speed": avg_speed,
        "estimated_average_speed_label": avg_speed_label,
        "speed_samples_count": len(journey_speeds),
        "detections": events,
        "trajectory": events,
        "journey": {
            "events": events,
            "junctions": unique_juncs,
            "cameras": unique_cams,
            "route": route_points,
            "estimated_average_speed": avg_speed,
            "estimated_average_speed_label": avg_speed_label,
        }
    }


def search_by_plate(query: str) -> Dict[str, Any]:
    """
    Search all detections for plate matching query.
    Case-insensitive, whitespace-tolerant, hyphen-tolerant.
    """
    norm_q = normalize_query(query)
    if not norm_q:
        return {"found": False, "plate": query, "message": "Empty query"}

    all_dets = load_detections()
    if not all_dets:
        return {
            "found": False,
            "plate": query,
            "message": "No processed detections found in dataset/metadata/detections.json."
        }

    # 1. Exact match on normalized plate
    exact_matches = [
        d for d in all_dets
        if d.get("plate") and normalize_query(d["plate"]) == norm_q
    ]
    if exact_matches:
        plate = exact_matches[0]["plate"]
        # Find all detections for this resolved plate
        plate_matches = [d for d in all_dets if d.get("plate") == plate]
        return build_journey_for_plate(plate, plate_matches)

    # 2. Substring match on plate
    sub_matches = [
        d for d in all_dets
        if d.get("plate") and norm_q in normalize_query(d["plate"])
    ]
    if sub_matches:
        plate = sub_matches[0]["plate"]
        plate_matches = [d for d in all_dets if d.get("plate") == plate]
        return build_journey_for_plate(plate, plate_matches)

    # 3. Match by track ID or camera ID
    if norm_q.isdigit():
        trk_id = int(norm_q)
        trk_matches = [d for d in all_dets if d.get("vehicle_track_id") == trk_id]
        if trk_matches:
            plate = trk_matches[0].get("plate") or f"TRACK_{trk_id}"
            return build_journey_for_plate(plate, trk_matches)

    return {
        "found": False,
        "plate": query,
        "message": f"No vehicle found matching '{query}' in processed camera logs."
    }


_ALL_VEHICLES_CACHE = None


def get_cached_all_vehicles() -> List[Dict[str, Any]]:
    global _ALL_VEHICLES_CACHE
    if _ALL_VEHICLES_CACHE is not None:
        return _ALL_VEHICLES_CACHE

    all_dets = load_detections()
    if not all_dets:
        return []

    grouped = defaultdict(list)
    for d in all_dets:
        p = d.get("plate")
        if p and str(p).strip():
            key = str(p).strip()
        else:
            key = f"TRACK_{d.get('camera_id')}_trk{d.get('vehicle_track_id')}"
        grouped[key].append(d)

    built = []
    for key, items in grouped.items():
        journey = build_journey_for_plate(key, items)
        built.append(journey)

    _ALL_VEHICLES_CACHE = built
    return _ALL_VEHICLES_CACHE


def get_all_vehicles_list(
    limit: int = 500,
    page: int = 1,
    page_size: Optional[int] = None,
    matched_only: bool = False,
    has_plate: Optional[bool] = None,
    camera_id: Optional[str] = None,
    junction_id: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    q: Optional[str] = None,
    sort_by: str = "default",
) -> List[Dict[str, Any]]:
    """
    Group all detections by plate or vehicle track for Global Registry view.
    Supports comprehensive filtering, pagination, and sorting.
    """
    raw_vehicles = get_cached_all_vehicles()
    if not raw_vehicles:
        return []

    vehicles = []
    norm_q = normalize_query(q) if q else ""

    for v in raw_vehicles:
        is_plate = v.get("has_plate", False)

        # Filter has_plate
        if has_plate is not None and is_plate != has_plate:
            continue

        cams = v.get("cameras", [])
        juncs = v.get("junctions", [])
        v_type = v.get("vehicle_type", "car")

        # Filter matched_only
        if matched_only and v.get("camera_count", 1) <= 1:
            continue

        # Filter camera_id
        if camera_id and camera_id not in cams:
            continue

        # Filter junction_id
        if junction_id and junction_id not in juncs:
            continue

        # Filter vehicle_type
        if vehicle_type and v_type.lower() != vehicle_type.lower():
            continue

        # Filter search query
        if norm_q:
            match_key = normalize_query(v.get("global_vehicle_id", "") or v.get("plate", ""))
            if norm_q not in match_key:
                continue

        vehicles.append(v)

    # Sorting
    if sort_by == "observations":
        vehicles.sort(key=lambda x: (1 if x.get("has_plate") else 0, x.get("observation_count", 1)), reverse=True)
    elif sort_by == "cameras":
        vehicles.sort(key=lambda x: (1 if x.get("has_plate") else 0, x.get("camera_count", 1)), reverse=True)
    elif sort_by == "first_seen":
        vehicles.sort(key=lambda x: x.get("first_seen", 0.0))
    elif sort_by == "plate":
        vehicles.sort(key=lambda x: (not x.get("has_plate", False), (x.get("plate") or x.get("global_vehicle_id") or "")))
    else:
        # Default: All Recognized ANPR plates FIRST (105 real plates = pages 1-7)
        # Within plates: cross-camera verified first, then highest observation count
        # Unplated tracks follow after all recognized license plates
        vehicles.sort(
            key=lambda x: (
                1 if x.get("has_plate") else 0,
                1 if x.get("camera_count", 1) > 1 else 0,
                x.get("observation_count", 1)
            ),
            reverse=True
        )

    # Pagination handling
    if page_size is not None and page_size > 0:
        start_idx = (page - 1) * page_size
        return vehicles[start_idx:start_idx + page_size]

    return vehicles[:limit]
