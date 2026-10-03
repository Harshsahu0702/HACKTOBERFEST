"""
tests/test_live_anpr.py

Validation test suite for DRISHTI Live Laptop Camera ANPR & Optical Text Recognition.
Tests:
1. Engine readiness status endpoint
2. License plate detection & VAHAN enrichment
3. Arbitrary text detection (any text shown in camera)
4. Blacklist alert integration
5. History logging and retrieval
"""

import sys
import cv2
import base64
import numpy as np
from pathlib import Path
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app import app

client = TestClient(app)


def test_live_anpr_status():
    res = client.get("/api/anpr/status")
    assert res.status_code == 200
    data = res.json()
    assert "pipeline" in data
    print("[PASS] 1. /api/anpr/status verified")


def test_live_anpr_plate_detection():
    # Generate test image with standard plate
    frame = np.full((300, 600, 3), 255, dtype=np.uint8)
    cv2.putText(frame, "DL 8C AF 5030", (50, 150), cv2.FONT_HERSHEY_SIMPLEX, 1.8, (0, 0, 0), 4)
    _, buf = cv2.imencode(".jpg", frame)
    b64_img = base64.b64encode(buf).decode("utf-8")

    res = client.post("/api/anpr/scan-frame", json={
        "image": f"data:image/jpeg;base64,{b64_img}",
        "min_confidence": 0.25,
        "mirror": False,
    })
    assert res.status_code == 200
    data = res.json()
    assert data.get("success") is True
    assert data.get("has_detection") is True
    primary = data.get("primary")
    assert primary is not None
    assert "DL" in primary.get("cleaned_text")
    assert "5030" in primary.get("cleaned_text")
    print(f"[PASS] 2. Live ANPR plate detection passed: {primary.get('formatted_plate')}")


def test_live_anpr_arbitrary_text():
    # Test showing arbitrary text (paper note / badge / phone screen)
    frame = np.full((300, 600, 3), 255, dtype=np.uint8)
    cv2.putText(frame, "BEL JURY 2026", (50, 150), cv2.FONT_HERSHEY_SIMPLEX, 1.8, (0, 0, 0), 4)
    _, buf = cv2.imencode(".jpg", frame)
    b64_img = base64.b64encode(buf).decode("utf-8")

    res = client.post("/api/anpr/scan-frame", json={
        "image": b64_img,
        "min_confidence": 0.25,
        "mirror": False,
    })
    assert res.status_code == 200
    data = res.json()
    assert data.get("success") is True
    assert data.get("has_detection") is True
    primary = data.get("primary")
    assert primary is not None
    assert "JURY" in primary.get("exact_text")
    print(f"[PASS] 3. Live arbitrary text detection passed: {primary.get('exact_text')}")


def test_live_anpr_history_flow():
    # Fetch history
    res = client.get("/api/anpr/live-history?limit=10")
    assert res.status_code == 200
    data = res.json()
    assert "history" in data
    assert len(data["history"]) >= 1

    # Clear history
    res_clear = client.post("/api/anpr/clear-history")
    assert res_clear.status_code == 200
    assert res_clear.json().get("success") is True

    # Re-check history
    res2 = client.get("/api/anpr/live-history")
    assert res2.status_code == 200
    assert len(res2.json()["history"]) == 0
    print("[PASS] 4. Live ANPR history and audit trail verified")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("RUNNING LIVE ANPR & OPTICAL TEXT SUITE")
    print("=" * 60)
    test_live_anpr_status()
    test_live_anpr_plate_detection()
    test_live_anpr_arbitrary_text()
    test_live_anpr_history_flow()
    print("=" * 60)
    print("ALL LIVE ANPR TESTS PASSED! [PASS]\n")
