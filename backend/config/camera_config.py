"""
backend/config/camera_config.py

New 4-camera dataset configuration for SIH 2026 Traffic Intelligence.
Reads from dataset/metadata/cameras.json as the single source of truth.
"""

from pathlib import Path
from typing import Dict, Any, Optional
import json

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CAMERAS_JSON = PROJECT_ROOT / "dataset" / "metadata" / "cameras.json"

# Clean 4-camera contract
DEFAULT_CAMERAS_CONFIG = {
    "junction_A_camera_01": {
        "id": "junction_A_camera_01",
        "camera_id": "junction_A_camera_01",
        "name": "Camera 01",
        "camera_name": "Camera 01",
        "junction_id": "junction_A",
        "junction_name": "Vivekananda Sarani",
        "scene": "Vivekananda Sarani",
        "video_path": "dataset/junction_A/camera_01.mp4",
        "video_rel_path": "dataset/junction_A/camera_01.mp4",
        "video_url": "/api/cameras/junction_A_camera_01/video",
        "lat": 23.710299,
        "lng": 86.952779,
    },
    "junction_A_camera_02": {
        "id": "junction_A_camera_02",
        "camera_id": "junction_A_camera_02",
        "name": "Camera 02",
        "camera_name": "Camera 02",
        "junction_id": "junction_A",
        "junction_name": "Vivekananda Sarani",
        "scene": "Vivekananda Sarani",
        "video_path": "dataset/junction_A/camera_02.mp4",
        "video_rel_path": "dataset/junction_A/camera_02.mp4",
        "video_url": "/api/cameras/junction_A_camera_02/video",
        "lat": 23.710293,
        "lng": 86.952695,
    },
    "junction_B_camera_01": {
        "id": "junction_B_camera_01",
        "camera_id": "junction_B_camera_01",
        "name": "Camera 01",
        "camera_name": "Camera 01",
        "junction_id": "junction_B",
        "junction_name": "Kanyapur Link Road",
        "scene": "Kanyapur Link Road",
        "video_path": "dataset/junction_B/camera_01.mp4",
        "video_rel_path": "dataset/junction_B/camera_01.mp4",
        "video_url": "/api/cameras/junction_B_camera_01/video",
        "lat": 23.713932,
        "lng": 86.952211,
    },
    "junction_B_camera_02": {
        "id": "junction_B_camera_02",
        "camera_id": "junction_B_camera_02",
        "name": "Camera 02",
        "camera_name": "Camera 02",
        "junction_id": "junction_B",
        "junction_name": "Kanyapur Link Road",
        "scene": "Kanyapur Link Road",
        "video_path": "dataset/junction_B/camera_02.mp4",
        "video_rel_path": "dataset/junction_B/camera_02.mp4",
        "video_url": "/api/cameras/junction_B_camera_02/video",
        "lat": 23.713929,
        "lng": 86.952144,
    },
}


def get_cameras_config() -> Dict[str, Dict[str, Any]]:
    """Return dictionary of cameras with absolute paths resolved."""
    if CAMERAS_JSON.exists():
        try:
            with open(CAMERAS_JSON, "r", encoding="utf-8") as f:
                raw_list = json.load(f)
                result = {}
                for item in raw_list:
                    cid = item["camera_id"]
                    vpath = PROJECT_ROOT / item.get("video_path", "")
                    entry = dict(item)
                    entry["id"] = cid
                    entry["name"] = item.get("camera_name", cid)
                    entry["scene"] = item.get("junction_name", item.get("junction_id", "Junction A"))
                    entry["video_rel_path"] = item.get("video_path", "")
                    entry["video_url"] = f"/api/cameras/{cid}/video"
                    entry["video_exists"] = vpath.exists() and vpath.stat().st_size > 0
                    result[cid] = entry
                return result
        except Exception as e:
            print(f"[camera_config] Error loading cameras.json: {e}")

    # Fallback to default
    result = {}
    for cid, cfg in DEFAULT_CAMERAS_CONFIG.items():
        vpath = PROJECT_ROOT / cfg["video_path"]
        entry = dict(cfg)
        entry["video_exists"] = vpath.exists() and vpath.stat().st_size > 0
        result[cid] = entry
    return result


CAMERAS = get_cameras_config()


def get_camera_info(camera_id: str) -> Optional[Dict[str, Any]]:
    """Return info for a single camera."""
    cameras = get_cameras_config()
    return cameras.get(camera_id)
