# PHASE 1 — REAL DATASET INTEGRATION AUDIT
**SIH 2026 City-Wide AI Traffic Intelligence System**
**Audit Date:** 2026-09-06 | **Status:** DISCOVERY — DO NOT MODIFY CODE

---

## 1. REPOSITORY ARCHITECTURE OVERVIEW

### 1.1 Directory Tree (non-venv)
```
sih/
├── ai/                       # Standalone YOLO test scripts
│   └── test_yolo.py
├── backend/                  # FastAPI application
│   ├── app.py                # Main router (225 lines, 15 endpoints)
│   ├── main.py               # Uvicorn entry point
│   ├── config/
│   │   └── camera_config.py  # Camera registry (2 cameras hardcoded)
│   ├── pipeline/
│   │   ├── sources/
│   │   │   └── video_source.py
│   │   └── test_video.py
│   └── services/
│       ├── analytics_service.py  # City-wide analytics aggregator
│       ├── trajectory_service.py # Vehicle/plate ANPR data service
│       └── video_service.py      # H.264 range-streaming
├── data/                     # ANPR/plate datasets (Hugging Face)
│   ├── indian_number_plates/
│   ├── plate_dataset/
│   └── plate_yolo/           # YOLOv8 format for plate fine-tuning
├── docs/                     # this audit lives here
├── frontend/                 # React + Vite SPA
│   └── src/
│       ├── App.jsx            # Main dashboard (Command Center)
│       ├── App.css            # ~1200 lines, glassmorphism dark theme
│       ├── components/        # Modular React components
│       └── services/          # API client layer
├── models/
│   ├── yolo11n.pt             # YOLO vehicle detector weight
│   └── license_plate.pt       # License plate detector weight
├── runs/                     # All ML pipeline OUTPUT (JSON only)
│   ├── cross_camera/
│   │   ├── camera_01_tracks.json        # 260 KB, Track objects c001
│   │   ├── camera_02_tracks.json        # 367 KB, Track objects c002
│   │   ├── cross_camera_matches.json    # 97 KB
│   │   ├── global_vehicle_paths.json    # 98 KB, 225 vehicle records
│   │   ├── matching_stats.json          # 2.4 KB, pipeline stats
│   │   ├── .c001_cache.json             # 1.8 MB, feature cache c001
│   │   └── .c002_cache.json             # 2.4 MB, feature cache c002
│   ├── detect/
│   │   └── plate_detection/
│   │       ├── plates/                  # Plate crop images
│   │       ├── plate_metadata.json
│   │       └── ocr_results.json
│   └── tracking/
│       ├── vehicle_tracks.json          # 4.4 MB
│       ├── vehicle_plate_matches.json   # 200 KB
│       ├── vehicle_plate_summary.json   # 6.0 KB
│       └── traffic_analytics.json       # 246 bytes (sparse)
├── scripts/                  # All ML pipeline SCRIPTS
│   ├── cross_camera_matching.py  # 1227 lines — core Re-ID pipeline
│   ├── track_vehicles.py
│   ├── detect_plates.py
│   ├── ocr_plates.py / paddle_ocr_plates.py
│   ├── match_plates_to_vehicles.py
│   ├── vehicle_plate_summary.py
│   ├── analytics.py
│   ├── validate_cross_camera.py
│   └── diagnose_matching.py
└── videos/
    ├── camera_01/
    │   ├── vdo.avi  (135 MB, msmpeg4v2)
    │   └── vdo.mp4  (149 MB, H.264 +faststart) <- transcoded
    └── camera_02/
        ├── vdo.avi  (184 MB, msmpeg4v2)
        └── vdo.mp4  (207 MB, H.264 +faststart) <- transcoded
```

---

## 2. FRONTEND ARCHITECTURE

| Layer | Technology | Key Details |
|---|---|---|
| Framework | React 18 + Vite | SPA, no router (single page) |
| Styling | Vanilla CSS | 38 KB, glassmorphism dark theme |
| Maps | Leaflet.js | Hardcoded Kolkata lat/lon |
| Icons | Lucide-React | Via npm |
| API | Fetch (native) | Polling /api/dashboard on load |

### 2.1 API Contract (Frontend to Backend)
```
GET /api/dashboard           -> initial load (cameras + analytics + stats)
GET /api/cameras             -> camera list with video_url
GET /api/cameras/{id}/video  -> HTTP 206 range-streaming MP4
GET /api/vehicles            -> all global vehicle identities (GV001...)
GET /api/vehicles/search?q=  -> ANPR plate or GV-id search
GET /api/vehicles/{gv_id}    -> full dossier for one vehicle
GET /api/analytics           -> city-wide traffic metrics
GET /api/stats               -> pipeline data quality metrics
GET /api/system/health       -> component status (YOLO, Re-ID, OCR...)
GET /api/plates/{image_name} -> plate crop image
```

