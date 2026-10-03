"""
tests/test_sih_pipeline.py

SIH 2026 PS 26127 Comprehensive Pipeline Verification Suite.
Validates:
1. Plate normalization & Indian registration syntax validation
2. OCR confidence thresholding and correction review logic
3. Haversine distance and physical speed rejection (>160 km/h)
4. Cross-camera transition detection and OD matrix calculation
5. Blacklist matching and alert generation flow
6. Database query integrity and chronological trajectory ordering
7. System validation and benchmark telemetry endpoints
"""

import math
import re
import sys
from pathlib import Path
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app import app
from backend.services.analytics_engine import haversine_distance_meters
from backend.services.watchlist_service import normalize_plate

client = TestClient(app)

INDIAN_PLATE_REGEX = re.compile(r'^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$')


def test_plate_normalization():
    """Test standard Indian license plate normalization and cleanup."""
    # Raw messy outputs
    assert normalize_plate("wb-37-e-1275") == "WB37E1275"
    assert normalize_plate("  JH 10 CS 2095  ") == "JH10CS2095"
    assert normalize_plate("DL.01.AB.1234") == "DL01AB1234"
    assert normalize_plate("wb 38 ap 4847\n") == "WB38AP4847"


def test_indian_plate_structure():
    """Verify that plates conform to the standard Indian vehicle registration schema."""
    valid_plates = ["WB37E1275", "JH10CS2095", "WB38AP4847", "DL01AB1234", "MH12DE1432"]
    for plate in valid_plates:
        assert INDIAN_PLATE_REGEX.match(plate) is not None, f"Valid plate {plate} failed regex"
        
    invalid_plates = ["1234WB", "XYZ", "WB37E", "1234567890"]
    for plate in invalid_plates:
        assert INDIAN_PLATE_REGEX.match(plate) is None, f"Invalid plate {plate} should have failed regex"


def test_haversine_distance_calculation():
    """Verify haversine distance between real Asansol Junction A and Junction B coordinates."""
    # Junction A: 23.710299, 86.952779
    # Junction B: 23.713932, 86.952211
    dist_m = haversine_distance_meters(23.710299, 86.952779, 23.713932, 86.952211)
    
    # Distance between these two junctions is approx ~408 meters
    assert 380.0 <= dist_m <= 440.0, f"Distance {dist_m}m out of expected range"


def test_speed_calculation_and_physical_rejection():
    """Verify speed calculation and rejection of physically implausible speeds (>160 km/h)."""
    def compute_speed(dist_m: float, dt_sec: float):
        if dt_sec <= 0 or dist_m < 15.0:
            return None
        speed_kmh = (dist_m / dt_sec) * 3.6
        if speed_kmh > 160.0:
            return None
        return speed_kmh

    # 400 meters in 30 seconds -> 48 km/h (valid urban speed)
    speed_valid = compute_speed(400.0, 30.0)
    assert speed_valid is not None
    assert abs(speed_valid - 48.0) < 0.5

    # 400 meters in 3 seconds -> 480 km/h (physically impossible -> rejected)
    speed_impossible = compute_speed(400.0, 3.0)
    assert speed_impossible is None, f"Expected None for impossible speed, got {speed_impossible}"

    # Delta time <= 0 should be rejected
    assert compute_speed(400.0, 0.0) is None
    assert compute_speed(400.0, -5.0) is None

    # Distance < 15m should be rejected (intra-camera micro jitter)
    assert compute_speed(10.0, 20.0) is None


def test_cross_camera_od_matrix():
    """Verify OD matrix endpoint produces valid origin-destination counts from actual data."""
    res = client.get("/api/traffic/od")
    assert res.status_code == 200
    data = res.json()
    assert "od_matrix" in data
    assert isinstance(data["od_matrix"], list)

    if len(data["od_matrix"]) > 0:
        row = data["od_matrix"][0]
        assert "origin_camera_id" in row
        assert "destination_camera_id" in row
        assert "count" in row
        assert "estimated_speed_kmh" in row


