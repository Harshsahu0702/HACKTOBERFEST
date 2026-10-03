#!/usr/bin/env python3
"""
scripts/evaluate_ocr.py

Rigorous OCR & ANPR Accuracy Evaluation Utility for DRISHTI.
Compares predicted plate strings from detections.json against an optional
ground-truth annotation dataset.

Technically honest:
- If ground truth is not provided, outputs "Ground-truth evaluation dataset not configured".
- Never fabricates or hallucinates accuracy numbers.
"""

import sys
import json
import csv
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional
from collections import defaultdict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DETECTIONS_FILE = PROJECT_ROOT / "dataset" / "metadata" / "detections.json"


def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate character-level edit distance between two plate strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def evaluate_ocr(ground_truth_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Evaluate OCR accuracy against provided ground truth file.
    Ground truth format: CSV with columns (image_name / detection_id, true_plate).
    """
    if not DETECTIONS_FILE.exists():
        return {
            "status": "error",
            "message": f"Detections file not found: {DETECTIONS_FILE}"
        }

    with open(DETECTIONS_FILE, "r", encoding="utf-8") as f:
        detections = json.load(f)

    predicted_plates = {}
    for d in detections:
        plate = d.get("plate")
        det_id = d.get("detection_id")
        img_name = Path(d.get("plate_image", "")).name if d.get("plate_image") else None

        if plate and det_id:
            predicted_plates[det_id] = plate
        if plate and img_name:
            predicted_plates[img_name] = plate

    if not ground_truth_path or not ground_truth_path.exists():
        return {
            "status": "not_configured",
            "message": "Ground-truth evaluation dataset not configured",
            "total_detections_evaluated": len(predicted_plates),
            "ground_truth_samples": 0,
            "exact_match_accuracy": None,
            "character_accuracy": None
        }

    # Load ground truth CSV
    gt_pairs = []
    try:
        with open(ground_truth_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                key = row.get("id") or row.get("image") or row.get("detection_id") or row.get("filename")
                true_p = row.get("plate") or row.get("true_plate")
                cond = row.get("condition") or "standard_daylight"
                if key and true_p:
                    gt_pairs.append((key.strip(), true_p.strip().upper(), cond.strip()))
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to parse ground truth file: {e}"
        }

    if not gt_pairs:
        return {
            "status": "not_configured",
            "message": "Ground-truth file contained no valid evaluation rows",
            "ground_truth_samples": 0
        }

    exact_matches = 0
    total_char_dist = 0
    total_chars = 0
    evaluated_samples = 0
    failures = []

    for key, true_p, cond in gt_pairs:
        pred_p = predicted_plates.get(key)
        if pred_p:
            evaluated_samples += 1
            pred_clean = pred_p.replace(" ", "").upper()
            true_clean = true_p.replace(" ", "").upper()

            if pred_clean == true_clean:
                exact_matches += 1
            else:
                failures.append({
                    "id": key,
                    "predicted": pred_clean,
                    "ground_truth": true_clean
                })

            dist = levenshtein_distance(pred_clean, true_clean)
            total_char_dist += dist
            total_chars += max(len(pred_clean), len(true_clean))

    # Condition Breakdown
    condition_stats = defaultdict(lambda: {"total": 0, "exact": 0, "char_dist": 0, "total_chars": 0})
    for item in gt_pairs:
        key, true_p, cond = item
        pred_p = predicted_plates.get(key)
        if pred_p:
            pred_clean = pred_p.replace(" ", "").upper()
            true_clean = true_p.replace(" ", "").upper()
            st = condition_stats[cond]
            st["total"] += 1
            if pred_clean == true_clean:
                st["exact"] += 1
            dist = levenshtein_distance(pred_clean, true_clean)
            st["char_dist"] += dist
            st["total_chars"] += max(len(pred_clean), len(true_clean))

    breakdown = {}
    for cond, st in condition_stats.items():
        cond_exact = round((st["exact"] / st["total"] * 100), 2) if st["total"] > 0 else 0.0
        cond_char = round(((st["total_chars"] - st["char_dist"]) / st["total_chars"] * 100), 2) if st["total_chars"] > 0 else 0.0
        breakdown[cond] = {
            "samples": st["total"],
            "exact_matches": st["exact"],
            "exact_accuracy_pct": cond_exact,
            "character_accuracy_pct": cond_char
        }

    exact_acc = round((exact_matches / evaluated_samples * 100), 2) if evaluated_samples > 0 else 0.0
    char_acc = round(((total_chars - total_char_dist) / total_chars * 100), 2) if total_chars > 0 else 0.0

    report = {
        "status": "evaluated",
        "benchmark_name": "DRISHTI High-Precision ANPR & OCR Accuracy Benchmark",
        "compliance_target": "SIH 2026 Problem 26127 (>90% accuracy across real-world conditions)",
        "target_met": char_acc >= 90.0,
        "total_samples": evaluated_samples,
        "exact_matches": exact_matches,
        "incorrect_matches": evaluated_samples - exact_matches,
        "exact_match_accuracy_pct": exact_acc,
        "character_level_accuracy_pct": char_acc,
        "condition_breakdown": breakdown,
        "failures_sample": failures[:10]
    }

    # Save to benchmark report JSON
    output_report_path = PROJECT_ROOT / "benchmark" / "ocr_benchmark_report.json"
    output_report_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(output_report_path, "w", encoding="utf-8") as rf:
            json.dump(report, rf, indent=2)
    except Exception as e:
        print(f"[evaluate_ocr] Warning: could not write {output_report_path}: {e}")

    return report


def main():
    parser = argparse.ArgumentParser(description="Evaluate OCR accuracy for DRISHTI")
    parser.add_argument(
        "--ground-truth",
        "-g",
        type=str,
        default=str(PROJECT_ROOT / "dataset" / "metadata" / "ground_truth_ocr.csv"),
        help="Path to CSV containing ground-truth plate annotations"
    )
    args = parser.parse_args()

    gt_path = Path(args.ground_truth)
    if not gt_path.exists():
        # Fallback check
        alt = PROJECT_ROOT / "dataset" / "metadata" / "ground_truth_ocr.csv"
        if alt.exists():
            gt_path = alt

    result = evaluate_ocr(gt_path)

    print("\n=======================================================")
    print("   DRISHTI ANPR & OCR REAL-WORLD ACCURACY BENCHMARK   ")
    print("    Smart India Hackathon 2026 - Problem ID: 26127     ")
    print("=======================================================")
    if result["status"] == "not_configured":
        print(f"Status: {result['message']}")
        print(f"Total Plate Detections in Catalog: {result.get('total_detections_evaluated', 0)}")
        print("\nNotice: Accuracy statistics are not fabricated without ground truth.")
        print("To run with ground truth: python scripts/evaluate_ocr.py -g path/to/ground_truth.csv")
    elif result["status"] == "evaluated":
        print(f"Total Samples Evaluated:      {result['total_samples']}")
        print(f"Exact Matches:                {result['exact_matches']}")
        print(f"Exact Match Accuracy:         {result['exact_match_accuracy_pct']}%")
        print(f"Character-Level Accuracy:     {result['character_level_accuracy_pct']}%")
        print(f"Target (>90% Accuracy):       {'PASS (TARGET MET)' if result['target_met'] else 'FAIL'}")
        print("-------------------------------------------------------")
        print("Breakdown by Real-World Operational Conditions:")
        for cond, stats in result.get("condition_breakdown", {}).items():
            c_name = cond.replace('_', ' ').title()
            print(f"  [+] {c_name:24} : {stats['character_accuracy_pct']:6.2f}% char acc ({stats['samples']} samples)")
    else:
        print(f"Error: {result['message']}")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
