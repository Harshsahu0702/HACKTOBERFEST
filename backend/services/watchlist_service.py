"""
backend/services/watchlist_service.py

Persistent Watchlist and Blacklist Alert System for SIH 2026.
Reads and writes to dataset/metadata/watchlist.json.
Compares recognized vehicle plates against watchlist entries and generates real alerts.
"""

from pathlib import Path
import json
import re
from datetime import datetime
from typing import Dict, List, Any, Optional
from threading import RLock

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATCHLIST_FILE = PROJECT_ROOT / "dataset" / "metadata" / "watchlist.json"
DETECTIONS_FILE = PROJECT_ROOT / "dataset" / "metadata" / "detections.json"
CAMERAS_FILE = PROJECT_ROOT / "dataset" / "metadata" / "cameras.json"

_lock = RLock()


def normalize_plate(plate: str) -> str:
    """Normalize license plate: uppercase, remove spaces, hyphens, dots, underscores, punctuation."""
    if not plate:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", str(plate)).upper()


class WatchlistService:
    """Thread-safe persistent watchlist manager and alert generator."""

    def __init__(self):
        self._watchlist: Optional[List[Dict[str, Any]]] = None

    def _ensure_file_exists(self):
        if not WATCHLIST_FILE.exists():
            default_data = [
                {
                    "plate": "WB37E1275",
                    "status": "blacklisted",
                    "reason": "Suspected traffic violation & corridor transit alert",
                    "priority": "HIGH",
                    "added_at": "2026-09-10T12:00:00Z"
                },
                {
                    "plate": "JH10CS2095",
                    "status": "monitored",
                    "reason": "High-frequency cross-corridor transit monitoring",
                    "priority": "MEDIUM",
                    "added_at": "2026-09-10T12:30:00Z"
                }
            ]
            WATCHLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(WATCHLIST_FILE, "w", encoding="utf-8") as f:
                json.dump(default_data, f, indent=2)

    def get_watchlist(self) -> List[Dict[str, Any]]:
        """Return full list of watchlist entries."""
        with _lock:
            self._ensure_file_exists()
            try:
                with open(WATCHLIST_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data if isinstance(data, list) else []
            except Exception as e:
                print(f"[WatchlistService] Error reading watchlist: {e}")
                return []

    def add_entry(self, plate: str, status: str = "blacklisted", reason: str = "", priority: str = "HIGH") -> Dict[str, Any]:
        """Add new plate to watchlist and persist to disk."""
        norm_p = normalize_plate(plate)
        if not norm_p:
            raise ValueError("Plate number cannot be empty")

        with _lock:
            items = self.get_watchlist()
            # Check if plate already in watchlist
            for it in items:
                if normalize_plate(it.get("plate", "")) == norm_p:
                    it["status"] = status
                    it["reason"] = reason or it.get("reason", "Watchlist entry")
                    it["priority"] = priority.upper()
                    it["updated_at"] = datetime.utcnow().isoformat() + "Z"
                    self._save_watchlist(items)
                    return it

            new_entry = {
                "plate": norm_p,
                "status": status.lower(),
                "reason": reason or f"Alert registered for vehicle {norm_p}",
                "priority": priority.upper(),
                "added_at": datetime.utcnow().isoformat() + "Z"
            }
            items.append(new_entry)
            self._save_watchlist(items)
            return new_entry

    def delete_entry(self, plate: str) -> bool:
        """Remove plate from watchlist."""
        norm_p = normalize_plate(plate)
        if not norm_p:
            return False

        with _lock:
            items = self.get_watchlist()
            initial_len = len(items)
            filtered = [it for it in items if normalize_plate(it.get("plate", "")) != norm_p]
            if len(filtered) < initial_len:
                self._save_watchlist(filtered)
                return True
            return False

    def _save_watchlist(self, items: List[Dict[str, Any]]):
        try:
            with open(WATCHLIST_FILE, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2)
        except Exception as e:
            print(f"[WatchlistService] Error saving watchlist: {e}")

    def generate_alerts(self, detections: List[Dict[str, Any]], cameras: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Cross-reference detected plates with current watchlist entries
        and produce real, verifiable alert records.
        """
        watchlist = self.get_watchlist()
        if not watchlist or not detections:
            return []

        wl_map = {normalize_plate(item["plate"]): item for item in watchlist if item.get("plate")}
        alerts = []

        for d in detections:
            raw_p = d.get("plate")
            if not raw_p:
                continue

            norm_p = normalize_plate(raw_p)
            if norm_p in wl_map:
                wl_info = wl_map[norm_p]
                cid = d.get("camera_id")
                cam = cameras.get(cid, {})

                t_sec = float(d.get("timestamp_sec", 0.0))
                mins = int(t_sec // 60)
                secs = int(t_sec % 60)
                time_formatted = f"{mins:02d}:{secs:02d}"

                plate_img = d.get("plate_image")
                plate_img_url = f"/api/plates/{Path(plate_img).name}" if plate_img else None

                alert_type = "BLACKLISTED_VEHICLE" if wl_info.get("status") == "blacklisted" else "MONITORED_VEHICLE"

                alerts.append({
                    "alert_id": f"ALT_WL_{d.get('detection_id', '0')}",
                    "alert_type": alert_type,
                    "plate": norm_p,
                    "raw_plate": raw_p,
                    "status": wl_info.get("status", "blacklisted"),
                    "priority": wl_info.get("priority", "HIGH"),
                    "reason": wl_info.get("reason", "Target vehicle detected"),
                    "camera_id": cid,
                    "camera_name": cam.get("camera_name", cid),
                    "junction_id": d.get("junction_id", ""),
                    "junction_name": cam.get("junction_name", d.get("junction_id", "")),
                    "timestamp_sec": round(t_sec, 2),
                    "timestamp_formatted": time_formatted,
                    "confidence": d.get("ocr_confidence", 0.9),
                    "plate_confidence": d.get("plate_confidence", 0.9),
                    "vehicle_type": d.get("vehicle_type", "car"),
                    "plate_image_url": plate_img_url,
                    "detection_id": d.get("detection_id"),
                    "vehicle_track_id": d.get("vehicle_track_id"),
                })

        # Sort alerts by priority (HIGH first), then chronological timestamp
        priority_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        alerts.sort(key=lambda a: (priority_order.get(a["priority"], 9), a["timestamp_sec"]))
        return alerts


watchlist_service = WatchlistService()
