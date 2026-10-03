# DRISHTI — Multimodal Traffic Intelligence
### Powered by Computer Vision, ANPR & Google Cloud Gemma 4

[![Project: Personal](https://img.shields.io/badge/Project-Personal%20Project-blue.svg)](LICENSE)
[![Author: Harsh Sahu](https://img.shields.io/badge/Author-Harsh%20Sahu-blueviolet.svg)](https://github.com/Harshsahu0702)
[![Hacktoberfest 2026](https://img.shields.io/badge/Hacktoberfest-2026-orange.svg)](https://hacktoberfest.com/)
[![MLH Hack Day](https://img.shields.io/badge/MLH-Asansol%20x%20Hacktropica-red.svg)](https://mlh.com/)
[![Model: Gemma 4](https://img.shields.io/badge/Google%20Cloud-Gemma%204%20(26B%20MoE)-8A2BE2.svg)](https://ai.google.dev/gemma)
[![OCR Accuracy: 90.97%](https://img.shields.io/badge/OCR%20Exact%20Match-90.97%25-brightgreen.svg)](evaluation/)

**Official Submission for Hacktoberfest Hack Day: Asansol × Hacktropica (Major League Hacking)**  
*Challenge: Best Use of Gemma 4 (Google Cloud)*

---

## 🏛️ System Overview

**DRISHTI** (*Digital Real-time Intelligent Surveillance & Highway Traffic Intelligence*) bridges high-throughput **computational perception** and cognitive **multimodal reasoning**. 

Built directly on real 1080p CCTV footage captured across the arterial corridors of **Asansol, West Bengal** (**Junction A: Vivekananda Sarani** and **Junction B: Kanyapur Link Road**), DRISHTI pairs YOLOv8/11 vehicle detection and 90.97% accurate PaddleOCR with Google's natively multimodal **Gemma 4** (`gemma-4-26b-a4b-it`).

$$\text{Computer Vision} + \text{ANPR/OCR} + \text{Trajectory Tracking} + \textbf{Gemma 4 Reasoning} = \textbf{Explainable Traffic Intelligence}$$

```
                           CCTV VIDEO STREAMS (4 Asansol Nodes)
                                           │
                                           ▼
                               YOLOv8/11 Vehicle Detection
                                           │
                                           ▼
                             Plate Crop & CLAHE Enhancement
                                           │
                                           ▼
                               PaddleOCR Alphanumeric Engine
                              (90.97% Empirically Validated)
                                           │
                                           ▼
                             Haversine Kinematic Speed Engine
                           (408.4m Arterial Corridor Transit)
                                           │
                                           ▼
                               Deterministic Anomaly Engine
                           (Simultaneous Sightings & Speed Skew)
                                           │
                                           ▼
                     ★ GOOGLE CLOUD GEMMA 4 MULTIMODAL LAYER ★
                          (gemma-4-26b-a4b-it via Gemini API)
                   ├── 1. Multimodal Scene Understanding (Vision + Telemetry)
                   ├── 2. Forensic Incident Root-Cause Explainer
                   ├── 3. Grounded "Ask DRISHTI" Operator Terminal
                   └── 4. One-Click Executive Traffic Intelligence Reports
                                           │
                                           ▼
                             React 19 + Cyber HUD Command Deck
```

---

## 💡 Why Gemma 4?

Gemma 4 is not a cosmetic chatbot in DRISHTI — it is the **cognitive decision engine**:

1. **Native Multimodality (Vision + Text):** Gemma 4 ingests live 1080p camera frames (JPEG) together with YOLO bounding box coordinates to reason about traffic density, queue spillovers, and lane blockages simultaneously.
2. **High Intelligence-per-Parameter (26B MoE with 4B Active):** Provides sub-2-second inference latency, essential for operational traffic command centers.
3. **Deterministic Grounding & Schema Adherence:** Operating under strict system instruction harnesses, Gemma 4 outputs structured JSON conforming to legal schemas without fabricating plate identities or non-existent incidents.
4. **State-of-the-Art Architecture:** Ensures real-time edge and server deployment with high efficiency and robust reasoning capabilities.

---

## 🌟 Key Capabilities

### 1. Multimodal Traffic Scene Understanding
- Ingests visual CCTV frames alongside detector telemetry (`car: 4, motorcycle: 2`).
- Automatically categorizes Relative Congestion Index (RCI) and identifies lane occupancy and directional flow.

### 2. Forensic Incident Explanation
- Translates raw kinematic anomalies (e.g., vehicle sighted at Junction A and Junction B within 0.3 seconds across 408m) into plain English forensic explanations.
- Diagnoses **cloned license plate fraud** and recommends law enforcement interception vectors.
- Section 65B Indian Evidence Act certified with SHA-256 tamper-evident frame hashes.

### 3. Grounded "Ask DRISHTI" Operator Terminal
- Natural-language Q&A interface strictly grounded in DRISHTI's relational MySQL database.
- Answers questions about corridor speed, busiest nodes, and active threats with zero hallucination.

### 4. One-Click Executive AI Reports
- Synthesizes corridor mobility matrices, peak congestion intervals, and traffic violations into official, printable Markdown and PDF dossiers.

### 5. Custom Traffic Frame Inspector
- Allows operators to upload arbitrary traffic photos from smartphones or external CCTV feeds for instant multimodal breakdown.

---

## 📊 Technical Benchmarks (Empirically Validated)

- **OCR Exact Match Accuracy**: **90.97%** (131 / 144 verified plate crops on real Asansol CCTV feeds)
- **Character-Level Accuracy**: **98.27%**
- **Average OCR Confidence**: **90.6%**
- **Perception Pipeline Latency**: **450.1 ms/frame** (YOLO: 221.0 ms, Plate Detection: 202.5 ms, OCR: 9.4 ms, DB: 1.2 ms)
- **Gemma 4 Multimodal Reasoning Latency**: **1.4s – 1.9s**
- **Active CCTV Nodes**: 4 Cameras across 2 Junctions in Asansol (Vivekananda Sarani & Kanyapur Link Road)
- **Corridor Distance**: 408.4 meters (Haversine validated)

---

## 🚀 Setup & Execution Guide

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- Google Gemini API Key (with Gemma 4 access)
- (Optional) MySQL Server 8.0 (system includes automated JSON fallback)

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```

Ensure `.env` contains your Google AI Studio API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemma-4-26b-a4b-it
GEMMA_BACKEND=gemini_api
GEMMA_THINKING_LEVEL=minimal
```

### 3. Setup Python Backend Environment
```bash
python -m venv .venv

# Activate virtual environment:
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

### 4. Start Backend REST API
```bash
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```
Interactive Swagger API documentation: `http://127.0.0.1:8000/docs`

### 5. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
Open browser at: `http://localhost:5173/`

Navigate to the **"AI Intelligence [GEMMA 4]"** tab to explore multimodal scene reasoning, incident explanations, and report generation.

---

## 🧪 Benchmark & Verification Commands

```bash
# Verify Gemma 4 multimodal API connectivity
python scratch/test_gemma4_multimodal.py

# Run full Gemma 4 unit test suite
python scratch/test_service_unit.py

# Pre-warm canonical demo cache for zero-latency presentation
python scratch/prewarm_cache.py

# Reproduce ANPR Accuracy Benchmark (>90% accuracy on Asansol feeds)
python evaluation/evaluate_ocr.py
```

---

## 📁 Repository Structure

```
drishti/
├── backend/                             # FastAPI application & intelligence services
│   ├── app.py                           # REST API routes (including /api/ai/*)
│   ├── database/                        # SQLAlchemy relational models
│   ├── pipeline/                        # YOLO & PaddleOCR pipeline
│   └── services/
│       ├── gemma_intelligence_service.py # ★ Core Gemma 4 Multimodal Service
│       ├── analytics_engine.py          # Relative Congestion Index (RCI) & OD matrix
│       ├── anomaly_service.py           # Deterministic kinematic anomaly engine
│       ├── plate_search_service.py      # Cross-camera vehicle journey builder
│       └── yolo_evidence_service.py     # Bounding box extraction & telemetry
├── frontend/                            # React 19 + Vite command deck
│   └── src/
│       ├── components/
│       │   ├── AiIntelligencePanel.jsx   # ★ Gemma 4 Multi-Tab Workbench
│       │   ├── AiIntelligencePanel.css   # Cyber HUD styling tokens
│       │   ├── Header.jsx               # Navigation bar with GEMMA 4 badge
│       │   ├── CameraGrid.jsx           # 4-node CCTV synchronized video grid
│       │   └── MapView.jsx              # 2D Tactical GIS Asansol corridor map
│       └── services/api.js              # REST client with AI Intelligence endpoints
├── dataset/                             # Real MP4 CCTV feeds from Asansol, WB
│   ├── junction_A/                      # Vivekananda Sarani (Inbound/Outbound)
│   ├── junction_B/                      # Kanyapur Link Road (Inbound/Outbound)
│   └── metadata/                        # Ground-truth camera coordinates & detections
├── static/                              # Evidence plate crops & cached keyframes
├── CONTRIBUTING.md                      # Hacktoberfest contributor guidelines
├── LICENSE                              # Apache License 2.0
└── README.md                            # System documentation
```

---

## 📜 Open-Source License

This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for details.
