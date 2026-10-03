"""
scripts/fix_plate_timestamps.py

Fixes plate detection timestamps in dataset/metadata/detections.json and evaluation/ground_truth.csv.
Previously, timestamp_sec was set to first_frame / fps (when the vehicle was a tiny speck entering
the distance 8-10 seconds earlier).
This script updates timestamp_sec to the exact frame where the license plate crop was taken and read,
ensuring that evidence playback starts right before the plate sighting and auto-pauses directly
on the target vehicle and plate.
"""

import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DETECTIONS_FILE = PROJECT_ROOT / "dataset" / "metadata" / "detections.json"
GROUND_TRUTH_FILE = PROJECT_ROOT / "evaluation" / "ground_truth.csv"
CACHE_DIR = PROJECT_ROOT / "static" / "cache" / "evidence"

FPS_MAP = {
    "junction_A_camera_01": 29.719967637282878,
    "junction_A_camera_02": 58.811999224527874,
    "junction_B_camera_01": 60.01587648876893,
    "junction_B_camera_02": 30.00004199409834
}

def format_mmss(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"

def fix_timestamps():
    print(f"Loading {DETECTIONS_FILE}...")
    with open(DETECTIONS_FILE, "r", encoding="utf-8") as f:
        detections = json.load(f)

    updated_count = 0
    det_to_new_time = {}

    for d in detections:
        plate = d.get("plate")
        img = d.get("plate_image")
        if plate and img:
            m = re.search(r"_f(\d+)_", img)
            if m:
                f_num = int(m.group(1))
                cam = d.get("camera_id")
                fps = FPS_MAP.get(cam, 30.0)
                crop_timestamp_sec = round(f_num / fps, 2)

                old_ts = d.get("timestamp_sec", 0.0)
                # Keep original track entry time as track_first_timestamp_sec
                if "track_first_timestamp_sec" not in d:
                    d["track_first_timestamp_sec"] = old_ts

                d["timestamp_sec"] = crop_timestamp_sec
                d["frame_number"] = f_num

                det_id = d.get("detection_id")
                if det_id:
                    det_to_new_time[det_id] = crop_timestamp_sec

                updated_count += 1
                if plate == "JH10CS2095":
                    print(f"  [JH10CS2095] {cam} ({det_id}):")
                    print(f"    Old ts: {old_ts:.2f}s ({format_mmss(old_ts)}) -> New ts: {crop_timestamp_sec:.2f}s ({format_mmss(crop_timestamp_sec)}) [Frame {f_num}]")

    print(f"\nUpdated {updated_count} plate detection timestamps in memory.")

    # Save detections.json
    with open(DETECTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(detections, f, indent=2)
    print(f"Saved {DETECTIONS_FILE}.")

    # Update ground_truth.csv if exists
    if GROUND_TRUTH_FILE.exists():
        lines = []
        gt_updated = 0
        with open(GROUND_TRUTH_FILE, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split(",")
                if len(parts) >= 5:
                    det_id = parts[0]
                    if det_id in det_to_new_time:
                        parts[4] = str(det_to_new_time[det_id])
                        gt_updated += 1
                    lines.append(",".join(parts) + "\n")
                else:
                    lines.append(line)

        with open(GROUND_TRUTH_FILE, "w", encoding="utf-8") as f:
            f.writelines(lines)
        print(f"Updated {gt_updated} rows in {GROUND_TRUTH_FILE}.")

    # Clear old cached evidence clips so they will be regenerated with accurate timestamps
    if CACHE_DIR.exists():
        deleted = 0
        for clip in CACHE_DIR.glob("*.mp4"):
            try:
                clip.unlink()
                deleted += 1
            except Exception as e:
                print(f"Could not delete {clip}: {e}")
        print(f"Cleared {deleted} cached evidence clips from {CACHE_DIR}.")

if __name__ == "__main__":
    fix_timestamps()
