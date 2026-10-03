"""
backend/services/mysql_blacklist_service.py

Database service for Blacklist vehicle management and events.
Supports CRUD, normalization, duplicate prevention, and retrospective
event matching against plate detections.
"""

import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy import select, func, desc, and_
from backend.database.connection import SessionLocal
from backend.database.models import (
    BlacklistedVehicle,
    BlacklistEvent,
    PlateDetection,
    Camera,
    Junction,
    Alert,
)


def normalize_plate(raw_plate: str) -> str:
    """Normalize license plate text to alphanumeric uppercase."""
    if not raw_plate:
        return ""
    return re.sub(r"[^A-Z0-9]", "", str(raw_plate).upper())


class MySQLBlacklistService:

    @staticmethod
    def get_all_blacklisted(filter_status: Optional[str] = None, priority: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve all blacklisted vehicles with detection statistics and last seen metadata."""
        if not SessionLocal:
            return []

        session = SessionLocal()
        try:
            query = select(BlacklistedVehicle)
            if filter_status == "active":
                query = query.filter_by(is_active=True)
            elif filter_status == "inactive":
                query = query.filter_by(is_active=False)

            if priority:
                query = query.filter_by(priority=priority.upper())

            query = query.order_by(desc(BlacklistedVehicle.created_at))
            vehicles = session.execute(query).scalars().all()

            results = []
            for v in vehicles:
                # Count events
                ev_query = (
                    select(
                        func.count(BlacklistEvent.id),
                        func.max(BlacklistEvent.timestamp_sec),
                    )
                    .filter(BlacklistEvent.blacklist_vehicle_id == v.id)
                )
                ev_count, last_timestamp = session.execute(ev_query).first() or (0, None)

                # Get last seen camera & junction details if detected
                last_seen_info = None
                if last_timestamp is not None:
                    last_ev = session.execute(
                        select(BlacklistEvent, Camera, Junction)
                        .join(Camera, BlacklistEvent.camera_id == Camera.id)
                        .join(Junction, BlacklistEvent.junction_id == Junction.id)
                        .filter(BlacklistEvent.blacklist_vehicle_id == v.id)
                        .order_by(desc(BlacklistEvent.timestamp_sec))
                        .limit(1)
                    ).first()

                    if last_ev:
                        ev, cam, junc = last_ev
                        last_seen_info = {
                            "timestamp_sec": ev.timestamp_sec,
                            "camera_code": cam.camera_code,
                            "camera_name": cam.camera_name,
                            "junction_name": junc.name,
                            "detected_at": ev.detected_at.isoformat() if ev.detected_at else None,
                        }

                results.append({
                    "id": v.id,
                    "plate_number": v.plate_number,
                    "normalized_plate": v.normalized_plate,
                    "reason": v.reason,
                    "priority": v.priority,
                    "is_active": v.is_active,
                    "notes": v.notes,
                    "created_at": v.created_at.isoformat() if v.created_at else None,
                    "detection_count": ev_count or 0,
                    "last_seen": last_seen_info,
                })

            return results
        finally:
            session.close()

    @staticmethod
    def add_blacklisted_vehicle(
        plate_number: str,
        reason: str,
        priority: str = "HIGH",
        notes: Optional[str] = None,
        is_active: bool = True,
    ) -> Dict[str, Any]:
        """
        Add a license plate to the blacklist.
        - Validates input
        - Normalizes plate
        - Checks for existing active record
        - Scans existing plate detections to retroactively register events & alerts (if active)
        """
        if not SessionLocal:
            raise RuntimeError("Database connection unavailable.")

        norm_plate = normalize_plate(plate_number)
        if not norm_plate:
            raise ValueError("Invalid license plate: must contain alphanumeric characters.")

        session = SessionLocal()
        try:
            # Check if active or inactive record exists
            existing = session.execute(
                select(BlacklistedVehicle).filter_by(normalized_plate=norm_plate)
            ).scalar_one_or_none()

            if existing:
                if existing.is_active and is_active:
                    raise ValueError(f"Vehicle with plate '{norm_plate}' is already active on the blacklist.")
                else:
                    # Reactivate/update
                    existing.is_active = is_active
                    existing.reason = reason or existing.reason
                    existing.priority = priority.upper()
                    if notes:
                        existing.notes = notes
                    existing.updated_at = datetime.now(timezone.utc)
                    session.commit()
                    target_id = existing.id
            else:
                new_bl = BlacklistedVehicle(
                    plate_number=plate_number.strip().upper(),
                    normalized_plate=norm_plate,
                    reason=reason or "Wanted / suspicious vehicle",
                    priority=priority.upper(),
                    is_active=is_active,
                    notes=notes,
                )
                session.add(new_bl)
                session.flush()
                target_id = new_bl.id

            events_created = 0
            # Only scan and generate active alerts if vehicle is marked ACTIVE
            if is_active:
                matching_pds = session.execute(
                    select(PlateDetection, Camera, Junction)
                    .join(Camera, PlateDetection.camera_id == Camera.id)
                    .join(Junction, Camera.junction_id == Junction.id)
                    .filter(PlateDetection.normalized_plate == norm_plate)
                ).all()

                for pd_obj, cam_obj, junc_obj in matching_pds:
                    existing_ev = session.execute(
                        select(BlacklistEvent).filter_by(
                            blacklist_vehicle_id=target_id,
                            plate_detection_id=pd_obj.id,
                        )
                    ).scalar_one_or_none()

                    if not existing_ev:
                        ev_time = datetime.now(timezone.utc)
                        event_obj = BlacklistEvent(
                            blacklist_vehicle_id=target_id,
                            plate_detection_id=pd_obj.id,
                            camera_id=cam_obj.id,
                            junction_id=junc_obj.id,
                            detected_at=ev_time,
                            timestamp_sec=pd_obj.timestamp_sec,
                            confidence=pd_obj.ocr_confidence,
                            status="NEW",
                        )
                        session.add(event_obj)
                        session.flush()

                        alert_msg = (
                            f"🚨 BLACKLIST VEHICLE DETECTED: Plate {norm_plate} "
                            f"captured at {cam_obj.camera_name} "
                            f"(Time: {pd_obj.timestamp_sec:.1f}s, Conf: {int(pd_obj.ocr_confidence * 100)}%)"
                        )
                        alert_obj = Alert(
                            alert_type="BLACKLIST_MATCH",
                            severity=priority.upper(),
                            plate_number=norm_plate,
                            camera_id=cam_obj.id,
                            junction_id=junc_obj.id,
                            plate_detection_id=pd_obj.id,
                            message=alert_msg,
                            is_read=False,
                            created_at=ev_time,
                        )
                        session.add(alert_obj)
                        events_created += 1

            session.commit()

            return {
                "id": target_id,
                "plate_number": plate_number.strip().upper(),
                "normalized_plate": norm_plate,
                "reason": reason,
                "priority": priority.upper(),
                "is_active": is_active,
                "matches_registered": events_created,
                "status": "success",
            }
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @staticmethod
    def get_blacklist_details(vehicle_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve full details for a single blacklisted vehicle including camera history and alerts."""
        if not SessionLocal:
            return None

        session = SessionLocal()
        try:
            v = session.execute(
                select(BlacklistedVehicle).filter_by(id=vehicle_id)
            ).scalar_one_or_none()

            if not v:
                return None

            # 1. Fetch detection events across cameras
            events_rows = session.execute(
                select(BlacklistEvent, Camera, Junction, PlateDetection)
                .join(Camera, BlacklistEvent.camera_id == Camera.id)
                .join(Junction, BlacklistEvent.junction_id == Junction.id)
                .join(PlateDetection, BlacklistEvent.plate_detection_id == PlateDetection.id)
                .filter(BlacklistEvent.blacklist_vehicle_id == v.id)
                .order_by(BlacklistEvent.timestamp_sec)
            ).all()

            events = []
            cameras_detected = []
            for ev, cam, junc, pd in events_rows:
                if cam.camera_name not in cameras_detected:
                    cameras_detected.append(cam.camera_name)
                events.append({
                    "event_id": ev.id,
                    "camera_code": cam.camera_code,
                    "camera_name": cam.camera_name,
                    "junction_name": junc.name,
                    "timestamp_sec": ev.timestamp_sec,
                    "time_str": f"T+{ev.timestamp_sec:.1f}s",
                    "confidence": ev.confidence,
                    "plate_image": pd.plate_image,
                    "detected_at": ev.detected_at.isoformat() if ev.detected_at else None,
                })

            # 2. Fetch associated alerts from alerts table
            alerts_rows = session.execute(
                select(Alert, Camera)
                .join(Camera, Alert.camera_id == Camera.id)
                .filter(Alert.plate_number == v.normalized_plate)
                .order_by(desc(Alert.created_at))
            ).all()

            alerts = [
                {
                    "id": a.id,
                    "alert_type": a.alert_type,
                    "severity": a.severity,
                    "message": a.message,
                    "is_read": a.is_read,
                    "camera_name": cam.camera_name,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a, cam in alerts_rows
            ]

            last_detected = events[-1] if events else None

            return {
                "id": v.id,
                "plate_number": v.plate_number,
                "normalized_plate": v.normalized_plate,
                "reason": v.reason,
                "priority": v.priority,
                "is_active": v.is_active,
                "notes": v.notes,
                "created_at": v.created_at.isoformat() if v.created_at else None,
                "updated_at": v.updated_at.isoformat() if v.updated_at else None,
                "detection_count": len(events),
                "cameras_detected": cameras_detected,
                "last_detected": last_detected,
                "events": events,
                "alerts": alerts,
            }
        finally:
            session.close()

    @staticmethod
    def update_blacklisted_vehicle(
        vehicle_id: int,
        reason: Optional[str] = None,
        priority: Optional[str] = None,
        is_active: Optional[bool] = None,
        notes: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update fields of an existing blacklisted vehicle entry."""
        if not SessionLocal:
            return None

        session = SessionLocal()
        try:
            v = session.execute(
                select(BlacklistedVehicle).filter_by(id=vehicle_id)
            ).scalar_one_or_none()

            if not v:
                return None

            if reason is not None:
                v.reason = reason
            if priority is not None:
                v.priority = priority.upper()
            if is_active is not None:
                v.is_active = is_active
            if notes is not None:
                v.notes = notes

            v.updated_at = datetime.now(timezone.utc)
            session.commit()

            return {
                "id": v.id,
                "plate_number": v.plate_number,
                "normalized_plate": v.normalized_plate,
                "reason": v.reason,
                "priority": v.priority,
                "is_active": v.is_active,
                "notes": v.notes,
            }
        finally:
            session.close()

    @staticmethod
    def delete_blacklisted_vehicle(vehicle_id: int) -> bool:
        """Permanently delete a blacklisted vehicle and cascade events."""
        if not SessionLocal:
            return False

        session = SessionLocal()
        try:
            v = session.execute(
                select(BlacklistedVehicle).filter_by(id=vehicle_id)
            ).scalar_one_or_none()

            if not v:
                return False

            session.delete(v)
            session.commit()
            return True
        finally:
            session.close()

    @staticmethod
    def get_events_for_plate(plate: str) -> List[Dict[str, Any]]:
        """Retrieve all blacklist detection events for a given license plate."""
        if not SessionLocal:
            return []

        norm_plate = normalize_plate(plate)
        session = SessionLocal()
        try:
            events = session.execute(
                select(BlacklistEvent, Camera, Junction, PlateDetection)
                .join(Camera, BlacklistEvent.camera_id == Camera.id)
                .join(Junction, BlacklistEvent.junction_id == Junction.id)
                .join(PlateDetection, BlacklistEvent.plate_detection_id == PlateDetection.id)
                .join(BlacklistedVehicle, BlacklistEvent.blacklist_vehicle_id == BlacklistedVehicle.id)
                .filter(BlacklistedVehicle.normalized_plate == norm_plate)
                .order_by(BlacklistEvent.timestamp_sec)
            ).all()

            results = []
            for ev, cam, junc, pd in events:
                results.append({
                    "event_id": ev.id,
                    "camera_code": cam.camera_code,
                    "camera_name": cam.camera_name,
                    "junction_name": junc.name,
                    "timestamp_sec": ev.timestamp_sec,
                    "detected_at": ev.detected_at.isoformat() if ev.detected_at else None,
                    "confidence": ev.confidence,
                    "plate_image": pd.plate_image,
                    "status": ev.status,
                })
            return results
        finally:
            session.close()
