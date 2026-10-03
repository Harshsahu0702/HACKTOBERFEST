"""
backend/services/mysql_search_service.py

Database-backed vehicle search and chronological GIS journey reconstruction.
Uses MySQL plate_detections, vehicle_observations, cameras, junctions, and blacklisted_vehicles.
Does NOT use stale synthetic coordinates; uses ground-truth camera coordinates.
"""

import re
import math
from typing import Dict, Any, Optional, List
from sqlalchemy import select, desc, func
from backend.database.connection import SessionLocal
from backend.database.models import (
    PlateDetection,
    VehicleObservation,
    Camera,
    Junction,
    BlacklistedVehicle,
    Alert,
)


def normalize_plate(raw_text: str) -> str:
    """Normalize license plate string to uppercase alphanumeric."""
    if not raw_text:
        return ""
    return re.sub(r"[^A-Z0-9]", "", str(raw_text).upper())


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute distance in meters between two lat/lon coordinates."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class MySQLSearchService:

    @staticmethod
    def search_vehicle(plate_query: str) -> Optional[Dict[str, Any]]:
        """
        Search for a license plate in MySQL.
        Returns complete journey timeline, camera GIS transit route,
        speed estimation across junctions, and blacklist alert status.
        """
        if not SessionLocal:
            return None

        norm_query = normalize_plate(plate_query)
        if not norm_query:
            return None

        session = SessionLocal()
        try:
            # 1. Fetch plate detections
            query = (
                select(PlateDetection, Camera, Junction)
                .join(Camera, PlateDetection.camera_id == Camera.id)
                .join(Junction, Camera.junction_id == Junction.id)
                .filter(PlateDetection.normalized_plate.like(f"%{norm_query}%"))
                .order_by(PlateDetection.timestamp_sec)
            )
            rows = session.execute(query).all()

            if not rows:
                bl_only = session.execute(
                    select(BlacklistedVehicle).filter(
                        BlacklistedVehicle.normalized_plate.like(f"%{norm_query}%")
                    )
                ).scalar_one_or_none()

                if not bl_only:
                    return None

                # Return registered blacklist vehicle record
                alert_rows = session.execute(
                    select(Alert).filter_by(plate_number=bl_only.plate_number).order_by(desc(Alert.created_at))
                ).scalars().all()

                return {
                    "found": True,
                    "query": plate_query,
                    "plate": bl_only.plate_number,
                    "normalized_plate": bl_only.normalized_plate,
                    "vehicle_id": f"BL-{bl_only.id}",
                    "global_vehicle_id": f"BL-{bl_only.id}",
                    "vehicle_class": "Monitored Target",
                    "is_blacklisted": bl_only.is_active,
                    "blacklist_status": "blacklisted" if bl_only.is_active else "inactive",
                    "blacklist_reason": bl_only.reason,
                    "blacklist_priority": bl_only.priority,
                    "observation_count": 0,
                    "camera_count": 0,
                    "cameras_visited": [],
                    "first_seen": None,
                    "last_seen": None,
                    "transit_duration_sec": 0,
                    "average_speed_kmh": None,
                    "highest_confidence": 1.0,
                    "timeline": [],
                    "trajectory": [],
                    "map_route": [],
                    "alerts": [
                        {
                            "id": a.id,
                            "type": a.alert_type,
                            "severity": a.severity,
                            "message": a.message,
                            "created_at": a.created_at.isoformat() if a.created_at else None,
                        }
                        for a in alert_rows
                    ],
                    "data_source": "MySQL (sih_traffic_intelligence:blacklisted_vehicles)",
                }

            # 2. Check blacklist status
            # Find matching normalized plate
            canonical_plate = rows[0][0].normalized_plate
            bl_record = session.execute(
                select(BlacklistedVehicle).filter_by(
                    normalized_plate=canonical_plate,
                    is_active=True,
                )
            ).scalar_one_or_none()

            # 3. Build chronological timeline
            timeline = []
            route = []
            detections = []
            seen_cams = set()

            for pd, cam, junc in rows:
                det_entry = {
                    "detection_id": pd.id,
                    "camera_id": cam.camera_code,
                    "camera_name": cam.camera_name,
                    "junction_id": junc.junction_code,
                    "junction_name": junc.name,
                    "timestamp_sec": pd.timestamp_sec,
                    "formatted_time": f"T+{pd.timestamp_sec:05.1f}s",
                    "ocr_confidence": round(pd.ocr_confidence, 3),
                    "detection_confidence": round(pd.plate_detection_confidence, 3),
                    "plate_image": pd.plate_image,
                    "latitude": cam.latitude,
                    "longitude": cam.longitude,
                    "lat": cam.latitude,
                    "lng": cam.longitude,
                }
                detections.append(det_entry)

                timeline.append({
                    "timestamp_sec": pd.timestamp_sec,
                    "time_str": f"T+{pd.timestamp_sec:05.1f}s",
                    "camera_id": cam.camera_code,
                    "camera_code": cam.camera_code,
                    "camera_name": cam.camera_name,
                    "junction_id": junc.junction_code,
                    "junction_code": junc.junction_code,
                    "junction_name": junc.name,
                    "confidence": round(pd.ocr_confidence, 3),
                    "plate_image": pd.plate_image,
                    "latitude": cam.latitude,
                    "longitude": cam.longitude,
                    "lat": cam.latitude,
                    "lng": cam.longitude,
                })

                # For map route: preserve chronological passage
                route.append({
                    "camera_code": cam.camera_code,
                    "camera_name": cam.camera_name,
                    "junction_code": junc.junction_code,
                    "junction_name": junc.name,
                    "lat": cam.latitude,
                    "lng": cam.longitude,
                    "timestamp_sec": pd.timestamp_sec,
                    "time_str": f"T+{pd.timestamp_sec:05.1f}s",
                })

            # Calculate inter-camera speeds between consecutive transitions
            speeds = []
            route_points = []
            unique_cams = []
            unique_juncs = []

            for p in route:
                route_points.append([p["lat"], p["lng"]])
                if p["camera_code"] not in unique_cams:
                    unique_cams.append(p["camera_code"])
                if p["junction_name"] not in unique_juncs:
                    unique_juncs.append(p["junction_name"])

            for i in range(len(route) - 1):
                p1 = route[i]
                p2 = route[i + 1]
                dt = p2["timestamp_sec"] - p1["timestamp_sec"]
                dist = haversine_meters(p1["lat"], p1["lng"], p2["lat"], p2["lng"])

                if dt > 0 and dist > 15:
                    speed_kmh = (dist / dt) * 3.6
                    if speed_kmh <= 160:  # Physical plausibility bound
                        speeds.append({
                            "from_camera": p1["camera_name"],
                            "to_camera": p2["camera_name"],
                            "distance_m": round(dist, 1),
                            "duration_sec": round(dt, 1),
                            "speed_kmh": round(speed_kmh, 1),
                        })

            avg_spd = round(sum(s["speed_kmh"] for s in speeds) / len(speeds), 1) if speeds else None
            avg_spd_label = f"{avg_spd} km/h" if avg_spd is not None else "N/A"

            # 4. Fetch associated alerts
            alerts_query = (
                select(Alert)
                .filter(Alert.plate_number == canonical_plate)
                .order_by(desc(Alert.created_at))
            )
            alerts_rows = session.execute(alerts_query).scalars().all()
            alerts_data = [
                {
                    "id": a.id,
                    "type": a.alert_type,
                    "severity": a.severity,
                    "message": a.message,
                    "is_read": a.is_read,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a in alerts_rows
            ]

            first_det = detections[0]
            last_det = detections[-1]

            return {
                "found": True,
                "plate": canonical_plate,
                "raw_plate": rows[0][0].plate_text,
                "vehicle_type": "car",
                "global_vehicle_id": canonical_plate,
                "blacklisted": bl_record is not None,
                "blacklist_details": {
                    "id": bl_record.id,
                    "reason": bl_record.reason,
                    "priority": bl_record.priority,
                    "notes": bl_record.notes,
                    "added_at": bl_record.created_at.isoformat() if bl_record.created_at else None,
                } if bl_record else None,
                "total_detections": len(detections),
                "observation_count": len(detections),
                "camera_count": len(unique_cams),
                "junction_count": len(unique_juncs),
                "cameras": unique_cams,
                "junctions": unique_juncs,
                "first_seen": first_det["timestamp_sec"],
                "last_seen": last_det["timestamp_sec"],
                "first_seen_meta": {
                    "timestamp_sec": first_det["timestamp_sec"],
                    "camera_code": first_det["camera_id"],
                    "camera_name": first_det["camera_name"],
                    "junction_name": first_det["junction_name"],
                },
                "last_seen_meta": {
                    "timestamp_sec": last_det["timestamp_sec"],
                    "camera_code": last_det["camera_id"],
                    "camera_name": last_det["camera_name"],
                    "junction_name": last_det["junction_name"],
                },
                "estimated_average_speed": avg_spd,
                "estimated_average_speed_label": avg_spd_label,
                "detections": detections,
                "trajectory": detections,
                "timeline": timeline,
                "route": route,
                "speeds": speeds,
                "journey": {
                    "events": detections,
                    "junctions": unique_juncs,
                    "cameras": unique_cams,
                    "route": route_points,
                    "estimated_average_speed": avg_spd,
                    "estimated_average_speed_label": avg_spd_label,
                },
                "alerts": alerts_data,
                "data_source": "MySQL (sih_traffic_intelligence)",
            }
        finally:
            session.close()

    @staticmethod
    def get_database_analytics() -> Dict[str, Any]:
        """Compute live traffic analytics directly from MySQL database."""
        if not SessionLocal:
            return {}

        session = SessionLocal()
        try:
            # 1. Basic counts
            from sqlalchemy import distinct
            from backend.database.models import VehicleTrack

            total_detections = session.execute(select(func.count(PlateDetection.id))).scalar_one() or 0
            total_tracks = session.execute(select(func.count(VehicleTrack.id))).scalar_one() or 0
            unique_plates = session.execute(select(func.count(distinct(PlateDetection.normalized_plate)))).scalar_one() or 0
            active_blacklist = session.execute(
                select(func.count(BlacklistedVehicle.id)).filter_by(is_active=True)
            ).scalar_one() or 0
            from backend.database.models import BlacklistEvent
            blacklist_events_count = session.execute(select(func.count(BlacklistEvent.id))).scalar_one() or 0

            # 2. Camera activity
            cam_activity_query = (
                select(Camera.camera_code, Camera.camera_name, func.count(PlateDetection.id))
                .join(PlateDetection, Camera.id == PlateDetection.camera_id)
                .group_by(Camera.id, Camera.camera_code, Camera.camera_name)
            )
            camera_activity = {
                row[0]: {"name": row[1], "count": row[2]}
                for row in session.execute(cam_activity_query).all()
            }

            # 3. Top detected plates
            top_plates_query = (
                select(PlateDetection.normalized_plate, func.count(PlateDetection.id).label("c"))
                .group_by(PlateDetection.normalized_plate)
                .order_by(desc("c"))
                .limit(10)
            )
            top_plates = [
                {"plate": row[0], "count": row[1]}
                for row in session.execute(top_plates_query).all()
            ]

            return {
                "total_plate_detections": total_detections,
                "total_vehicle_tracks": total_tracks,
                "unique_plates": unique_plates,
                "active_blacklist_vehicles": active_blacklist,
                "total_blacklist_events": blacklist_events_count,
                "camera_activity": camera_activity,
                "top_detected_plates": top_plates,
                "database_status": "ONLINE (MySQL 8.0)",
            }
        finally:
            session.close()