---

## 3. BACKEND ARCHITECTURE

### 3.1 Service Layer
```
FastAPI (app.py)
├── camera_config.py      -> CAMERAS dict (static, 2 entries)
├── video_service.py      -> MP4 transcode + HTTP 206 streaming
├── trajectory_service.py -> reads runs/cross_camera/*.json
│                           builds GV dossiers, ANPR lookup
└── analytics_service.py  -> aggregates matching_stats, vehicle counts
```

### 3.2 Current Camera Registry (HARDCODED — 2 cameras)
```python
CAMERAS = {
  "camera_01": {
    fps=10.0, offset=0.00,
    lat=22.5726, lon=88.3639,  # Kolkata (fictional)
    video_rel_path="videos/camera_01/vdo.mp4",
    raw_rel_path="videos/camera_01/vdo.avi",
  },
  "camera_02": {
    fps=10.0, offset=1.640,  # matches S01 c002 timestamp 1.640s
    lat=22.5842, lon=88.3751,
    video_rel_path="videos/camera_02/vdo.mp4",
    raw_rel_path="videos/camera_02/vdo.avi",
  }
}
```

CRITICAL: camera_01 = AICity S01/c001, camera_02 = AICity S01/c002.
The current pipeline uses ONLY 2 of the 5 S01 cameras.

---

## 4. ML PIPELINE ARCHITECTURE

### 4.1 End-to-End Data Flow (Current)
```
vdo.avi (S01/c001, S01/c002)
  |
  v  [scripts/cross_camera_matching.py]
YOLO11n Detection
  |  vehicle_classes: [2=car, 3=motorcycle, 5=bus, 7=truck]
  |  conf_threshold: 0.35
  v
ByteTrack (Ultralytics built-in)
  |  min_track_length: 5 frames
  v
VehicleFeatureExtractor (MobileNetV3-Large + Spatial HSV)
  |  max_crops_per_track: 12
  |  Cached to .c001_cache.json / .c002_cache.json
  v
Multi-Cue Cross-Camera Matching
  |  Tiered (Fast / Queued / Extended) Hungarian assignment
  |  Weights: CNN=0.60, Color=0.40
  |  Gate: affinity_threshold=0.76
  v
runs/cross_camera/
  ├── camera_01_tracks.json
  ├── camera_02_tracks.json
  ├── cross_camera_matches.json
  └── global_vehicle_paths.json  (225 GV entries)
```

---

## 5. AICITY DATASET — FULL STRUCTURE AUDIT

### 5.1 Dataset Root Layout (H:\extracted\)
```
H:\extracted\
├── cam_framenum\    S01.txt ... S06.txt   # total frames per camera
├── cam_timestamp\   S01.txt ... S06.txt   # time offset per camera (sec)
├── cam_loc\         S01.png, S02.png, S0345.png, S06.png
├── eval\
│   ├── eval.py                          # AICity official evaluator
│   ├── ground_truth_train.txt           # 2.2 MB
│   ├── ground_truth_validation.txt      # 6.4 MB
│   └── requirements.txt
├── train\           S01, S03, S04
├── validation\      S02, S05
├── test\            S06
└── videos\          camera_01/, camera_02/
```

### 5.2 Scene / Sequence Topology

| Scene | Split | Cameras | Notes |
|---|---|---|---|
| S01 | train | c001-c005 (5 cams) | PRIMARY — currently c001+c002 only |
| S02 | validation | c006-c009 (4 cams) | |
| S03 | train | c010-c015 (6 cams) | |
| S04 | train | c016-c040 (25 cams) | Large scene |
| S05 | validation | c010,c016-c036 subset | Overlaps IDs with S03/S04 |
| S06 | test | c041-c046 (6 cams) | No ground truth |

WARNING: S01/S02/S03/S04/S05 are NOT physically adjacent junctions.
Each scene is a geographically separate filming location.

---

## 6. S01 FIVE-CAMERA DETAILED AUDIT

### 6.1 Camera Metadata Table

| Camera | AICity ID | AVI Size | Frames | Time Offset (s) | Duration (s) |
|---|---|---|---|---|---|
| camera_01 | c001 | 134.6 MB | 1955 | 0.000 | 195.5 |
| camera_02 | c002 | 184.5 MB | 2110 | 1.640 | 212.6 |
| (unmapped) | c003 | 151.2 MB | 1996 | 2.049 | 201.6 |
| (unmapped) | c004 | 143.9 MB | 2110 | 2.177 | 212.7 |
| (unmapped) | c005 |  54.8 MB | 2110 | 2.235 | 212.7 |

