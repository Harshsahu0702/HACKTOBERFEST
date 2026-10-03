"""
annotation_loader.py — Load precomputed MTSC/detection annotations from the
CityFlowV2 dataset instead of running YOLO+ByteTrack from scratch.

Format (MOTChallenge):
    frame_id, track_id, left, top, width, height, conf_or_1, -1, -1, -1

This replaces the expensive YOLO+ByteTrack step.  ReID feature extraction
still runs separately on video crops keyed by (camera_id, track_id).

Supported annotation types:
  - det/det_yolo3.txt          (detections, track_id == -1)
  - mtsc/mtsc_deepsort_yolo3.txt  (tracked, track_id >= 1) ← RECOMMENDED
  - mtsc/mtsc_tc_yolo3.txt
  - gt/gt.txt                  (ground truth, partial – only cross-cam vehicles)
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
import torch.nn as nn
import torchvision.models as models
import torchvision.transforms as transforms

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Vehicle class IDs used by the existing pipeline
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

# Default class assumed when loading MTSC annotations (no class info in file)
DEFAULT_CLASS_ID = 2       # car
DEFAULT_CLASS_NAME = "car"

# Minimum track length to keep a track (frames)
MIN_TRACK_LEN = 5

# Maximum crops per track for ReID embedding
MAX_CROPS_PER_TRACK = 12

# Minimum crop size in pixels
MIN_CROP_W, MIN_CROP_H = 32, 32

# Embedding vector size: MobileNetV3-small output (576) + color hist (96)
EMBEDDING_DIM = 576 + 96


# ---------------------------------------------------------------------------
# MOTChallenge parser
# ---------------------------------------------------------------------------

def parse_motchallenge_file(path: Path) -> Dict[int, List[Dict[str, Any]]]:
    """
    Parse a MOTChallenge-format annotation file.
    Returns {track_id: [{frame, track_id, left, top, width, height, conf}, ...]}
    For detection files track_id is -1 (skipped if filter_tracks=True).
    """
    tracks: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(",")
            if len(parts) < 6:
                continue
            frame_id = int(parts[0])
            track_id = int(parts[1])
            left = float(parts[2])
            top = float(parts[3])
            width = float(parts[4])
            height = float(parts[5])
            conf = float(parts[6]) if len(parts) > 6 and parts[6] not in ("-1", "") else 1.0
            tracks[track_id].append({
                "frame": frame_id,
                "track_id": track_id,
                "left": left,
                "top": top,
                "width": width,
                "height": height,
                "conf": conf,
            })
    return dict(tracks)


# ---------------------------------------------------------------------------
# ReID feature extractor (same as cross_camera_matching.py, standalone copy)
# ---------------------------------------------------------------------------

class _VehicleFeatureExtractor:
    """MobileNetV3-small + spatial HSV color histogram."""

    def __init__(self, device: Optional[str] = None) -> None:
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        backbone = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        backbone.classifier = nn.Identity()
        self.model = backbone.to(self.device).eval()
        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((128, 128)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

    def _color_histogram(self, crop: np.ndarray) -> np.ndarray:
        h, w = crop.shape[:2]
        if h < 6 or w < 6:
            return np.zeros(96, dtype=np.float32)
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        splits = [
            hsv[0:int(h * 0.35), :],
            hsv[int(h * 0.35):int(h * 0.75), :],
            hsv[int(h * 0.75):, :],
        ]
        feats = []
        for part in splits:
            if part.size == 0:
                feats.append(np.zeros(32, dtype=np.float32))
                continue
            hist_h = cv2.calcHist([part], [0], None, [16], [0, 180])
            hist_s = cv2.calcHist([part], [1], None, [8], [0, 256])
            hist_v = cv2.calcHist([part], [2], None, [8], [0, 256])
            part_feat = np.concatenate([hist_h.flatten(), hist_s.flatten(), hist_v.flatten()])
            n = np.linalg.norm(part_feat)
            if n > 1e-6:
                part_feat /= n
            feats.append(part_feat)
        color_feat = np.concatenate(feats)
        n = np.linalg.norm(color_feat)
        if n > 1e-6:
            color_feat /= n
        return color_feat.astype(np.float32)

    @torch.no_grad()
    def extract(self, crop_bgr: np.ndarray) -> np.ndarray:
        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        tensor = self.transform(rgb).unsqueeze(0).to(self.device)
        cnn_feat = self.model(tensor).squeeze(0).cpu().numpy()
        n = np.linalg.norm(cnn_feat)
        if n > 1e-6:
            cnn_feat /= n
        color_feat = self._color_histogram(crop_bgr)
        combined = np.concatenate([cnn_feat, color_feat]).astype(np.float32)
        n2 = np.linalg.norm(combined)
        if n2 > 1e-6:
            combined /= n2
        return combined


# ---------------------------------------------------------------------------
# Main loader — MTSC → stable tracks + ReID embeddings
# ---------------------------------------------------------------------------

def load_mtsc_tracks(
    cam_id: str,
    mtsc_path: Path,
    video_path: Path,
    fps: float,
    time_offset: float,
    cache_file: Optional[Path] = None,
    cache_version: str = "reid_v3_robust",
    force_recompute: bool = False,
    extractor: Optional[_VehicleFeatureExtractor] = None,
    min_track_len: int = MIN_TRACK_LEN,
) -> Tuple[List[Dict[str, Any]], Dict[int, Dict[str, Any]]]:
    """
    Load precomputed MTSC tracks and extract ReID embeddings from video crops.

    Returns:
        (raw_events, stable_tracks)
        raw_events: list of per-frame detection dicts (first 1000 only for cache)
        stable_tracks: {track_id: track_dict} same schema as process_camera_video()
    """
    # --- Cache check ---
    if not force_recompute and cache_file and cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                data = json.load(f)
            if data.get("cache_version") == cache_version:
                tracks = {int(k): v for k, v in data["tracks"].items()}
                events = data.get("events", [])
                print(f"[{cam_id}] Loaded {len(tracks)} tracks from cache: {cache_file}")
                return events, tracks
        except Exception as exc:
            print(f"[{cam_id}] Cache error ({exc}), recomputing.")

    t_start = time.time()
    print(f"[{cam_id}] Loading MTSC annotations from {mtsc_path.name} ...")
    ann = parse_motchallenge_file(mtsc_path)
    t_ann = time.time() - t_start
    print(f"[{cam_id}] Annotation load: {t_ann:.2f}s  ({len(ann)} raw tracks)")

    # Build raw events and per-track aggregates from annotations
    raw_events: List[Dict[str, Any]] = []
    track_agg: Dict[int, Dict[str, Any]] = defaultdict(lambda: {
        "frames": [], "bboxes": [], "confs": [],
        "crop_candidates": [],
    })

    for tid, detections in ann.items():
        if tid == -1:
            continue  # skip raw detections without track ID
        for det in detections:
            frame_no = det["frame"]
            l, t, w, h = det["left"], det["top"], det["width"], det["height"]
            x1, y1 = int(round(l)), int(round(t))
            x2, y2 = int(round(l + w)), int(round(t + h))
            conf = float(det["conf"])
            ts = round(time_offset + frame_no / fps, 3)

            raw_events.append({
                "frame": frame_no,
                "timestamp": ts,
                "vehicle_id": int(tid),
                "class_id": DEFAULT_CLASS_ID,
                "class_name": DEFAULT_CLASS_NAME,
                "confidence": conf,
                "bbox": [x1, y1, x2, y2],
            })
            entry = track_agg[int(tid)]
            entry["frames"].append(frame_no)
            entry["bboxes"].append([x1, y1, x2, y2])
            entry["confs"].append(conf)

    t_agg = time.time() - t_start - t_ann
    print(f"[{cam_id}] Aggregation: {t_agg:.2f}s")

    # --- Open video for crop extraction ---
    if extractor is None:
        extractor = _VehicleFeatureExtractor()

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise IOError(f"Cannot open video: {video_path}")

    vid_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    vid_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Build a frame→list-of-(tid, bbox) index for efficient single-pass reading
    frame_index: Dict[int, List[Tuple[int, List[int]]]] = defaultdict(list)
    for tid, entry in track_agg.items():
        if len(entry["frames"]) < min_track_len:
            continue
        frames = entry["frames"]
        bboxes = entry["bboxes"]
        confs = entry["confs"]
        # Select frames for crop extraction (evenly spaced, up to MAX_CROPS_PER_TRACK)
        n = len(frames)
        step = max(1, n // MAX_CROPS_PER_TRACK)
        for idx in range(0, n, step):
            frame_index[frames[idx]].append((tid, bboxes[idx]))

    # Single video pass
    t_reid_start = time.time()
    frame_no = 0
    crop_store: Dict[int, List[Tuple[float, np.ndarray]]] = defaultdict(list)
    needed_frames = set(frame_index.keys())
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_no in needed_frames:
            for tid, bbox in frame_index[frame_no]:
                x1, y1, x2, y2 = bbox
                x1 = max(0, min(vid_w - 1, x1))
                y1 = max(0, min(vid_h - 1, y1))
                x2 = max(x1 + 1, min(vid_w, x2))
                y2 = max(y1 + 1, min(vid_h, y2))
                bw, bh = x2 - x1, y2 - y1
                if bw >= MIN_CROP_W and bh >= MIN_CROP_H:
                    crop = frame[y1:y2, x1:x2].copy()
                    # Quality score
                    border = min(x1, y1, vid_w - x2, vid_h - y2)
                    ep = 0.5 if border < 10 else 1.0
                    ar = bw / max(1, bh)
                    ap = 1.0 if 0.5 <= ar <= 3.0 else 0.5
                    q = float(track_agg[tid]["confs"][track_agg[tid]["frames"].index(frame_no)]
                               if frame_no in track_agg[tid]["frames"] else 0.5) * np.sqrt(bw * bh) * ep * ap
                    crop_store[tid].append((q, crop))
        frame_no += 1
        if frame_no % 500 == 0:
            print(f"[{cam_id}] Video pass: {frame_no}/{total_frames} frames")
    cap.release()
    t_video = time.time() - t_reid_start
    print(f"[{cam_id}] Video crop pass: {t_video:.2f}s  ({frame_no} frames)")

    # --- Extract embeddings ---
    t_emb_start = time.time()
    stable_tracks: Dict[int, Dict[str, Any]] = {}
    for tid, entry in track_agg.items():
        if len(entry["frames"]) < min_track_len:
            continue
        first_f = min(entry["frames"])
        last_f = max(entry["frames"])
        start_ts = round(time_offset + first_f / fps, 3)
        end_ts = round(time_offset + last_f / fps, 3)

        crops_sorted = sorted(crop_store.get(tid, []), key=lambda x: x[0], reverse=True)
        top_crops = [c for _, c in crops_sorted[:MAX_CROPS_PER_TRACK]]
        if top_crops:
            embeddings = [extractor.extract(c) for c in top_crops]
            track_emb = np.mean(embeddings, axis=0)
            n = np.linalg.norm(track_emb)
            if n > 1e-6:
                track_emb /= n
        else:
            track_emb = np.zeros(EMBEDDING_DIM, dtype=np.float32)

        # Trajectory centroids (pixel space)
        centroids = []
        sample_bboxes = []
        for fr, bbox in zip(entry["frames"], entry["bboxes"]):
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0
            centroids.append([round(cx, 1), round(cy, 1)])
            sample_bboxes.append({"frame": fr, "bbox": bbox})
        step = max(1, len(centroids) // 10)

        stable_tracks[tid] = {
            "camera_id": cam_id,
            "track_id": tid,
            "class_id": DEFAULT_CLASS_ID,
            "class_name": DEFAULT_CLASS_NAME,
            "first_frame": first_f,
            "last_frame": last_f,
            "start_time_sec": start_ts,
            "end_time_sec": end_ts,
            "duration_frames": last_f - first_f + 1,
            "duration_sec": round(end_ts - start_ts, 3),
            "num_detections": len(entry["frames"]),
            "num_crops_sampled": len(top_crops),
            "avg_confidence": round(float(np.mean(entry["confs"])), 3),
            "trajectory_sample": centroids[::step],
            "sample_bboxes": sample_bboxes[::step],
            "embedding": track_emb.tolist(),
            "source": "mtsc_deepsort_yolo3",
        }

    t_emb = time.time() - t_emb_start
    t_total = time.time() - t_start
    print(f"[{cam_id}] Embedding extraction: {t_emb:.2f}s  |  Total: {t_total:.2f}s  |  {len(stable_tracks)} stable tracks")

    # --- Write cache ---
    if cache_file:
        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w") as f:
                json.dump({
                    "cache_version": cache_version,
                    "source": "mtsc_deepsort_yolo3",
                    "tracks": stable_tracks,
                    "events": raw_events[:1000],
                    "timing": {
                        "annotation_load_sec": round(t_ann, 2),
                        "video_crop_pass_sec": round(t_video, 2),
                        "embedding_sec": round(t_emb, 2),
                        "total_sec": round(t_total, 2),
                    },
                }, f)
            print(f"[{cam_id}] Cache written: {cache_file}")
        except Exception as exc:
            print(f"[{cam_id}] Cache write error: {exc}")

    return raw_events, stable_tracks
