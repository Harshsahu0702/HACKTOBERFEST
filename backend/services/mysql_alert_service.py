"""
backend/services/mysql_alert_service.py

Database-backed Alert service for SIH 2026.
Supports live polling of unread alerts, read receipts, and alert dispatching.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy import select, desc, func
from backend.database.connection import SessionLocal
from backend.database.models import Alert, Camera, Junction, PlateDetection


class MySQLAlertService:

    @staticmethod
    def get_alerts(unread_only: bool = False, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieve latest alerts with camera, junction, and observation context."""
        if not SessionLocal:
            return []

        session = SessionLocal()
        try:
            query = (
                select(Alert, Camera, Junction, PlateDetection)
                .join(Camera, Alert.camera_id == Camera.id)
                .join(Junction, Alert.junction_id == Junction.id)
                .outerjoin(PlateDetection, Alert.plate_detection_id == PlateDetection.id)
            )

            if unread_only:
                query = query.filter(Alert.is_read == False)

            query = query.order_by(desc(Alert.created_at)).limit(limit)
            rows = session.execute(query).all()

            results = []
            for alert, cam, junc, plate_det in rows:
                results.append({
                    "id": alert.id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "plate_number": alert.plate_number,
                    "camera_code": cam.camera_code,
                    "camera_name": cam.camera_name,
                    "junction_code": junc.junction_code,
                    "junction_name": junc.name,
                    "message": alert.message,
                    "is_read": alert.is_read,
                    "created_at": alert.created_at.isoformat() if alert.created_at else None,
                    "plate_detection_id": alert.plate_detection_id,
                    "timestamp_sec": plate_det.timestamp_sec if plate_det else 0.0,
                    "confidence": plate_det.ocr_confidence if plate_det else 0.95,
                    "plate_image": plate_det.plate_image if plate_det else None,
                })

            return results
        finally:
            session.close()

    @staticmethod
    def get_unread_count() -> int:
        """Get total count of currently unread alerts."""
        if not SessionLocal:
            return 0

        session = SessionLocal()
        try:
            count = session.execute(
                select(func.count(Alert.id)).filter(Alert.is_read == False)
            ).scalar_one() or 0
            return count
        finally:
            session.close()

    @staticmethod
    def mark_as_read(alert_id: int) -> bool:
        """Mark a specific alert as read."""
        if not SessionLocal:
            return False

        session = SessionLocal()
        try:
            alert = session.execute(
                select(Alert).filter_by(id=alert_id)
            ).scalar_one_or_none()

            if not alert:
                return False

            alert.is_read = True
            session.commit()
            return True
        finally:
            session.close()

    @staticmethod
    def mark_all_read() -> int:
        """Mark all unread alerts as read."""
        if not SessionLocal:
            return 0

        session = SessionLocal()
        try:
            unread_alerts = session.execute(
                select(Alert).filter_by(is_read=False)
            ).scalars().all()

            count = len(unread_alerts)
            for a in unread_alerts:
                a.is_read = True

            session.commit()
            return count
        finally:
            session.close()
