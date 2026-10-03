# MySQL Database Migration Plan — SIH 2026 Traffic Intelligence

This document outlines the transition from the file-based prototype (JSON metadata) to a production-grade relational MySQL database architecture for the SIH 2026 City-Wide Visual Intelligence for Vehicle Tracking & Mobility Analysis platform.

---

## 1. Current Architecture vs Target Architecture

### Current Prototype (File-Based Baseline)
```
[4 CCTV Videos (MP4)]
      ↓
[YOLO11 Detection + ByteTrack]
      ↓
[License Plate ANPR + PaddleOCR]
      ↓
[JSON Storage: dataset/metadata/detections.json & cameras.json & watchlist.json]
      ↓
[FastAPI In-Memory Service Layer]
      ↓
[React Command Center UI]
```

**Limitations of File Baseline**:
- Concurrent write contention on JSON files during multi-camera processing.
- Linear scan complexity for vehicle lookups and trajectory queries ($O(N)$).
- Inability to query spatial/temporal ranges with SQL indexes.
- In-memory grouping required on every search.

---

### Target Architecture (Relational MySQL Database)
```
[4 CCTV Videos (MP4) / Future RTSP Streams]
      ↓
[YOLO11 Detection + ByteTrack Multi-Object Tracking]
      ↓
[License Plate ANPR + PaddleOCR]
      ↓
[Normalized Plate Formatter]
      ↓
[MySQL Relational Database: sih_traffic_intelligence]
  ├── junctions & cameras
  ├── vehicle_tracks & plate_detections
  ├── vehicle_observations
  ├── blacklisted_vehicles (User Managed)
  ├── blacklist_events (Triggered Matches)
  ├── alerts (Real-Time Notifications)
  └── processing_runs & system_settings
      ↓
[FastAPI Database Services (SQLAlchemy ORM + Connection Pooling)]
      ↓
[React Command Center UI: Real-Time Alerts, Blacklist Management, Journey Map]
```

**Key Architectural Benefits**:
- Single source of operational truth.
- Indexed queries on `normalized_plate` ($O(\log N)$) and `timestamp_sec`.
- Foreign-key integrity preventing orphaned observation records.
- ACID transactions ensuring atomic blacklist event and alert generation.
- User-controlled blacklist enforcement.

---

## 2. Relational Database Schema (10 Normalized Tables)

### Table 1: `junctions`
Stores physical intersection coordinates and metadata.
- `id` (INT, PK, AUTO_INCREMENT)
- `junction_code` (VARCHAR(64), UNIQUE, NOT NULL) — e.g. `junction_A`, `junction_B`
- `name` (VARCHAR(128), NOT NULL) — e.g. `Junction A`
- `latitude` (DECIMAL(10, 7), NOT NULL) — e.g. `23.710299`
- `longitude` (DECIMAL(10, 7), NOT NULL) — e.g. `86.952779`
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)

### Table 2: `cameras`
Stores surveillance camera node configurations, locations, and stream references.
- `id` (INT, PK, AUTO_INCREMENT)
- `camera_code` (VARCHAR(64), UNIQUE, NOT NULL) — e.g. `junction_A_camera_01`
- `camera_name` (VARCHAR(128), NOT NULL) — e.g. `Camera 01`
- `junction_id` (INT, FK -> junctions.id, NOT NULL)
- `video_path` (VARCHAR(255), NOT NULL)
- `latitude` (DECIMAL(10, 7), NOT NULL)
- `longitude` (DECIMAL(10, 7), NOT NULL)
- `status` (VARCHAR(32), DEFAULT 'ACTIVE')
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)

### Table 3: `vehicle_tracks`
Stores ByteTrack vehicle track sequences per camera.
- `id` (INT, PK, AUTO_INCREMENT)
- `camera_id` (INT, FK -> cameras.id, NOT NULL)
- `track_id` (INT, NOT NULL)
- `vehicle_type` (VARCHAR(32), DEFAULT 'car')
- `first_frame` (INT, DEFAULT 0)
- `last_frame` (INT, DEFAULT 0)
- `first_timestamp` (DECIMAL(8, 2), NOT NULL)
- `last_timestamp` (DECIMAL(8, 2), NOT NULL)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- *INDEX*: `(camera_id, track_id)`

