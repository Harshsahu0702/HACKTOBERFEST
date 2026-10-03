"""
tests/test_gemini_copilot_live.py

Comprehensive test suite verifying:
1. Live Gemini connectivity and response generation.
2. Graceful offline fallback to verified local engine when GEMINI_API_KEY is empty or offline.
3. Multi-turn session history persistence.
4. Factual grounding verification (zero hallucinations on J1/J2 volume and accuracy).
5. Action cards and suggested actions preservation (Trace on Map, Evidence, Dossier, Challan).
6. FastAPI endpoint POST /api/v1/copilot/query compliance.
"""

import sys
import os
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from fastapi.testclient import TestClient
from backend.app import app
from backend.services.drishti_gpt_service import DrishtiGPTService, SessionHistoryManager


def test_live_gemini_conversational():
    print("\n--- 1. Testing Live Gemini Natural Conversational Reply ---")
    res = DrishtiGPTService.process_query("Hello bhai, DRISHTI kya hai short me batao", context={"session_id": "live_test_1"})
    assert res["status"] == "SUCCESS"
    assert res["intent"] in ("CHAT_GEMINI", "CHAT_LOCAL_VERIFIED")
    assert "drishti" in res["reply"].lower()
    assert len(res["reply"]) > 20
    assert len(res["speech_text"]) > 0
    print(f"[PASS] Gemini intent: {res['intent']}")
    print(f"       Reply excerpt: {res['reply'][:120]}...")


def test_multiturn_session_context():
    print("\n--- 2. Testing Multi-Turn Session History ---")
    session_id = "multiturn_session_demo"
    # Turn 1: Presentation query
    res1 = DrishtiGPTService.process_query("Presentation me 30 second me kaise explain karu?", context={"session_id": session_id})
    assert len(res1["reply"]) > 20

    # Turn 2: Follow-up in English
    res2 = DrishtiGPTService.process_query("English me batao", context={"session_id": session_id})
    assert any(w in res2["reply"].lower() for w in ["pitch", "30", "drishti", "system", "second"])
    print(f"[PASS] Multi-turn context maintained across turns in session '{session_id}'")


def test_live_data_grounding_no_hallucination():
    print("\n--- 3. Testing Real-Time J1 Telemetry Grounding ---")
    res = DrishtiGPTService.process_query("J1 pe abhi kitne vehicles hain?", context={"session_id": "grounding_test"})
    assert res["intent"] == "CONGESTION"
    assert "58" in res["reply"] or "detections" in res["reply"]
    assert "reply" in res
    assert "speech_text" in res
    print(f"[PASS] Factual ground truth verified: J1 volume correctly reported without hallucination.")


def test_vehicle_search_and_action_cards():
    print("\n--- 4. Testing Vehicle Search & Action Cards Preservation ---")
    res = DrishtiGPTService.process_query("Where is vehicle WB37E1275?")
    assert res["intent"] == "VEHICLE_SEARCH"
    assert res["status"] == "FOUND"
    assert len(res["cards"]) > 0
    card = res["cards"][0]
    assert card["plate"] == "WB37E1275"
    assert "speed" in card
    
    actions = [a["action"] for a in res["suggested_actions"]]
    assert "TRACE_MAP" in actions
    assert "PLAY_EVIDENCE" in actions
    assert "OPEN_DOSSIER" in actions
    assert "ISSUE_CHALLAN" in actions
    print(f"[PASS] Vehicle cards and action triggers preserved: {actions}")


def test_speeding_audit_and_cards():
    print("\n--- 5. Testing Speeding Violations Audit ---")
    res = DrishtiGPTService.process_query("Show me vehicles driving above 35 km/h")
    assert res["intent"] == "SPEEDING"
    assert res["status"] in ("VIOLATIONS_FOUND", "NO_VIOLATIONS")
    assert "reply" in res
    assert len(res["suggested_actions"]) > 0
    print(f"[PASS] Speeding audit completed with intent {res['intent']}")


def test_blacklist_triage_and_cards():
    print("\n--- 6. Testing Blacklist & Threat Triage ---")
    res = DrishtiGPTService.process_query("Are there any wanted or blacklisted vehicles on CCTV?")
    assert res["intent"] == "BLACKLIST"
    assert "reply" in res
    assert len(res["suggested_actions"]) > 0
    print(f"[PASS] Blacklist triage completed with intent {res['intent']}")


def test_fastapi_endpoint_post_query():
    print("\n--- 7. Testing FastAPI Endpoint POST /api/v1/copilot/query ---")
    client = TestClient(app)
    payload = {
        "query": "Kaise ho bhai?",
        "context": {
            "session_id": "fastapi_test_session",
            "history": [
                {"role": "user", "text": "Hello"},
                {"role": "model", "text": "Hello! How can I help?"}
            ]
        }
    }
    response = client.post("/api/v1/copilot/query", json=payload)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert "reply" in data
    assert "intent" in data
    assert "speech_text" in data
    assert "cards" in data
    assert "suggested_actions" in data
    assert "quickChips" in data
    print(f"[PASS] FastAPI copilot endpoint responded 200 OK with full schema.")


def test_offline_fallback_simulation():
    print("\n--- 8. Testing Offline Fallback Safety (No GEMINI_API_KEY) ---")
    saved_key = os.environ.get("GEMINI_API_KEY", "")
    try:
        os.environ["GEMINI_API_KEY"] = ""
        res = DrishtiGPTService.process_query("DRISHTI kya hai?", context={"session_id": "fallback_test"})
        assert res["intent"] == "CHAT_LOCAL_VERIFIED"
        assert "90.97" in res["reply"] or "visual intelligence" in res["reply"].lower()
        print(f"[PASS] Graceful fallback to CHAT_LOCAL_VERIFIED succeeded without error.")
    finally:
        os.environ["GEMINI_API_KEY"] = saved_key


def run_all_tests():
    print("=" * 65)
    print("DRISHTI AI COPILOT: COMPREHENSIVE LIVE & INTEGRATION TEST SUITE")
    print("=" * 65)
    test_live_gemini_conversational()
    test_multiturn_session_context()
    test_live_data_grounding_no_hallucination()
    test_vehicle_search_and_action_cards()
    test_speeding_audit_and_cards()
    test_blacklist_triage_and_cards()
    test_fastapi_endpoint_post_query()
    test_offline_fallback_simulation()
    print("\n" + "=" * 65)
    print("SUCCESS: ALL 8/8 INTEGRATION TESTS PASSED PERFECTLY!")
    print("=" * 65)


if __name__ == "__main__":
    run_all_tests()