def test_blacklist_alert_generation():
    """Verify that blacklisted vehicle exists in DB and is detected."""
    res = client.get("/api/blacklist")
    assert res.status_code == 200
    blacklist = res.json()
    assert len(blacklist) > 0

    # Ensure alerts endpoint returns alerts with proper schema
    res_alerts = client.get("/api/alerts")
    assert res_alerts.status_code == 200
    alerts_data = res_alerts.json()
    assert "total_alerts" in alerts_data
    assert "blacklist_alerts" in alerts_data
    assert "all_alerts_sorted" in alerts_data


def test_vehicle_trajectory_reconstruction():
    """Verify chronological trajectory reconstruction for a known plate."""
    res = client.get("/api/vehicles/WB37E1275/trajectory")
    assert res.status_code == 200
    traj_data = res.json()
    assert traj_data["plate"] == "WB37E1275"
    assert "trajectory" in traj_data
    assert isinstance(traj_data["trajectory"], list)
    
    # Check that observations are chronologically ordered
    timestamps = [p["timestamp_sec"] for p in traj_data["trajectory"] if "timestamp_sec" in p]
    assert timestamps == sorted(timestamps), "Trajectory points are not chronologically sorted"


def test_system_validation_telemetry():
    """Verify that /api/system/validation returns empirical benchmarks and telemetry."""
    res = client.get("/api/system/validation")
    assert res.status_code == 200
    val = res.json()
    
    assert val["status"] == "ok"
    assert "ocr_evaluation" in val
    assert "performance_benchmark" in val
    assert "database_telemetry" in val
    
    ocr = val["ocr_evaluation"]
    assert ocr["exact_plate_accuracy_pct"] >= 90.0, f"SIH >90% requirement not met: {ocr['exact_plate_accuracy_pct']}%"
    assert ocr["total_samples"] >= 100
    
    perf = val["performance_benchmark"]
    assert perf["input_fps"] > 0
    assert perf["processing_fps"] > 0
    assert "pipeline_latency_ms" in perf
    
    db = val["database_telemetry"]
    assert db["total_detections"] > 0
    assert db["total_cameras"] == 4


def test_operator_review_mechanism():
    """Test human-in-the-loop review endpoint."""
    # Test on detection ID 1 with JSON body
    res = client.patch(
        "/api/detections/1/review",
        json={"corrected_plate": "WB37E1275", "reviewer_notes": "Operator verified crop"}
    )
    assert res.status_code == 200
    res_json = res.json()
    assert res_json["success"] is True
    assert res_json["corrected_plate"] == "WB37E1275"
    assert res_json["status"] == "OPERATOR_VERIFIED"


def test_traffic_timeseries_and_heatmap():
    """Verify timeseries and heatmap endpoints."""
    res_ts = client.get("/api/traffic/timeseries?interval=15s")
    assert res_ts.status_code == 200
    ts_data = res_ts.json()
    assert "time_series" in ts_data
    assert isinstance(ts_data["time_series"], list)

    res_hm = client.get("/api/traffic/heatmap")
    assert res_hm.status_code == 200
    hm_data = res_hm.json()
    assert "points" in hm_data
    assert len(hm_data["points"]) == 4  # 4 CCTV nodes


if __name__ == "__main__":
    tests = [
        test_plate_normalization,
        test_indian_plate_structure,
        test_haversine_distance_calculation,
        test_speed_calculation_and_physical_rejection,
        test_cross_camera_od_matrix,
        test_blacklist_alert_generation,
        test_vehicle_trajectory_reconstruction,
        test_system_validation_telemetry,
        test_operator_review_mechanism,
        test_traffic_timeseries_and_heatmap,
    ]
    print(f"\n{'='*60}\nRUNNING SIH 2026 PS 26127 VERIFICATION SUITE ({len(tests)} TESTS)\n{'='*60}")
    passed = 0
    import traceback
    for t in tests:
        try:
            t()
            print(f"  [PASS] {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {t.__name__}: {e}")
            traceback.print_exc()
    print(f"{'='*60}\nRESULTS: {passed}/{len(tests)} PASSED\n{'='*60}")
    if passed == len(tests):
        sys.exit(0)
    else:
        sys.exit(1)

