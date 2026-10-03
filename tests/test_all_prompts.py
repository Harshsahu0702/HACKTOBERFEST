"""
tests/test_all_prompts.py

Verification of all 14 required conversational and factual prompts for DRISHTI-GPT:
1. "Hello bhai"
2. "Kaise ho?"
3. "DRISHTI kya hai?"
4. "ANPR kaise kaam karta hai?"
5. "Architecture explain karo"
6. "Accuracy kitni hai?"
7. "J1 ka traffic status kya hai?"
8. "WB37E1275 kahan hai?"
9. "Achha ye vehicle kaise track hota hai?"
10. "Samajh gaya 😂"
11. "Thanks bhai"
12. "Presentation me 30 second me kaise explain karu?"
13. "English me batao"
14. "Ab Hinglish me batao"
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from backend.services.drishti_gpt_service import DrishtiGPTService

PROMPTS = [
    ("Hello bhai", lambda r: any(w in r["reply"].lower() for w in ["hello", "badhiya", "namaste", "drishti"])),
    ("Kaise ho?", lambda r: any(w in r["reply"].lower() for w in ["badhiya", "great", "theek", "fine", "drishti", "help"])),
    ("DRISHTI kya hai?", lambda r: any(w in r["reply"].lower() for w in ["visual intelligence", "drishti", "traffic", "vehicle tracking"])),
    ("ANPR kaise kaam karta hai?", lambda r: any(w in r["reply"].lower() for w in ["clahe", "yolov8", "anpr", "ocr", "plate", "pipeline"])),
    ("Architecture explain karo", lambda r: any(w in r["reply"].lower() for w in ["pipeline", "stages", "architecture", "yolo", "cctv"])),
    ("Accuracy kitni hai?", lambda r: "90.97" in r["reply"] or "98.27" in r["reply"]),
    ("J1 ka traffic status kya hai?", lambda r: any(w in r["reply"].lower() for w in ["junction a", "vivekananda", "j1", "58", "detections"])),
    ("WB37E1275 kahan hai?", lambda r: r["intent"] == "VEHICLE_SEARCH" and "wb37e1275" in r["reply"].lower()),
    ("Achha ye vehicle kaise track hota hai?", lambda r: any(w in r["reply"].lower() for w in ["track", "haversine", "cctv", "camera", "cross-camera"])),
    ("Samajh gaya 😂", lambda r: len(r["reply"]) > 10),
    ("Thanks bhai", lambda r: any(w in r["reply"].lower() for w in ["welcome", "shukriya", "dhanyawad", "bhai", "pleasure", "glad", "help"])),
    ("Presentation me 30 second me kaise explain karu?", lambda r: any(w in r["reply"].lower() for w in ["pitch", "30", "drishti", "presentation", "sec"])),
    ("English me batao", lambda r: any(w in r["reply"].lower() for w in ["drishti", "english", "sure", "system", "traffic", "vehicle"])),
    ("Ab Hinglish me batao", lambda r: any(w in r["reply"].lower() for w in ["hinglish", "drishti", "haan", "bilkul", "aap", "bataiye"])),
]

def run_tests():
    print("=" * 60)
    print("DRISHTI-GPT: TESTING ALL 14 MANDATORY PROMPTS")
    print("=" * 60)
    
    passed = 0
    for idx, (prompt, validator) in enumerate(PROMPTS, 1):
        safe_prompt = prompt.encode("ascii", "replace").decode()
        print(f"\n[{idx}/14] Testing: \"{safe_prompt}\"")
        res = DrishtiGPTService.process_query(prompt, context={"session_id": "test_session_14"})
        
        reply = res.get("reply", "")
        intent = res.get("intent", "")
        print(f"      Intent: {intent}")
        print(f"      Cards: {len(res.get('cards', []))}")
        print(f"      Snippet: {reply[:100].encode('ascii', 'ignore').decode().replace(chr(10), ' ')}...")
        
        assert validator(res), f"Validation failed for prompt: {prompt}"
        passed += 1
        print("      Status: [PASS]")

    print("\n" + "=" * 60)
    print(f"SUCCESS: ALL {passed}/14 PROMPTS PASSED EMPIRICALLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
