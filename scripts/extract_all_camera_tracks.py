import cv2
import json
import os
import sys
from ultralytics import YOLO

print("Loading YOLO11n...", flush=True)
model = YOLO("models/yolo11n.pt")

CAMERAS = [
    {
        "cam_id": "junction_A_camera_02",
        "clip": "static/cache/evidence/junction_A_camera_02_t197_pr5_d15.mp4",
        "output": "frontend/src/assets/camera02_yolo_detections.json",
        "target_filter": {"road_x_min": 25.0, "road_x_max": 75.0} # Car travels down center-right of road
    },
    {
        "cam_id": "junction_B_camera_01",
        "clip": "static/cache/evidence/junction_B_camera_01_t225_pr5_d15.mp4",
        "output": "frontend/src/assets/camera03_yolo_detections.json",
        "target_filter": {}
    },
    {
        "cam_id": "junction_B_camera_02",
        "clip": "static/cache/evidence/junction_B_camera_02_t230_pr5_d15.mp4",
        "output": "frontend/src/assets/camera04_yolo_detections.json",
        "target_filter": {}
    }
]

for cam in CAMERAS:
    clip_path = cam["clip"]
    out_path = cam["output"]
    cam_id = cam["cam_id"]
    if not os.path.exists(clip_path):
        print(f"Clip not found: {clip_path}", flush=True)
        continue

    print(f"\n--- Processing {cam_id} from {clip_path} ---", flush=True)
    cap = cv2.VideoCapture(clip_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    dur = total_frames / fps
    print(f"Video {total_frames} frames, {fps:.1f} fps, duration {dur:.2f}s", flush=True)

    # Sample every 0.1s
    step = max(1, int(round(fps * 0.1)))
    frame_idx = 0
    sampled_detections = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % step == 0:
            rel_t = round(frame_idx / fps, 2)
            # Resize if 4K for fast CPU inference
            h, w = frame.shape[:2]
            inf_frame = frame
            if w > 1920:
                inf_frame = cv2.resize(frame, (1280, 720))

            results = model.track(inf_frame, persist=True, conf=0.25, verbose=False)[0]
            vehicles = []
            ih, iw = inf_frame.shape[:2]

            for box in results.boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                if cls_name in ["car", "truck", "bus", "motorcycle"]:
                    track_id = int(box.id[0]) if box.id is not None else None
                    conf = round(float(box.conf[0]), 2)
                    xyxy = box.xyxy[0].tolist()

                    pct_x = round((xyxy[0] / iw) * 100, 2)
                    pct_y = round((xyxy[1] / ih) * 100, 2)
                    pct_w = round(((xyxy[2] - xyxy[0]) / iw) * 100, 2)
                    pct_h = round(((xyxy[3] - xyxy[1]) / ih) * 100, 2)

                    vehicles.append({
                        "id": track_id,
                        "cls": cls_name,
                        "conf": conf,
                        "x": pct_x,
                        "y": pct_y,
                        "w": pct_w,
                        "h": pct_h
                    })

            sampled_detections.append({
                "t": rel_t,
                "vehicles": vehicles
            })

            if int(rel_t * 10) % 20 == 0:
                print(f"  t={rel_t:.1f}s: {len(vehicles)} vehicles detected", flush=True)

        frame_idx += 1

    cap.release()

    with open(out_path, "w") as f:
        json.dump(sampled_detections, f, indent=1)
    print(f"Saved {len(sampled_detections)} sampled frames to {out_path}", flush=True)

print("ALL CAMERAS PROCESSED SUCCESSFULLY!", flush=True)
