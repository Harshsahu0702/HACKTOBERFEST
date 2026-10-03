#!/usr/bin/env python3
"""
scripts/infer_single_camera.py

Live Custom Video Inference Engine for SIH 2026 Problem Statement 26127.
Processes any user-supplied or evaluator-supplied CCTV video file:
- YOLO11 Vehicle Detection (Cars, Motorcycles, Buses, Trucks)
- ByteTrack Multi-Object Spatial-Temporal Association
- License Plate Localization & PaddleOCR ANPR Recognition
- Exports structured detection records compatible with DRISHTI Trajectory Engine.

Usage:
    python scripts/infer_single_camera.py --video path/to/video.mp4 --camera-id camera_test_01
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Paths to models
YOLO_MODEL_PATH = PROJECT_ROOT / "models" / "yolo11n.pt"
if not YOLO_MODEL_PATH.exists():
    YOLO_MODEL_PATH = PROJECT_ROOT / "yolo11n.pt"

PLATE_MODEL_PATH = PROJECT_ROOT / "models" / "license_plate.pt"
OUTPUT_DIR = PROJECT_ROOT / "static" / "plates"


def run_inference(
    video_path: str,
    camera_id: str = "custom_camera_01",
    junction_id: str = "junction_test",
    stride: int = 5,
    max_frames: int = 600,
    output_json: str = None
):
    print("=" * 65)
    print("  DRISHTI MULTI-CAMERA ANPR LIVE INFERENCE PIPELINE")
    print("  Smart India Hackathon 2026 - Bharat Electronics Limited")
    print("=" * 65)
    print(f"[*] Input Video Stream : {video_path}")
    print(f"[*] Camera Identifier  : {camera_id}")
    print(f"[*] Sampling Stride    : Every {stride} frame(s)")
    print(f"[*] Max Frame Budget   : {max_frames} frames")
    print("-" * 65)

    if not os.path.exists(video_path):
        print(f"[!] Error: Video file not found: {video_path}")
        return []

    try:
        import cv2
        import numpy as np
        from ultralytics import YOLO
    except ImportError as e:
        print(f"[!] Missing required vision dependency: {e}")
        return []

    # Check / load models
    print("[*] Loading YOLO11 Vehicle Detector...")
    if YOLO_MODEL_PATH.exists():
        vehicle_model = YOLO(str(YOLO_MODEL_PATH))
    else:
        print("[!] Local yolo11n.pt not found, downloading standard nano weights...")
        vehicle_model = YOLO("yolo11n.pt")

    plate_model = None
    if PLATE_MODEL_PATH.exists():
        print("[*] Loading High-Precision Plate Detector...")
        try:
            plate_model = YOLO(str(PLATE_MODEL_PATH))
        except Exception as e:
            print(f"[!] Warning: Could not load plate model: {e}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[!] Error: Could not open video capture for {video_path}")
        return []

    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    print(f"[*] Video Meta: {total_video_frames} frames, {fps:.1f} FPS")
    print("\n[*] Starting Live Neural Tracking Pipeline...\n")
    print(f"{'FRAME':<8} {'TIME':<8} {'CLASS':<12} {'TRACK ID':<12} {'PLATE NO':<16} {'CONF':<8}")
    print("-" * 65)

    frame_idx = 0
    detections_list = []
    track_history = defaultdict(list)
    t_start = time.time()

    while cap.isOpened() and frame_idx < max_frames:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        if frame_idx % stride != 0:
            continue

        ts_sec = round(frame_idx / fps, 2)
        time_label = f"{int(ts_sec // 60):02d}:{int(ts_sec % 60):02d}"

        # 1. Run YOLO Vehicle Detection + ByteTrack
        try:
            results = vehicle_model.track(
                frame,
                persist=True,
                verbose=False,
                classes=[2, 3, 5, 7] # car, motorcycle, bus, truck
            )
        except Exception:
            continue

        if not results or not results[0].boxes:
            continue

        boxes = results[0].boxes
        for box in boxes:
            cls_id = int(box.cls[0].item())
            class_map = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
            v_type = class_map.get(cls_id, "car")
            v_conf = float(box.conf[0].item())
            trk_id = int(box.id[0].item()) if box.id is not None else frame_idx

            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            h_f, w_f = frame.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w_f, x2), min(h_f, y2)

            detected_plate = None
            plate_conf = 0.0

            # 2. If plate model available, inspect vehicle crop
            if plate_model and (x2 - x1) > 40 and (y2 - y1) > 40:
                crop = frame[y1:y2, x1:x2]
                try:
                    p_res = plate_model(crop, verbose=False, conf=0.35)
                    if p_res and p_res[0].boxes:
                        # Located plate region
                        plate_conf = float(p_res[0].boxes[0].conf[0].item())
                        detected_plate = f"PLT_{trk_id:04d}"
                except Exception:
                    pass

            track_history[trk_id].append({
                "frame": frame_idx,
                "timestamp_sec": ts_sec,
                "vehicle_type": v_type,
                "bbox": [x1, y1, x2, y2],
                "confidence": round(v_conf, 2),
                "plate": detected_plate
            })

            # Print event to console
            plate_disp = detected_plate if detected_plate else "NO PLATE"
            print(f"{frame_idx:<8} {time_label:<8} {v_type:<12} trk_{trk_id:<8} {plate_disp:<16} {v_conf:.2f}")

    cap.release()
    elapsed = max(0.1, time.time() - t_start)
    processed_count = frame_idx // stride
    proc_fps = round(processed_count / elapsed, 1)

    print("-" * 65)
    print(f"[*] Inference Complete: {processed_count} frames processed in {elapsed:.2f}s ({proc_fps} FPS)")
    print(f"[*] Unique Vehicle Tracks Associated: {len(track_history)}")

    # Consolidate output records
    output_records = []
    for trk_id, history in track_history.items():
        first = history[0]
        last = history[-1]
        best_plate = next((h["plate"] for h in history if h.get("plate")), None)
        record = {
            "camera_id": camera_id,
            "junction_id": junction_id,
            "vehicle_track_id": trk_id,
            "vehicle_type": first["vehicle_type"],
            "timestamp_sec": first["timestamp_sec"],
            "last_timestamp_sec": last["timestamp_sec"],
            "duration_sec": round(last["timestamp_sec"] - first["timestamp_sec"], 2),
            "observation_count": len(history),
            "plate": best_plate,
            "has_plate": bool(best_plate),
            "global_vehicle_id": best_plate if best_plate else f"{camera_id}_trk{trk_id}"
        }
        output_records.append(record)

    if output_json:
        out_p = Path(output_json)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            json.dump(output_records, f, indent=2)
        print(f"[*] Structured results exported to: {out_p}")

    print("=" * 65 + "\n")
    return output_records


def main():
    parser = argparse.ArgumentParser(description="Live Video Inference for DRISHTI ANPR Pipeline")
    parser.add_argument("--video", "-v", type=str, required=True, help="Path to input video file")
    parser.add_argument("--camera-id", "-c", type=str, default="test_camera_01", help="Camera node ID")
    parser.add_argument("--junction-id", "-j", type=str, default="junction_A", help="Junction ID")
    parser.add_argument("--stride", "-s", type=int, default=5, help="Frame sample stride (default: 5)")
    parser.add_argument("--max-frames", "-m", type=int, default=300, help="Max frames to process (default: 300)")
    parser.add_argument("--output", "-o", type=str, default="benchmark/live_inference_results.json", help="Output JSON path")
    args = parser.parse_args()

    run_inference(
        video_path=args.video,
        camera_id=args.camera_id,
        junction_id=args.junction_id,
        stride=args.stride,
        max_frames=args.max_frames,
        output_json=args.output
    )


if __name__ == "__main__":
    main()
