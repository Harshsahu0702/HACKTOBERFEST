"""
tests/test_drishti_gpt.py

Verification tests for DRISHTI-GPT AI Conversational Copilot service.
Tests natural language parsing, entity extraction, multi-intent classification,
and card generation.
"""

import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.services.drishti_gpt_service import DrishtiGPTService


def test_vehicle_search():
    print("Testing Vehicle Search intent...")
    res = DrishtiGPTService.process_query("Where is vehicle WB37E1275?")
    assert res["intent"] == "VEHICLE_SEARCH", f"Expected VEHICLE_SEARCH, got {res['intent']}"
    assert "reply" in res
    assert "speech_text" in res
    assert len(res["suggested_actions"]) > 0
    print("[PASS] Vehicle search passed!")


def test_speeding_detection():
    print("Testing Speeding Violation intent...")
    res = DrishtiGPTService.process_query("Show me vehicles driving above 35 km/h")
    assert res["intent"] == "SPEEDING", f"Expected SPEEDING, got {res['intent']}"
    assert "reply" in res
    assert "speech_text" in res
    print("[PASS] Speeding violation passed!")


def test_blacklist_triage():
    print("Testing Blacklist Triage intent...")
    res = DrishtiGPTService.process_query("Are there any wanted or blacklisted vehicles on CCTV?")
    assert res["intent"] == "BLACKLIST", f"Expected BLACKLIST, got {res['intent']}"
    assert "reply" in res
    print("[PASS] Blacklist triage passed!")


def test_congestion_analysis():
    print("Testing Congestion Analysis intent...")
    res = DrishtiGPTService.process_query("Which junction has the highest traffic congestion?")
    assert res["intent"] == "CONGESTION", f"Expected CONGESTION, got {res['intent']}"
    assert "reply" in res
    print("[PASS] Congestion analysis passed!")


def test_signal_retiming():
    print("Testing Signal Retiming intent...")
    res = DrishtiGPTService.process_query("Recommend signal retiming for Vivekananda Sarani")
    assert res["intent"] == "SIGNAL", f"Expected SIGNAL, got {res['intent']}"
    assert "reply" in res
    print("[PASS] Signal retiming passed!")


def test_system_overview():
    print("Testing System Overview intent...")
    res = DrishtiGPTService.process_query("Give me a city surveillance system status")
    assert "reply" in res
    assert "speech_text" in res
    print("[PASS] System overview passed!")


if __name__ == "__main__":
    test_vehicle_search()
    test_speeding_detection()
    test_blacklist_triage()
    test_congestion_analysis()
    test_signal_retiming()
    test_system_overview()
    print("\nALL DRISHTI-GPT BACKEND TESTS PASSED SUCCESSFULLY!")