### Table 4: `plate_detections`
Stores OCR plate recognition readings linked to vehicle tracks.
- `id` (INT, PK, AUTO_INCREMENT)
- `vehicle_track_id` (INT, FK -> vehicle_tracks.id, NULLABLE)
- `camera_id` (INT, FK -> cameras.id, NOT NULL)
- `detection_code` (VARCHAR(64), NULLABLE) — e.g. `DET_000382`
- `plate_text` (VARCHAR(32), NULLABLE) — raw string e.g. `WB 37 E 1275`
- `normalized_plate` (VARCHAR(32), NULLABLE, INDEXED) — e.g. `WB37E1275`
- `ocr_confidence` (DECIMAL(5, 4), DEFAULT 0.0)
- `plate_detection_confidence` (DECIMAL(5, 4), DEFAULT 0.0)
- `timestamp_sec` (DECIMAL(8, 2), NOT NULL, INDEXED)
- `frame_number` (INT, DEFAULT 0)
- `plate_image` (VARCHAR(255), NULLABLE)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

### Table 5: `vehicle_observations`
Normalized spatial-temporal events used for trajectory mapping and speed calculation.
- `id` (INT, PK, AUTO_INCREMENT)
- `plate_detection_id` (INT, FK -> plate_detections.id, NOT NULL)
- `camera_id` (INT, FK -> cameras.id, NOT NULL)
- `junction_id` (INT, FK -> junctions.id, NOT NULL, INDEXED)
- `timestamp_sec` (DECIMAL(8, 2), NOT NULL)
- `latitude` (DECIMAL(10, 7), NOT NULL)
- `longitude` (DECIMAL(10, 7), NOT NULL)
- `direction` (VARCHAR(32), DEFAULT 'APPROACHING')
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

### Table 6: `blacklisted_vehicles`
User-controlled master registry of targeted and monitored vehicles.
- `id` (INT, PK, AUTO_INCREMENT)
- `plate_number` (VARCHAR(32), NOT NULL) — Display plate e.g. `WB37E1275`
- `normalized_plate` (VARCHAR(32), NOT NULL, INDEXED)
- `reason` (VARCHAR(255), NOT NULL)
- `priority` (VARCHAR(16), DEFAULT 'HIGH') — `HIGH`, `MEDIUM`, `LOW`
- `is_active` (BOOLEAN, DEFAULT TRUE)
- `notes` (TEXT, NULLABLE)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)
- *UNIQUE CONSTRAINT*: `(normalized_plate, is_active)`

