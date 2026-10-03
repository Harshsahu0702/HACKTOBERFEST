import cv2
import json
from ultralytics import YOLO

print("Loading model...", flush=True)
model = YOLO('models/yolo11n.pt')
clip_path = 'static/cache/evidence/junction_B_camera_02_t230_pr5_d15.mp4'
out_file = 'frontend/src/assets/camera04_yolo_detections.json'

cap = cv2.VideoCapture(clip_path)
fps = cap.get(cv2.CAP_PROP_FPS)
frames_data = []

t = 0.0
while t <= 7.0:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
    ret, frame = cap.read()
    if not ret:
        break
    frame_sm = cv2.resize(frame, (960, 540))
    res = model.track(frame_sm, persist=True, conf=0.25, verbose=False)[0]
    vehicles = []
    for b in res.boxes:
        c = model.names[int(b.cls[0])]
        if c in ['car', 'truck', 'bus']:
            t_id = int(b.id[0]) if b.id is not None else None
            xyxy = b.xyxy[0].tolist()
            px = round((xyxy[0] / 960.0) * 100, 2)
            py = round((xyxy[1] / 540.0) * 100, 2)
            pw = round(((xyxy[2] - xyxy[0]) / 960.0) * 100, 2)
            ph = round(((xyxy[3] - xyxy[1]) / 540.0) * 100, 2)
            vehicles.append({
                'id': t_id,
                'cls': c,
                'conf': round(float(b.conf[0]), 2),
                'x': px, 'y': py, 'w': pw, 'h': ph
            })
    frames_data.append({'t': round(t, 2), 'vehicles': vehicles})
    if int(round(t * 10)) % 10 == 0:
        print(f"  t={t:.1f}s: {len(vehicles)} vehicles", flush=True)
    t += 0.1

cap.release()
with open(out_file, 'w') as f:
    json.dump(frames_data, f, indent=1)
print(f"Saved {out_file}, {len(frames_data)} frames", flush=True)
