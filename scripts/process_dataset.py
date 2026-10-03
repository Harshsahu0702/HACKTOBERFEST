#!/usr/bin/env python3
"""
scripts/process_dataset.py

Unified End-to-End AI Pipeline for SIH 2026:
VIDEO -> YOLO DETECTION -> BYTE TRACK -> LICENSE PLATE DETECTION -> PADDLE OCR ->
PLATE NORMALIZATION -> TRACK ASSOCIATION -> TEMPORAL CONSOLIDATION -> detections.json
"""

import os
import sys
import json
import re
import argparse
from pathlib import Path
from collections import defaultdict, Counter

# Ensure torch is imported first to prevent DLL conflicts on Windows
import torch
import cv2
import numpy as np
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Paths
CAMERAS_JSON = PROJECT_ROOT / "dataset" / "metadata" / "cameras.json"
DETECTIONS_JSON = PROJECT_ROOT / "dataset" / "metadata" / "detections.json"
YOLO_MODEL_PATH = PROJECT_ROOT / "models" / "yolo11n.pt"
if not YOLO_MODEL_PATH.exists():
    YOLO_MODEL_PATH = PROJECT_ROOT / "yolo11n.pt"
PLATE_MODEL_PATH = PROJECT_ROOT / "models" / "license_plate.pt"
PLATES_OUTPUT_DIR = PROJECT_ROOT / "static" / "plates"

# Vehicle classes in COCO (car: 2, motorcycle: 3, bus: 5, truck: 7)
VEHICLE_CLASSES = [2, 3, 5, 7]
CLASS_NAMES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

# Indian state codes for normalization
INDIAN_STATES = {
    "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA",
    "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH",
    "ML", "MN", "MP", "MZ", "NL", "OD", "PB", "PY", "RJ", "SK",
    "TN", "TR", "TS", "UK", "UP", "WB"
}

DIGIT_TO_LETTER = {'0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B'}
LETTER_TO_DIGIT = {'O': '0', 'I': '1', 'Z': '2', 'S': '5', 'B': '8', 'Q': '0', 'D': '0'}


def normalize_plate(raw_text: str) -> tuple[str, str]:
    """
    Cleans raw OCR output and normalizes standard Indian plate formats.
    Returns (normalized_plate, raw_plate).
    """
    raw = str(raw_text).strip()
    clean = re.sub(r"[^A-Za-z0-9]", "", raw).upper()

    if not clean:
        return "", raw

    # If it already looks like a valid Indian plate format (e.g. UP32AB1234)
    # State(2) + District(2) + Series(1-3) + Number(1-4)
    if 7 <= len(clean) <= 11:
        chars = list(clean)
        # First 2 chars should be state letters
        for i in range(min(2, len(chars))):
            if chars[i] in DIGIT_TO_LETTER:
                chars[i] = DIGIT_TO_LETTER[chars[i]]

        # Next 2 chars should be digits
        for i in range(2, min(4, len(chars))):
            if chars[i] in LETTER_TO_DIGIT:
                chars[i] = LETTER_TO_DIGIT[chars[i]]

        # Last 4 chars should be digits
        for i in range(max(4, len(chars) - 4), len(chars)):
            if chars[i] in LETTER_TO_DIGIT:
                chars[i] = LETTER_TO_DIGIT[chars[i]]

        normalized = "".join(chars)
        return normalized, raw

    return clean, raw


def bbox_center(bbox):
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def point_in_bbox(point, bbox):
    px, py = point
    x1, y1, x2, y2 = bbox
    return x1 <= px <= x2 and y1 <= py <= y2


def bbox_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

    if boxAArea + boxBArea - interArea == 0:
        return 0.0
    return interArea / float(boxAArea + boxBArea - interArea)