### Table 7: `blacklist_events`
Audit log of every detection of a blacklisted vehicle across the surveillance network.
- `id` (INT, PK, AUTO_INCREMENT)
- `blacklist_vehicle_id` (INT, FK -> blacklisted_vehicles.id, NOT NULL)
- `plate_detection_id` (INT, FK -> plate_detections.id, NOT NULL)
- `camera_id` (INT, FK -> cameras.id, NOT NULL, INDEXED)
- `junction_id` (INT, FK -> junctions.id, NOT NULL)
- `detected_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `timestamp_sec` (DECIMAL(8, 2), NOT NULL)
- `confidence` (DECIMAL(5, 4), DEFAULT 0.0)
- `status` (VARCHAR(32), DEFAULT 'UNRESOLVED')
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP, INDEXED)

### Table 8: `alerts`
Real-time tactical alert queue consumed by the dashboard Alert Center.
- `id` (INT, PK, AUTO_INCREMENT)
- `alert_type` (VARCHAR(64), NOT NULL) — `BLACKLISTED_VEHICLE`, `ROUTE_ANOMALY`, `CONGESTION`
- `severity` (VARCHAR(16), DEFAULT 'HIGH') — `CRITICAL`, `WARNING`, `INFO`
- `plate_number` (VARCHAR(32), NULLABLE)
- `camera_id` (INT, FK -> cameras.id, NULLABLE)
- `junction_id` (INT, FK -> junctions.id, NULLABLE)
- `plate_detection_id` (INT, FK -> plate_detections.id, NULLABLE)
- `message` (TEXT, NOT NULL)
- `is_read` (BOOLEAN, DEFAULT FALSE)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

### Table 9: `processing_runs`
Pipeline execution telemetry tracking video file processing and ANPR throughput.
- `id` (INT, PK, AUTO_INCREMENT)
- `source_video` (VARCHAR(255), NOT NULL)
- `camera_id` (INT, FK -> cameras.id, NOT NULL)
- `status` (VARCHAR(32), DEFAULT 'COMPLETED')
- `started_at` (DATETIME, NOT NULL)
- `completed_at` (DATETIME, NOT NULL)
- `frames_processed` (INT, DEFAULT 0)
- `detections_count` (INT, DEFAULT 0)
- `plates_detected` (INT, DEFAULT 0)
- `error_message` (TEXT, NULLABLE)

### Table 10: `system_settings`
Configurable operational parameters.
- `id` (INT, PK, AUTO_INCREMENT)
- `setting_key` (VARCHAR(64), UNIQUE, NOT NULL)
- `setting_value` (TEXT, NOT NULL)
- `description` (VARCHAR(255), NULLABLE)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)

---

## 3. Migration & Seeding Strategy

1. **Database Initialization (`scripts/init_database.py`)**:
   - Reads environment variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
   - Automatically executes `CREATE DATABASE IF NOT EXISTS sih_traffic_intelligence`.
   - Executes SQLAlchemy model metadata creation (`Base.metadata.create_all`).
   - Seeds `junctions` (Junction A: `23.710299, 86.952779`, Junction B: `23.713932, 86.952211`).
   - Seeds `cameras` (the 4 CCTV nodes matching `cameras.json`).

2. **Data Migration (`scripts/migrate_json_to_mysql.py`)**:
   - Parses `dataset/metadata/detections.json` (914 detection events).
   - Inserts tracks into `vehicle_tracks`.
   - Normalizes plates and inserts into `plate_detections` and `vehicle_observations`.
   - Migrates default watchlist entries (`WB37E1275`, `JH10CS2095`) into `blacklisted_vehicles`.
   - Evaluates all plate detections against active blacklist entries and records initial `blacklist_events` and `alerts`.
   - **Idempotency**: Running migration repeatedly checks existing records to avoid duplicate inserts.

---

## 4. API Changes

| HTTP Method | Route | Description | Source |
|---|---|---|---|
| `GET` | `/api/blacklist` | List all blacklisted vehicles with detection stats | MySQL `blacklisted_vehicles` |
| `POST` | `/api/blacklist` | Register a new blacklisted vehicle | MySQL Insert |
| `GET` | `/api/blacklist/{id}` | Single blacklisted vehicle record | MySQL |
| `PUT` | `/api/blacklist/{id}` | Update reason, priority, or active status | MySQL Update |
| `DELETE` | `/api/blacklist/{id}` | Delete or deactivate blacklisted vehicle | MySQL Delete |
| `GET` | `/api/blacklist/{plate}/events` | Chronological detections of target vehicle | MySQL `blacklist_events` |
| `GET` | `/api/alerts` | Active alert list sorted by timestamp & priority | MySQL `alerts` |
| `GET` | `/api/alerts/unread` | Unread alerts for dashboard polling | MySQL `alerts` (`is_read=0`) |
| `POST` | `/api/alerts/{id}/read` | Mark alert as acknowledged | MySQL Update (`is_read=1`) |
| `GET` | `/api/vehicles/search` | Full database search with journey & blacklist status | MySQL `plate_detections` |

---

## 5. Frontend Enhancements

1. **Top-Level `+ Add Blacklisted Vehicle` Button**:
   - Embedded prominently in the header bar.
   - Opens polished `BlacklistModal` with plate validation, priority selection, and operational notes.
2. **Dedicated `BLACKLISTED VEHICLES` Section**:
   - Filter chips: `All`, `Active`, `Inactive`, `High Priority`, `Medium Priority`, `Low Priority`.
   - Search bar for quick plate filtering.
   - Action controls: `View Journey`, `Edit`, `Toggle Active/Deactivate`, `Delete`.
3. **Live Alert Refresh in Alert Center**:
   - Polls `/api/alerts/unread` every 5 seconds.
   - Real-time `🚨 BLACKLIST VEHICLE DETECTED` card presentation.
   - Action buttons: `View Detection`, `View Journey`, `Open Map`, and `Mark as Read`.
4. **Database Status Indicator**:
   - Header badge displaying `MySQL: ONLINE` when connected, or `MySQL: LOCAL FALLBACK` if unconfigured.
