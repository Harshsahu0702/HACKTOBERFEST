# DRISHTI — ANPR & OCR Accuracy Evaluation Benchmark
**SIH 2026 Problem Statement 26127**  
*City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking and Urban Traffic Analytics*

---

## 1. Overview
This module experimentally validates the ANPR recognition accuracy of the DRISHTI pipeline against real-world CCTV footage collected from 4 cameras across two major arterial junctions in Asansol:
- **Vivekananda Sarani** (Junction A — Cameras 01 & 02)
- **Kanyapur Link Road** (Junction B — Cameras 01 & 02)

The benchmark complies strictly with SIH 2026 guidelines requiring **>90% verified OCR accuracy** without hardcoded or fabricated numbers.

---

## 2. Benchmark Metrics

| Metric | Formula / Definition | Measured Value | SIH Target | Status |
|---|---|---|---|---|
| **Exact Plate Accuracy** | `Exact Matches / Total Verified Samples` | **90.97%** | >90.0% | **MET** |
| **Character-Level Accuracy** | `1.0 - (Levenshtein Distance / Total Chars)` | **98.27%** | >95.0% | **MET** |
| **Average OCR Confidence** | Mean token recognition confidence | **90.6%** | >85.0% | **MET** |
| **Total Evaluation Samples** | Manually verified ground-truth plates | **144** | 100–300 | **MET** |
| **Failed Recognitions** | Unmatched or low-confidence samples | **13** | Minimal | **MET** |

---

## 3. Directory Structure

```
evaluation/
├── crops/                      # Real plate crops extracted from CCTV videos
│   ├── DET_000004.jpg
│   ├── DET_000005.jpg
│   └── ... (144 crop images)
├── ground_truth.csv            # Verified ground truth plate catalog
├── extract_plate_crops.py      # Automated crop extraction from MP4 feeds
├── evaluate_ocr.py             # Reproducible evaluation script
├── evaluation_report.json      # Structured JSON benchmark results
└── README.md                   # Benchmark documentation
```

---

## 4. How to Reproduce

### Step 1: Extract Plate Crops (if modifying dataset)
```bash
python evaluation/extract_plate_crops.py
```

### Step 2: Run the Benchmark
```bash
python evaluation/evaluate_ocr.py
```

The script will read `evaluation/ground_truth.csv`, execute the preprocessing and normalization pipeline, compute accuracy metrics, and regenerate `evaluation/evaluation_report.json`.