NOTE: c001 ends ~15.5 s earlier than c002/c004/c005 (1955 vs 2110 frames at 10 fps).

### 6.2 Synchronization Timeline (wall-clock seconds)
```
c001 |----------------------------------------------| (195.5 s)
c002  |------------------------------------------------| (213.2 s, offset +1.640)
c003   |-----------------------------------------------| (203.6 s, offset +2.049)
c004   |--------------------------------------------------| (213.8 s, offset +2.177)
c005   |--------------------------------------------------| (213.9 s, offset +2.235)
      0   20   40   60   80  100  120  140  160  180  213 (seconds)
```

### 6.3 Per-Camera File Contents

| File/Dir | Description | Format |
|---|---|---|
| vdo.avi | Raw video (msmpeg4v2 codec) | AVI |
| calibration.txt | 3x3 Homography matrix + reprojection error | Plain text |
| roi.jpg | Region of Interest image (~28 KB) | JPEG |
| det/ | 3 pre-computed detection files | MOT CSV |
| gt/ | 1 ground-truth tracking file | MOT CSV |
| mtsc/ | 9 pre-computed MTSC tracking files | MOT CSV |
| segm/ | 1 instance segmentation file | MOT CSV |

### 6.4 Annotation File Formats

#### gt/gt.txt — Ground Truth Tracks
Format: <frame>, <vehicle_id>, <left>, <top>, <width>, <height>, 1, -1, -1, -1
Example: 55,34,1581,346,339,158,1,-1,-1,-1

#### det/det_yolo3.txt — Pre-computed Detections
Format: <frame>, -1, <left>, <top>, <width>, <height>, <conf>, -1, -1, -1
Example: 1,-1,1094.277,257.304,63.898,62.347,0.400,-1,-1,-1
Three detector variants: det_mask_rcnn.txt, det_ssd512.txt, det_yolo3.txt

#### mtsc/ — Pre-computed MTSC Tracks (9 files)
Format: <frame>, <track_id>, <left>, <top>, <width>, <height>, 1, -1, -1, -1
9 variants: 3 trackers (deepsort, moana, tc) x 3 detectors (mask_rcnn, ssd512, yolo3)

#### eval/ground_truth_train.txt — Global Cross-Camera Ground Truth
Format: <camera_int> <vehicle_id> <frame> <left> <top> <width> <height> -1 -1
Example: 1 34 55 1581 346 339 158 -1 -1
(camera integer 1 = c001, 2 = c002, etc.)

### 6.5 Calibration / Homography

Each camera has a 3x3 Homography matrix (pixel -> ground plane):

| Camera | H[0,0] | Reprojection Error |
|---|---|---|
| c001 | -33.39 | 5.50 px |
| c002 | -31.16 | 11.44 px |
| c003 | -42.48 | 11.39 px |
| c004 | -39.29 |  2.91 px |
| c005 | -15.37 |  9.92 px |

RISK: c005 has extra Intrinsic + Distortion parameters (fisheye lens):
  K = [[1280,0,640],[0,1280,480],[0,0,1]]
  D = [-0.6, 0, 0, 0]
c005 requires cv2.undistort() before homography application.
The current pipeline does NOT apply homography at all.

---

## 7. GAP ANALYSIS — CURRENT PIPELINE vs. REAL DATASET

### 7.1 What Currently Works

| Component | Status | Notes |
|---|---|---|
| Video serving | WORKING | c001+c002 MP4 transcoded, HTTP 206 |
| YOLO Detection | WORKING | yolo11n.pt, conf=0.35 |
| ByteTrack Tracking | WORKING | Ultralytics built-in |
| Deep Re-ID Features | WORKING | MobileNetV3 + Spatial HSV |
| Cross-camera matching | WORKING | 2-camera, tiered, LAP solver |
| ANPR (plate detection) | WORKING | Custom license_plate.pt |
| OCR | WORKING | PaddleOCR |
| Global Vehicle ID | WORKING | 225 GV entries (c001+c002) |
| FastAPI REST API | WORKING | All 15 endpoints functional |
| React dashboard | WORKING | Command Center UI complete |
| Feature caching | WORKING | .c001_cache.json, .c002_cache.json |

### 7.2 Missing / Gaps

