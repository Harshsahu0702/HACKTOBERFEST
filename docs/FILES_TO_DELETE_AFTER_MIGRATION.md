# SIH 2026: Post-Migration File Audit & Deprecation Guide

This document classifies existing files in the SIH 2026 Traffic Intelligence project following the migration to a normalized MySQL persistent database (`sih_traffic_intelligence`).

---

## 1. SAFE TO DELETE (Post-Verification)

These files were temporary scratch scripts, intermediate evaluation dumps, or redundant output files that are neither imported by `backend/app.py`, nor referenced by the React frontend:

| File Path | Original Purpose | Why Safe to Delete |
| :--- | :--- | :--- |
| `scratch/audit_data.py` | Scratch script used for examining detections JSON | One-off debugging utility; not imported |
| `scratch/test_db_conn.py` | Scratch script testing MySQL connection | Replaced by `tests/test_mysql_database.py` |
| `dataset/metadata/cross_camera_matches.json` | Pre-computed cross-camera matches | Replaced by direct relational queries on `plate_detections` and `vehicle_observations` |
| `dataset/metadata/global_vehicle_paths.json` | Pre-calculated vehicle paths | Replaced by dynamic SQL journey reconstruction in `MySQLSearchService` |
| `dataset/metadata/frontend_vehicle_paths.json` | Legacy frontend synthetic paths | Replaced by database-backed `/api/vehicles/search` and GIS Leaflet route |
| `dataset/metadata/vehicle_plate_summary.json` | Pre-aggregated vehicle plate summary | Replaced by SQL `GROUP BY normalized_plate` in `MySQLSearchService.get_database_analytics()` |

> [!NOTE]
> Do NOT delete these files immediately until after the jury demo. The backend has already decoupled from them and operates directly on MySQL with local JSON fallback.

---

## 2. KEEP (Core Operational Assets)

These files are essential for production operations, the demo pipeline, and the neural network inference workflow:

| Component | File Path | Reason to Keep |
| :--- | :--- | :--- |
| **Backend Core** | `backend/app.py` | Primary FastAPI application serving all REST endpoints |
| **Database ORM** | `backend/database/models.py` | 10 normalized SQLAlchemy relational models |
| **Database Conn** | `backend/database/connection.py` | Resilient connection pooling, health checks, environment loading |
| **Services** | `backend/services/mysql_blacklist_service.py` | Operator blacklist management, retroactive alert matching |
| **Services** | `backend/services/mysql_alert_service.py` | Database alert storage, polling, read receipts |
| **Services** | `backend/services/mysql_search_service.py` | Database-backed vehicle search, journey, and speed calculations |
| **Services** | `backend/services/analytics_engine.py` | Ground-truth mathematical analytics (OD matrix, Relative Congestion Index, Haversine speed) |
| **Services** | `backend/services/dataset_service.py` | Camera metadata loader and JSON fallback support |
| **Services** | `backend/services/video_service.py` | HTTP 206 Partial Content video streaming engine |
| **Models** | `models/yolo11n.pt` / `models/license_plate.pt` | YOLO vehicle detection and license plate detection weights |
| **Videos** | `dataset/junction_A/*.mp4`, `dataset/junction_B/*.mp4` | 4 ground-truth CCTV surveillance videos |
| **Metadata** | `dataset/metadata/cameras.json` | Camera definitions with ground-truth coordinates |
| **Metadata** | `dataset/metadata/detections.json` | Source of truth for database initialization & offline fallback |
| **Scripts** | `scripts/init_database.py` | Automated idempotent table & topology creation script |
| **Scripts** | `scripts/migrate_json_to_mysql.py` | Idempotent data migration script |
| **Tests** | `tests/test_mysql_database.py` | 15 automated test suites for MySQL validation |
| **Tests** | `tests/test_api_endpoints.py` | 14 automated backend API tests |
| **Frontend** | `frontend/src/*` | React 18 + Vite command center frontend |

---

## 3. OPTIONAL LEGACY (Kept for Offline Fallback)

These files provide offline resilience in case MySQL server is unavailable during field deployment:

| File Path | Description | Recommended Action |
| :--- | :--- | :--- |
| `dataset/metadata/watchlist.json` | Local file-based watchlist fallback | Keep as secondary backup storage |
| `backend/services/watchlist_service.py` | File-based watchlist fallback service | Keep active as fallback when `is_db_connected() == False` |
| `backend/services/plate_search_service.py` | In-memory search fallback service | Keep active as fallback when `is_db_connected() == False` |

---

## 4. UNKNOWN / NEEDS REVIEW

| File Path | Current Status | Recommendation |
| :--- | :--- | :--- |
| `runs/` | YOLO training/inference logs from prior runs | Safe to archive or ignore in `.gitignore` |
| `scratch/` | Temporary working folder | Ignored in production deployments |

---

## Summary of Architectural Decoupling

```
[BEFORE]
Frontend -> FastAPI -> local JSONs (frontend_vehicle_paths.json, cross_camera_matches.json)

[AFTER MIGRATION]
Frontend -> FastAPI -> MySQL Database (sih_traffic_intelligence)
                             ├── junctions (2 nodes)
                             ├── cameras (4 nodes)
                             ├── vehicle_tracks (914 tracks)
                             ├── plate_detections (144 detections)
                             ├── vehicle_observations (144 observations)
                             ├── blacklisted_vehicles (Operator-controlled)
                             ├── blacklist_events (Real-time matches)
                             └── alerts (Real-time notifications)
```
