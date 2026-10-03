"""
tests/test_mysql_database.py

Automated test suite verifying the complete MySQL architecture, 10 tables,
Blacklist management, duplicate prevention, real-time alert generation,
vehicle search, and journey reconstruction for SIH 2026.
"""

import sys
import unittest
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

load_dotenv(PROJECT_ROOT / ".env", override=True)

from sqlalchemy import select, func, inspect
from backend.database.connection import engine, SessionLocal, is_db_connected
from backend.database.models import (
    Junction,
    Camera,
    VehicleTrack,
    PlateDetection,
    VehicleObservation,
    BlacklistedVehicle,
    BlacklistEvent,
    Alert,
    ProcessingRun,
    SystemSetting,
)
from backend.services.mysql_blacklist_service import MySQLBlacklistService, normalize_plate
from backend.services.mysql_alert_service import MySQLAlertService
from backend.services.mysql_search_service import MySQLSearchService
from backend.services.dataset_service import get_cameras_dict


class TestMySQLDatabaseSuite(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        """Verify database connectivity before running tests."""
        cls.connected = is_db_connected()
        if not cls.connected:
            raise unittest.SkipTest("MySQL database is not reachable with current credentials.")

    def setUp(self):
        self.session = SessionLocal()

    def tearDown(self):
        self.session.close()

    # 1. Database connection
    def test_01_database_connection(self):
        self.assertTrue(is_db_connected(), "MySQL database connection must be active.")

    # 2. Table initialization (all 10 tables verified)
    def test_02_all_tables_exist(self):
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        required_tables = {
            "junctions",
            "cameras",
            "vehicle_tracks",
            "plate_detections",
            "vehicle_observations",
            "blacklisted_vehicles",
            "blacklist_events",
            "alerts",
            "processing_runs",
            "system_settings",
        }
        missing = required_tables - table_names
        self.assertEqual(len(missing), 0, f"Missing tables in MySQL: {missing}")

    # 3. Camera loading and ground-truth coordinates
    def test_03_cameras_loaded_with_ground_truth(self):
        cams = self.session.execute(select(Camera)).scalars().all()
        self.assertEqual(len(cams), 4, "Must have exactly 4 CCTV cameras seeded.")

        cam_codes = {c.camera_code for c in cams}
        expected_codes = {
            "junction_A_camera_01",
            "junction_A_camera_02",
            "junction_B_camera_01",
            "junction_B_camera_02",
        }
        self.assertEqual(cam_codes, expected_codes)

        # Check Junction A Camera 01 coordinates
        cam_a1 = next(c for c in cams if c.camera_code == "junction_A_camera_01")
        self.assertAlmostEqual(cam_a1.latitude, 23.710299, places=4)
        self.assertAlmostEqual(cam_a1.longitude, 86.952779, places=4)

    # 4. Detection insertion & tracks count
    def test_04_detection_insertion_present(self):
        pd_count = self.session.execute(select(func.count(PlateDetection.id))).scalar_one()
        vt_count = self.session.execute(select(func.count(VehicleTrack.id))).scalar_one()
        self.assertGreaterEqual(pd_count, 100, "Should have migrated over 100 plate detections.")
        self.assertGreaterEqual(vt_count, 800, "Should have migrated over 800 vehicle tracks.")

    # 5. Plate normalization
    def test_05_plate_normalization(self):
        self.assertEqual(normalize_plate("wb-37-e-1275"), "WB37E1275")
        self.assertEqual(normalize_plate("  WB 37E 1275  "), "WB37E1275")
        self.assertEqual(normalize_plate("jh-10/cs.2095"), "JH10CS2095")
        self.assertEqual(normalize_plate(""), "")

    # 6. Blacklist creation
    def test_06_blacklist_creation(self):
        test_plate = "TEST9999"
        # Clean up any leftover
        existing = self.session.execute(
            select(BlacklistedVehicle).filter_by(normalized_plate=test_plate)
        ).scalar_one_or_none()
        if existing:
            self.session.delete(existing)
            self.session.commit()

        res = MySQLBlacklistService.add_blacklisted_vehicle(
            plate_number=test_plate,
            reason="Automated Unit Test Vehicle",
            priority="MEDIUM",
            notes="Testing creation flow",
        )
        self.assertTrue(res["is_active"])
        self.assertEqual(res["normalized_plate"], test_plate)

        # Clean up
        MySQLBlacklistService.delete_blacklisted_vehicle(res["id"])

    # 7. Duplicate blacklist prevention
    def test_07_duplicate_blacklist_prevention(self):
        test_plate = "DUP7777"
        res1 = MySQLBlacklistService.add_blacklisted_vehicle(
            plate_number=test_plate,
            reason="Original entry",
            priority="LOW",
        )
        try:
            with self.assertRaises(ValueError):
                MySQLBlacklistService.add_blacklisted_vehicle(
                    plate_number="dup-7777",  # same normalized plate
                    reason="Duplicate attempt",
                    priority="HIGH",
                )
        finally:
            MySQLBlacklistService.delete_blacklisted_vehicle(res1["id"])

    # 8. Blacklist lookup
    def test_08_blacklist_lookup(self):
        bl_list = MySQLBlacklistService.get_all_blacklisted()
        self.assertIsInstance(bl_list, list)
        plates = [b["normalized_plate"] for b in bl_list]
        self.assertIn("WB37E1275", plates, "WB37E1275 must be present in blacklist.")

    # 9. Blacklist detection event recording
    def test_09_blacklist_detection_events(self):
        events = MySQLBlacklistService.get_events_for_plate("WB37E1275")
        self.assertIsInstance(events, list)
        self.assertGreater(len(events), 0, "WB37E1275 should have recorded detection events.")
        first_ev = events[0]
        self.assertIn("camera_name", first_ev)
        self.assertIn("timestamp_sec", first_ev)

    # 10. Alert creation
    def test_10_alert_creation_and_fields(self):
        alerts = MySQLAlertService.get_alerts(unread_only=False, limit=10)
        self.assertIsInstance(alerts, list)
        self.assertGreater(len(alerts), 0, "Should have alerts stored in MySQL.")
        a = alerts[0]
        self.assertIn("id", a)
        self.assertIn("plate_number", a)
        self.assertIn("severity", a)
        self.assertIn("message", a)

    # 11. Alert retrieval and read receipts
    def test_11_alert_retrieval_and_mark_read(self):
        unread_before = MySQLAlertService.get_unread_count()
        self.assertIsInstance(unread_before, int)

        # Fetch an unread alert
        unread_alerts = MySQLAlertService.get_alerts(unread_only=True, limit=1)
        if unread_alerts:
            target_id = unread_alerts[0]["id"]
            success = MySQLAlertService.mark_as_read(target_id)
            self.assertTrue(success)

            # Confirm marked as read
            updated_alert = self.session.execute(
                select(Alert).filter_by(id=target_id)
            ).scalar_one()
            self.assertTrue(updated_alert.is_read)

    # 12. Vehicle search
    def test_12_vehicle_search(self):
        res = MySQLSearchService.search_vehicle("WB37E1275")
        self.assertIsNotNone(res, "Search for WB37E1275 must return a result.")
        self.assertTrue(res["found"])
        self.assertEqual(res["plate"], "WB37E1275")
        self.assertTrue(res["blacklisted"], "WB37E1275 must be flagged as blacklisted.")
        self.assertGreater(res["total_detections"], 0)

    # 13. Journey and route generation
    def test_13_journey_and_route_generation(self):
        res = MySQLSearchService.search_vehicle("JH10CS2095")
        self.assertIsNotNone(res)
        self.assertIn("timeline", res)
        self.assertIn("route", res)
        self.assertIn("journey", res)

        route = res["route"]
        self.assertGreater(len(route), 0)
        # Check coordinates are real
        self.assertGreater(route[0]["lat"], 20.0)
        self.assertGreater(route[0]["lng"], 80.0)

    # 14. Camera configurations API check
    def test_14_camera_api_configurations(self):
        cams_dict = get_cameras_dict()
        self.assertEqual(len(cams_dict), 4)
        for code in ["junction_A_camera_01", "junction_A_camera_02", "junction_B_camera_01", "junction_B_camera_02"]:
            self.assertIn(code, cams_dict)
            self.assertIn("lat", cams_dict[code])
            self.assertIn("lng", cams_dict[code])

    # 15. Video paths exist
    def test_15_video_paths_exist(self):
        cams = self.session.execute(select(Camera)).scalars().all()
        for cam in cams:
            if cam.video_path:
                vpath = PROJECT_ROOT / cam.video_path
                self.assertTrue(vpath.exists(), f"Video file must exist: {vpath}")


if __name__ == "__main__":
    unittest.main()