| Gap | Impact | Severity |
|---|---|---|
| Only 2 of 5 S01 cameras used | Limited cross-camera coverage | HIGH |
| c003, c004, c005 not in CAMERAS dict | No video serving for 3 cameras | HIGH |
| camera_config.py hardcoded for 2 cameras | Needs 5-camera extension | HIGH |
| cross_camera_matching.py hardcoded 2-cam | Must become N-camera-aware | HIGH |
| Pre-computed det/ annotations not used | Pipeline re-detects from scratch | MEDIUM |
| Pre-computed mtsc/ tracks not used | Pipeline re-tracks from scratch | MEDIUM |
| Homography not applied | No ground-plane projection | MEDIUM |
| c005 fisheye undistortion not implemented | Geometry errors if c005 included | MEDIUM |
| Geo-coordinates are fictional | Map shows fictional Kolkata locations | MEDIUM |
| traffic_analytics.json mostly empty | Analytics fallback to hardcoded values | MEDIUM |

### 7.3 Video Path Mismatch

Actual source: H:\extracted\train\S01\c00X\vdo.avi
Currently copied to:
  sih/videos/camera_01/vdo.avi  <- c001 (DONE)
  sih/videos/camera_02/vdo.avi  <- c002 (DONE)
NOT copied: c003, c004, c005 (exist only at H:\extracted\)

---

## 8. INTEGRATION STRATEGY (PROPOSED — REQUIRES APPROVAL)

### Phase 2 — Expand to All 5 S01 Cameras

Step A: Extend camera_config.py with camera_03/04/05 entries using real offsets.
Step B: Copy H:\extracted\train\S01\c00X\vdo.avi -> sih/videos/camera_0X/vdo.avi
Step C: Refactor cross_camera_matching.py main() to accept N cameras via --scene argument.
Step D: Add .c003_cache.json, .c004_cache.json, .c005_cache.json
Step E: Regenerate global_vehicle_paths.json with 5-camera paths.

### Phase 3 — Use Pre-Computed Annotations (Optional Acceleration)

The det/det_yolo3.txt files provide pre-computed detections.
Parsing MOT CSV -> feeding to ByteTrack eliminates YOLO inference -> ~10x faster.

### Phase 4 — Geo-Coordinate Calibration

Apply homography matrices to project bbox centroids to ground plane,
then register to approximate GPS using cam_loc/S01.png overhead map.

---

## 9. MIGRATION RISKS

| Risk | Description | Mitigation |
|---|---|---|
| Storage | Copying c003-c005 AVIs (~350 MB) | Copy once; transcoded MP4 adds ~400 MB |
| Transcoding time | MP4 conversion may block API 5-10 min per camera | Batch-transcode before starting server |
| Cache invalidation | Existing .c001/.c002 caches are valid | New cameras get new cache files |
| Matching script refactor | 1227-line script is complex | Add --scene flag; preserve 2-camera default |
| c005 fisheye lens | Intrinsic + distortion params present | Apply cv2.undistort() before processing c005 |
| Global ID numbering | GV001-GV225 are 2-camera results | Clear runs/cross_camera/ before 5-cam rerun |
| Frontend map coords | Fictional Kolkata lat/lon | Keep as-is for demo; label as Simulated |
| ANPR on 5 cameras | detect_plates.py processes camera_01 only | Loop over all camera videos |

---

## 10. RECOMMENDED NEXT STEPS (PHASE 2 PLAN)

1. Copy videos -> sih/videos/camera_03, camera_04, camera_05 from H:\extracted\train\S01\
2. Extend camera_config.py -> add 3 more entries (preserving existing 2 exactly)
3. Extend cross_camera_matching.py -> add --scene / --cameras argument; make main() loop-driven
4. Run 5-camera pipeline -> generate new global_vehicle_paths.json
5. Extend frontend -> show all 5 camera feeds in the camera grid

---

## 11. FILE REFERENCE TABLE

| File | Role | Safe to Modify? |
|---|---|---|
| backend/config/camera_config.py | Camera registry | YES - extend, do not delete existing |
| backend/app.py | API router | YES - add endpoints if needed |
| backend/services/trajectory_service.py | GV dossier builder | YES - extend file path logic |
| backend/services/analytics_service.py | Analytics aggregator | YES |
| backend/services/video_service.py | MP4 transcoder + range streamer | YES |
| scripts/cross_camera_matching.py | Core Re-ID pipeline | CAREFULLY - backup first |
| scripts/detect_plates.py | ANPR pipeline | YES |
| frontend/src/App.jsx | Main UI | YES |
| runs/cross_camera/*.json | Pipeline outputs | YES - regenerated by scripts |
| H:\extracted\train\S01\c00X\gt\gt.txt | Ground truth | NEVER - read-only reference |
| H:\extracted\train\S01\c00X\det\*.txt | Pre-computed detections | NEVER - read-only reference |
| H:\extracted\eval\eval.py | Official evaluator | NEVER - read-only reference |

---

Audit completed. Awaiting approval before any code changes.
