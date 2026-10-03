"""
tests/test_api_endpoints.py

Automated Test Suite for SIH 2026 Traffic Intelligence & Plate-Based Journey API.
Validates all Phase 24 testing requirements.
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app import app

client = TestClient(app)


def test_health():
    """1. Test /api/health endpoint."""
    res = client.get("/api/health")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.json()
    assert data.get("status") == "healthy"
    assert data.get("cameras_online") == 4
    assert data.get("total_detections_indexed") == 914
    print("[PASS] 1. /api/health passed")


def test_cameras_and_coordinates():
    """2 & 13. Test cameras endpoint and verify intentional coordinates."""
    res = client.get("/api/cameras")
    assert res.status_code == 200
    cams = res.json()
    assert len(cams) == 4

    # Verify exact intentional coordinates
    expected_coords = {
        "junction_A_camera_01": (23.710299, 86.952779),
        "junction_A_camera_02": (23.710293, 86.952695),
        "junction_B_camera_01": (23.713932, 86.952211),
        "junction_B_camera_02": (23.713929, 86.952144),
    }

    for cid, (exp_lat, exp_lng) in expected_coords.items():
        assert cid in cams, f"Missing camera {cid}"
        cam = cams[cid]
        assert abs(cam["lat"] - exp_lat) < 1e-5, f"Camera {cid} lat mismatch: {cam['lat']} vs {exp_lat}"
        assert abs(cam["lng"] - exp_lng) < 1e-5, f"Camera {cid} lng mismatch: {cam['lng']} vs {exp_lng}"

    print("[PASS] 2 & 13. Cameras and coordinates verification passed")


def test_vehicle_search_existing():
    """3. Test searching for existing plate WB37E1275."""
    res = client.get("/api/vehicles/search?q=WB37E1275")
    assert res.status_code == 200
    data = res.json()
    assert data.get("found") is True
    assert data.get("plate") == "WB37E1275"
    assert len(data.get("detections", [])) >= 1
    # Since WB37E1275 is seen in only 1 camera, speed must be null (NEVER invented)
    assert data.get("estimated_average_speed") is None
    print("[PASS] 3. Search existing plate (WB37E1275) passed")


def test_vehicle_search_unknown():
    """4. Test searching for unknown vehicle."""
    res = client.get("/api/vehicles/search?q=UNKNOWN_PLATE_9999")
    assert res.status_code == 200
    data = res.json()
    assert data.get("found") is False
    assert "No vehicle found" in data.get("message", "")
    print("[PASS] 4. Search unknown vehicle passed")


def test_journey_reconstruction_and_speed():
    """5 & 9. Test cross-camera journey and real Haversine speed calculation."""
    res = client.get("/api/vehicles/search?q=JH10CS2095")
    assert res.status_code == 200
    data = res.json()
    assert data.get("found") is True
    assert data.get("camera_count") == 4
    assert data.get("observation_count") == 4
    # Multi-camera transit has calculated speed
    avg_speed = data.get("estimated_average_speed")
    assert avg_speed is not None
    assert 10.0 <= avg_speed <= 120.0, f"Speed {avg_speed} km/h not within physical bounds"
    assert "km/h" in data.get("estimated_average_speed_label", "")

    # Check journey alias
    j_res = client.get("/api/vehicles/JH10CS2095/journey")
    assert j_res.status_code == 200
    assert len(j_res.json().get("events", [])) == 4
    print("[PASS] 5 & 9. Journey reconstruction and speed calculation passed")


def test_analytics_overview():
    """6. Test /api/analytics and /api/analytics/overview."""
    res = client.get("/api/analytics")
    assert res.status_code == 200
    data = res.json()

    kpis = data.get("kpis", {})
    assert kpis.get("cameras_online") == 4
    assert kpis.get("global_vehicles", 0) > 0 or kpis.get("unique_plates", 0) > 0
    assert kpis.get("unique_plates") > 0
    assert kpis.get("cross_junction_matches", 0) > 0 or kpis.get("cross_camera_matches", 0) > 0

    assert len(data.get("vehicle_types", [])) > 0
    assert len(data.get("camera_volumes", [])) == 4
    print("[PASS] 6. Analytics overview passed")


def test_od_analytics():
    """7. Test Origin-Destination (OD) analytics."""
    res = client.get("/api/analytics/od")
    assert res.status_code == 200
    data = res.json()
    od_list = data.get("od_matrix", [])
    assert len(od_list) > 0

    # Ensure all transitions have non-negative count and valid fields
    for od in od_list:
        assert od["count"] >= 0
        assert od["share_pct"] >= 0
        assert "origin_junction_id" in od or "origin_camera_id" in od
        assert "destination_junction_id" in od or "destination_camera_id" in od

    print("[PASS] 7. Origin-Destination analytics passed")


def test_congestion_analytics():
    """8. Test congestion and bottleneck detection."""
    res = client.get("/api/analytics/congestion")
    assert res.status_code == 200
    data = res.json()
    cams = data.get("camera_volumes", [])
    assert len(cams) == 4

    for c in cams:
        cong = c.get("relative_congestion_index")
        assert cong is not None
        assert 0.0 <= cong <= 100.0
        assert c.get("congestion_level") in ("LOW", "MEDIUM", "HIGH", "CRITICAL", "OPTIMAL", "MODERATE")

    print("[PASS] 8. Congestion analytics passed")


def test_speed_analytics_summary():
    """9. Test /api/analytics/speed summary."""
    res = client.get("/api/analytics/speed")
    assert res.status_code == 200
    data = res.json()
    summary = data.get("speed_summary", {})
    assert summary.get("status") == "VALID"
    assert summary.get("valid_sample_count") > 0
    assert summary.get("average_speed_kmh") > 0
    print("[PASS] 9. Speed analytics summary passed")


def test_watchlist_and_blacklist_alerts():
    """10 & 11. Test Watchlist CRUD and Blacklist Alert generation."""
    # GET watchlist
    res = client.get("/api/watchlist")
    assert res.status_code == 200
    wl = res.json()
    plates = [item["plate"] for item in wl]
    assert "WB37E1275" in plates

    # POST new watchlist entry
    new_plate = "TEST_PLATE_99"
    post_res = client.post("/api/watchlist", json={
        "plate": new_plate,
        "status": "blacklisted",
        "reason": "Test unit entry",
        "priority": "HIGH"
    })
    assert post_res.status_code == 201
    assert post_res.json().get("success") is True

    # Check alert generation
    alert_res = client.get("/api/alerts")
    assert alert_res.status_code == 200
    alert_data = alert_res.json()
    assert alert_data.get("total_alerts") > 0
    bl_alerts = alert_data.get("blacklist_alerts", [])
    bl_plates = [a["plate"] for a in bl_alerts]
    assert "WB37E1275" in bl_plates

    # DELETE test watchlist entry
    del_res = client.delete(f"/api/watchlist/{new_plate}")
    assert del_res.status_code == 200
    print("[PASS] 10 & 11. Watchlist CRUD and blacklist alert passed")


def test_registry_pagination_and_filtering():
    """12. Test registry pagination and filtering."""
    # Test pagination
    res = client.get("/api/vehicles?page=1&page_size=10")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 10

    # Test matched_only filter
    res_matched = client.get("/api/vehicles?matched_only=true")
    assert res_matched.status_code == 200
    matched_data = res_matched.json()
    for v in matched_data:
        assert v["camera_count"] > 1

    # Test has_plate filter
    res_plate = client.get("/api/vehicles?has_plate=true")
    assert res_plate.status_code == 200
    for v in res_plate.json():
        assert v["has_plate"] is True

    print("[PASS] 12. Registry pagination and filtering passed")


def test_malformed_and_error_handling():
    """14. Test handling of malformed input and missing resources."""
    # Non-existent camera
    r1 = client.get("/api/cameras/non_existent_cam")
    assert r1.status_code == 404

    # Non-existent video
    r2 = client.get("/api/cameras/non_existent_cam/video")
    assert r2.status_code == 404

    # Non-existent plate crop
    r3 = client.get("/api/plates/non_existent_img.jpg")
    assert r3.status_code == 404

    # Non-existent vehicle detail
    r4 = client.get("/api/vehicles/DEFINITELY_NOT_HERE_XYZ")
    assert r4.status_code == 404

    # Delete non-existent watchlist entry
    r5 = client.delete("/api/watchlist/NON_EXISTENT_PLATE_ABC")
    assert r5.status_code == 404

    # Empty watchlist post
    r6 = client.post("/api/watchlist", json={"plate": "", "status": "blacklisted"})
    assert r6.status_code == 422  # validation error

    print("[PASS] 14. Malformed and error handling passed")


def run_all_tests():
    print("\n" + "=" * 60)
    print("RUNNING SIH 2026 TRAFFIC INTELLIGENCE TEST SUITE")
    print("=" * 60)
    test_health()
    test_cameras_and_coordinates()
    test_vehicle_search_existing()
    test_vehicle_search_unknown()
    test_journey_reconstruction_and_speed()
    test_analytics_overview()
    test_od_analytics()
    test_congestion_analytics()
    test_speed_analytics_summary()
    test_watchlist_and_blacklist_alerts()
    test_registry_pagination_and_filtering()
    test_malformed_and_error_handling()
    print("=" * 60)
    print("ALL 14 BACKEND TESTS PASSED SUCCESSFULLY! [PASS]")
    print("=" * 60 + "\n")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    run_all_tests()
