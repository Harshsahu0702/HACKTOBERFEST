# MySQL Setup & Configuration Guide (Windows PowerShell)

This document provides exact step-by-step Windows PowerShell commands to configure, initialize, and verify the MySQL database for the **SIH 2026 City-Wide Traffic Intelligence** platform.

---

## 1. Prerequisites
- MySQL Server 8.0 installed (default service name: `MySQL80`).
- Python 3.10+ with `pymysql`, `cryptography`, and `sqlalchemy` installed.

Verify the MySQL Windows service is running:
```powershell
Get-Service -Name *mysql*
```
If stopped, start it with administrator privileges:
```powershell
Start-Service -Name MySQL80
```

---

## 2. MySQL Login & Database Creation

Login to MySQL CLI via PowerShell (adjust path if needed):
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```
*(Enter your MySQL root password when prompted)*

Once in the MySQL interactive prompt, run:

```sql
-- 1. Create the Database
CREATE DATABASE IF NOT EXISTS sih_traffic_intelligence
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

-- 2. Optional: Create Dedicated Application User (Recommended for Production)
CREATE USER IF NOT EXISTS 'sih_user'@'localhost' IDENTIFIED BY 'sih_secure_password_2026';
GRANT ALL PRIVILEGES ON sih_traffic_intelligence.* TO 'sih_user'@'localhost';
FLUSH PRIVILEGES;

-- 3. Verify Database Creation
SHOW DATABASES LIKE 'sih%';

-- Exit MySQL CLI
EXIT;
```

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env` in the project root:
```powershell
Copy-Item .env.example .env
```

Open `.env` and set your credentials:
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_actual_password_here
DB_NAME=sih_traffic_intelligence
```

---

## 4. Initialize Database Tables & Seed Static Nodes

Run the automated initialization script from the project root:
```powershell
python scripts/init_database.py
```

Expected Output:
```text
============================================================
SIH 2026 — MYSQL DATABASE INITIALIZATION
============================================================
[✓] Connected to MySQL server at 127.0.0.1:3306
[✓] Database 'sih_traffic_intelligence' confirmed/created.
[✓] All 10 database tables and indexes created successfully.
[✓] Junctions seeded: Junction A, Junction B
[✓] Cameras seeded: 4 surveillance camera nodes configured.
============================================================
DATABASE INITIALIZATION COMPLETED SUCCESSFULLY!
============================================================
```

---

## 5. Migrate Dataset into MySQL

Run the automated data migration script:
```powershell
python scripts/migrate_json_to_mysql.py
```

Expected Output:
```text
============================================================
MIGRATING JSON DATASET TO MYSQL
============================================================
[✓] Migrated 2 Junctions
[✓] Migrated 4 Cameras
[✓] Migrated 914 Vehicle Tracks
[✓] Migrated 144 Plate Detections & Observations
[✓] Migrated Watchlist Entries to blacklisted_vehicles
[✓] Generated Blacklist Match Events & Real-Time Alerts
============================================================
MIGRATION SUMMARY:
  Junctions inserted: 2
  Cameras inserted: 4
  Vehicle tracks inserted: 914
  Plate detections inserted: 144
  Unique plates: 105
  Blacklisted matches: 5
============================================================
```

---

## 6. Verification SQL Queries

Verify that data was properly ingested by logging into MySQL CLI:
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p sih_traffic_intelligence -e "
SELECT 'junctions' AS tbl, COUNT(*) AS count FROM junctions
UNION ALL
SELECT 'cameras', COUNT(*) FROM cameras
UNION ALL
SELECT 'vehicle_tracks', COUNT(*) FROM vehicle_tracks
UNION ALL
SELECT 'plate_detections', COUNT(*) FROM plate_detections
UNION ALL
SELECT 'blacklisted_vehicles', COUNT(*) FROM blacklisted_vehicles
UNION ALL
SELECT 'blacklist_events', COUNT(*) FROM blacklist_events
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts;
"
```

Verify Blacklist alert query:
```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p sih_traffic_intelligence -e "
SELECT e.id, bv.plate_number, c.camera_name, e.timestamp_sec, e.status 
FROM blacklist_events e 
JOIN blacklisted_vehicles bv ON e.blacklist_vehicle_id = bv.id 
JOIN cameras c ON e.camera_id = c.id;
"
```

---

## 7. Starting the Application

```powershell
# 1. Start Backend API
uvicorn backend.app:app --host 127.0.0.1 --port 8000

# 2. Start React Command Center (in another terminal)
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```
Open your browser at: `http://127.0.0.1:5173`