def init_ocr():
    """Initialize PaddleX text recognition predictor directly."""
    print("[AI Pipeline] Initializing PaddleOCR text recognition...")
    try:
        from paddlex import create_predictor
        rec_model = create_predictor(model_name="PP-OCRv6_medium_rec")
        print("[AI Pipeline] PaddleOCR recognition model ready.")
        return rec_model
    except Exception as e:
        print(f"[AI Pipeline][WARNING] Failed to load PP-OCRv6_medium_rec: {e}")
        try:
            from paddleocr import PaddleOCR
            return PaddleOCR(lang="en", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
        except Exception as e2:
            print(f"[AI Pipeline][ERROR] Could not initialize any OCR engine: {e2}")
            return None


def run_ocr(rec_model, crop_img) -> tuple[str, float]:
    """Run OCR on cropped plate image, returning (text, confidence)."""
    if rec_model is None or crop_img is None or crop_img.size == 0:
        return "", 0.0

    try:
        preds = list(rec_model(crop_img))
        if preds and len(preds) > 0:
            p = preds[0]
            text = p.get("rec_text")
            if text is None:
                texts = p.get("rec_texts", [])
                text = texts[0] if texts else ""
            conf = float(p.get("rec_score", 0.0))
            return str(text).strip(), conf
    except Exception as e:
        pass
    return "", 0.0


def validate_videos(cameras: list[dict]) -> bool:
    """Validate all 4 video files as required in Phase 2."""
    print("=" * 60)
    print("PHASE 2: VIDEO VALIDATION")
    print("=" * 60)

    all_valid = True
    for cam in cameras:
        cam_id = cam["camera_id"]
        rel_path = cam["video_path"]
        abs_path = PROJECT_ROOT / rel_path

        if not abs_path.exists():
            print(f"[FAIL] {cam_id}: File does not exist at {abs_path}")
            all_valid = False
            continue

        size = abs_path.stat().st_size
        if size <= 0:
            print(f"[FAIL] {cam_id}: File is empty (0 bytes) at {abs_path}")
            all_valid = False
            continue

        cap = cv2.VideoCapture(str(abs_path))
        if not cap.isOpened():
            print(f"[FAIL] {cam_id}: OpenCV could not open video {abs_path}")
            all_valid = False
            continue

        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if fps > 0 else 0

        ret, test_frame = cap.read()
        cap.release()

        if not ret or test_frame is None:
            print(f"[FAIL] {cam_id}: OpenCV opened file but could not read first frame.")
            all_valid = False
            continue

        print(f"[OK] {cam_id}: {size / (1024*1024):.1f} MB | {frame_count} frames | {fps:.2f} FPS | {width}x{height} | {duration:.2f}s")

    return all_valid


def process_camera_video(
    cam: dict,
    vehicle_model: YOLO,
    plate_model: YOLO,
    rec_model,
    stride: int = 5,
    max_frames: int = None,
    output_dir: Path = PLATES_OUTPUT_DIR
) -> list[dict]:
    """
    Process a single camera video:
    YOLO track -> License Plate detect -> OCR -> Associate -> Consolidate
    """
    cam_id = cam["camera_id"]
    junction_id = cam["junction_id"]
    camera_name = cam.get("camera_name", cam_id)
    video_path = PROJECT_ROOT / cam["video_path"]

    print(f"\n---> Processing camera: {cam_id} ({video_path.name}) [stride={stride}]...")
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if max_frames and max_frames > 0:
        total_frames = min(total_frames, max_frames)

    # Per-track data aggregation
    # track_id -> {
    #   'vehicle_type': str,
    #   'frames': list[int],
    #   'timestamps': list[float],
    #   'plates': list[dict] # {normalized, raw, ocr_conf, plate_conf, crop_path}
    # }
    track_records = defaultdict(lambda: {
        "vehicle_type": "car",
        "frames": [],
        "timestamps": [],
        "plates": []
    })

    frame_idx = 0
    plate_counter = 0

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        if max_frames and frame_idx >= max_frames:
            break

        current_frame = frame_idx
        frame_idx += 1

        # Apply stride
        if current_frame % stride != 0:
            continue

        timestamp_sec = round(current_frame / fps, 2)
        h, w = frame.shape[:2]

        # Scale down 4K frame to 1080p for 4x faster CPU inference while preserving aspect ratio
        orig_h, orig_w = frame.shape[:2]
        scale = 1.0
        proc_frame = frame
        if orig_w > 1920:
            scale = 1920.0 / orig_w
            proc_w = 1920
            proc_h = int(orig_h * scale)
            proc_frame = cv2.resize(frame, (proc_w, proc_h), interpolation=cv2.INTER_AREA)

        # 1. Vehicle Detection & Tracking
        # Use ByteTrack
        track_results = vehicle_model.track(
            source=proc_frame,
            tracker="bytetrack.yaml",
            classes=VEHICLE_CLASSES,
            conf=0.30,
            persist=True,
            verbose=False
        )

        active_vehicles = [] # list of (track_id, cls_name, [vx1, vy1, vx2, vy2])
        if track_results and track_results[0].boxes is not None and track_results[0].boxes.id is not None:
            res = track_results[0]
            boxes = res.boxes.xyxy.cpu().tolist()
            ids = res.boxes.id.int().cpu().tolist()
            classes = res.boxes.cls.int().cpu().tolist()

            for box, track_id, cls_id in zip(boxes, ids, classes):
                vtype = CLASS_NAMES.get(cls_id, "car")
                # Rescale boxes back to original coordinates if scaled
                if scale != 1.0:
                    vx1 = int(box[0] / scale)
                    vy1 = int(box[1] / scale)
                    vx2 = int(box[2] / scale)
                    vy2 = int(box[3] / scale)
                else:
                    vx1, vy1, vx2, vy2 = map(int, box)

                active_vehicles.append((track_id, vtype, [vx1, vy1, vx2, vy2]))

                track_records[track_id]["vehicle_type"] = vtype
                track_records[track_id]["frames"].append(current_frame)
                track_records[track_id]["timestamps"].append(timestamp_sec)

        # 2. License Plate Detection
        # Detect plates on frame if active vehicles exist
        if active_vehicles:
            plate_results = plate_model(proc_frame, conf=0.25, verbose=False)
            if plate_results and plate_results[0].boxes is not None and len(plate_results[0].boxes) > 0:
                p_res = plate_results[0]
                p_boxes = p_res.boxes.xyxy.cpu().tolist()
                p_confs = p_res.boxes.conf.cpu().tolist()

                for p_box, p_conf in zip(p_boxes, p_confs):
                    if scale != 1.0:
                        px1 = int(p_box[0] / scale)
                        py1 = int(p_box[1] / scale)
                        px2 = int(p_box[2] / scale)
                        py2 = int(p_box[3] / scale)
                    else:
                        px1, py1, px2, py2 = map(int, p_box)

                    p_w = px2 - px1
                    p_h = py2 - py1
                    if p_w < 10 or p_h < 6:
                        continue

                    p_center = bbox_center([px1, py1, px2, py2])

                    # 3. Associate Plate with Nearest/Containing Vehicle Track
                    best_track_id = None
                    min_dist = float("inf")

                    for track_id, vtype, vbox in active_vehicles:
                        vx1, vy1, vx2, vy2 = vbox
                        # Check spatial containment
                        if point_in_bbox(p_center, vbox):
                            v_center = bbox_center(vbox)
                            dist = ((p_center[0] - v_center[0])**2 + (p_center[1] - v_center[1])**2)**0.5
                            if dist < min_dist:
                                min_dist = dist
                                best_track_id = track_id

                    # If center is not strictly inside, check overlap
                    if best_track_id is None:
                        for track_id, vtype, vbox in active_vehicles:
                            if bbox_iou([px1, py1, px2, py2], vbox) > 0.05:
                                best_track_id = track_id
                                break

                    if best_track_id is not None:
                        # 4. Crop plate from original high-res frame and run OCR
                        pad_x = int(p_w * 0.08)
                        pad_y = int(p_h * 0.08)
                        cx1 = max(0, px1 - pad_x)
                        cy1 = max(0, py1 - pad_y)
                        cx2 = min(orig_w, px2 + pad_x)
                        cy2 = min(orig_h, py2 + pad_y)

                        plate_crop = frame[cy1:cy2, cx1:cx2]
                        if plate_crop.size > 0:
                            raw_ocr_text, ocr_conf = run_ocr(rec_model, plate_crop)
                            norm_plate, raw_plate = normalize_plate(raw_ocr_text)

                            if norm_plate and len(norm_plate) >= 4:
                                plate_counter += 1
                                crop_filename = f"{cam_id}_trk{best_track_id}_f{current_frame}_{plate_counter:04d}.jpg"
                                crop_rel_path = f"static/plates/{crop_filename}"
                                crop_abs_path = output_dir / crop_filename
                                cv2.imwrite(str(crop_abs_path), plate_crop)

                                track_records[best_track_id]["plates"].append({
                                    "normalized": norm_plate,
                                    "raw": raw_plate,
                                    "ocr_confidence": ocr_conf,
                                    "plate_confidence": float(p_conf),
                                    "crop_path": crop_rel_path,
                                    "frame": current_frame,
                                    "timestamp_sec": timestamp_sec
                                })

        if current_frame % (stride * 20) == 0:
            pct = (current_frame / total_frames) * 100 if total_frames > 0 else 0
            print(f"  [{cam_id}] Frame {current_frame}/{total_frames} ({pct:.1f}%) | Active tracks: {len(track_records)} | Plate crops: {plate_counter}", flush=True)

    cap.release()
    print(f"  Finished {cam_id}: {len(track_records)} vehicle tracks, {plate_counter} plate observations.", flush=True)

    # 5. Temporal Aggregation / Event Consolidation
    # For each vehicle track, aggregate plate observations
    consolidated_events = []

    for track_id, data in track_records.items():
        if not data["frames"]:
            continue

        first_frame = min(data["frames"])
        last_frame = max(data["frames"])
        first_time = min(data["timestamps"])
        last_time = max(data["timestamps"])
        duration = round(last_time - first_time, 2)
        vtype = data["vehicle_type"]

        # Did this track have any plate observations?
        plates = data["plates"]
        if plates:
            # Group by normalized plate and pick the most frequent / highest confidence plate
            plate_counts = Counter(p["normalized"] for p in plates)
            best_norm_plate, _ = plate_counts.most_common(1)[0]

            # Filter observations matching the winning plate
            matching_obs = [p for p in plates if p["normalized"] == best_norm_plate]
            if not matching_obs:
                matching_obs = plates

            best_obs = max(matching_obs, key=lambda x: (x["ocr_confidence"] * 0.6 + x["plate_confidence"] * 0.4))
            avg_ocr_conf = round(sum(p["ocr_confidence"] for p in matching_obs) / len(matching_obs), 4)
            avg_plate_conf = round(sum(p["plate_confidence"] for p in matching_obs) / len(matching_obs), 4)

            event = {
                "junction_id": junction_id,
                "camera_id": cam_id,
                "camera_name": camera_name,
                "vehicle_track_id": track_id,
                "vehicle_type": vtype,
                "plate": best_norm_plate,
                "raw_plate": best_obs["raw"],
                "first_frame": first_frame,
                "last_frame": last_frame,
                "timestamp_sec": first_time,
                "last_timestamp_sec": last_time,
                "duration_sec": duration,
                "ocr_confidence": avg_ocr_conf,
                "plate_confidence": avg_plate_conf,
                "plate_image": best_obs["crop_path"]
            }
            consolidated_events.append(event)
        else:
            # Track detected without clear plate reading
            # We record vehicle presence
            event = {
                "junction_id": junction_id,
                "camera_id": cam_id,
                "camera_name": camera_name,
                "vehicle_track_id": track_id,
                "vehicle_type": vtype,
                "plate": None,
                "raw_plate": None,
                "first_frame": first_frame,
                "last_frame": last_frame,
                "timestamp_sec": first_time,
                "last_timestamp_sec": last_time,
                "duration_sec": duration,
                "ocr_confidence": 0.0,
                "plate_confidence": 0.0,
                "plate_image": None
            }
            consolidated_events.append(event)

    return consolidated_events


def main():
    parser = argparse.ArgumentParser(description="Process 4-camera dataset end-to-end")
    parser.add_argument("--stride", type=int, default=5, help="Frame stride (default: 5)")
    parser.add_argument("--max-frames", type=int, default=None, help="Max frames per video (for quick testing)")
    args = parser.parse_args()

    print("=" * 60)
    print("SIH 2026: TRAFFIC INTELLIGENCE DATASET PIPELINE")
    print("=" * 60)

    # 1. Load cameras
    if not CAMERAS_JSON.exists():
        print(f"[ERROR] cameras.json not found at {CAMERAS_JSON}")
        sys.exit(1)

    with open(CAMERAS_JSON, "r", encoding="utf-8") as f:
        cameras = json.load(f)

    print(f"Loaded {len(cameras)} cameras from metadata/cameras.json")

    # 2. Phase 2: Video Validation
    if not validate_videos(cameras):
        print("\n[ERROR] Video validation failed! Please fix broken/missing videos before proceeding.")
        sys.exit(1)
    print("\nAll 4 videos validated successfully!")

    # 3. Create output directory for plate crops
    PLATES_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 4. Load AI Models
    print("\n[AI Pipeline] Loading YOLO vehicle detection model...")
    vehicle_model = YOLO(str(YOLO_MODEL_PATH))

    print("[AI Pipeline] Loading YOLO license plate detection model...")
    plate_model = YOLO(str(PLATE_MODEL_PATH))

    rec_model = init_ocr()

    # 5. Process all 4 cameras
    all_detections = []
    det_counter = 1

    for cam in cameras:
        events = process_camera_video(
            cam=cam,
            vehicle_model=vehicle_model,
            plate_model=plate_model,
            rec_model=rec_model,
            stride=args.stride,
            max_frames=args.max_frames,
            output_dir=PLATES_OUTPUT_DIR
        )

        for ev in events:
            ev["detection_id"] = f"DET_{det_counter:06d}"
            det_counter += 1
            all_detections.append(ev)

    # 6. Save detections.json
    DETECTIONS_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(DETECTIONS_JSON, "w", encoding="utf-8") as f:
        json.dump(all_detections, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    print("DATASET PROCESSING SUMMARY")
    print("=" * 60)
    print(f"Detections JSON saved to: {DETECTIONS_JSON}")
    print(f"Total detection records: {len(all_detections)}")

    plate_records = [d for d in all_detections if d.get("plate")]
    unique_plates = sorted(list(set(d["plate"] for d in plate_records)))
    print(f"Total plate detections: {len(plate_records)}")
    print(f"Unique plates: {len(unique_plates)}")

    # Multi-camera and multi-junction analysis
    plate_cams = defaultdict(set)
    plate_juncs = defaultdict(set)
    for d in plate_records:
        plate_cams[d["plate"]].add(d["camera_id"])
        plate_juncs[d["plate"]].add(d["junction_id"])

    multi_cam = [p for p, cams in plate_cams.items() if len(cams) > 1]
    multi_junc = [p for p, juncs in plate_juncs.items() if len(juncs) > 1]

    print(f"Plates seen across multiple cameras: {len(multi_cam)}")
    print(f"Plates seen across multiple junctions: {len(multi_junc)}")
    if unique_plates:
        print(f"Sample plates: {unique_plates[:10]}")


if __name__ == "__main__":
    main()
