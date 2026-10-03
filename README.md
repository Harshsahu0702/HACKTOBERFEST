# DRISHTI — Multimodal Traffic Intelligence
### Powered by Computer Vision, ANPR & Google Cloud Gemma 4

[![Project: Personal](https://img.shields.io/badge/Project-Personal%20Project-blue.svg)](LICENSE)
[![Author: Harsh Sahu](https://img.shields.io/badge/Author-Harsh%20Sahu-blueviolet.svg)](https://github.com/Harshsahu0702)
[![Hacktoberfest 2026](https://img.shields.io/badge/Hacktoberfest-2026-orange.svg)](https://hacktoberfest.com/)
[![MLH Hack Day](https://img.shields.io/badge/MLH-Asansol%20x%20Hacktropica-red.svg)](https://mlh.com/)
[![Live Web App](https://img.shields.io/badge/Live%20Web%20App-Vercel-black?logo=vercel)](https://hacktoberfest-drishti0702.vercel.app)
[![Cloud Backend](https://img.shields.io/badge/Cloud%20Backend-Railway-0B0D0E?logo=railway)](https://web-production-deb65.up.railway.app)
[![Model: Gemma 4](https://img.shields.io/badge/Google%20Cloud-Gemma%204%20(26B%20MoE)-8A2BE2.svg)](https://ai.google.dev/gemma)
[![OCR Accuracy: 90.97%](https://img.shields.io/badge/OCR%20Exact%20Match-90.97%25-brightgreen.svg)](evaluation/)

**Official Submission for Hacktoberfest Hack Day: Asansol × Hacktropica (Major League Hacking)**  
*Challenge Track: Best Use of Gemma 4 (Google Cloud)*

- 🌐 **Live Web Application:** [https://hacktoberfest-drishti0702.vercel.app](https://hacktoberfest-drishti0702.vercel.app)
- ⚙️ **Production REST API:** [https://web-production-deb65.up.railway.app](https://web-production-deb65.up.railway.app)

---

## 🏛️ System Overview

**DRISHTI** (*Digital Real-time Intelligent Surveillance & Highway Traffic Intelligence*) bridges high-throughput **computational perception** and cognitive **multimodal reasoning**. 

Built directly on real 1080p CCTV footage captured across the arterial corridors of **Asansol, West Bengal** (**Junction A: Vivekananda Sarani** and **Junction B: Kanyapur Link Road**), DRISHTI pairs YOLOv8/11 vehicle detection and 90.97% accurate PaddleOCR with Google's natively multimodal **Gemma 4** (`gemma-4-26b-a4b-it`).

$$\text{Computer Vision} + \text{ANPR/OCR} + \text{Telemetry} + \textbf{Google Gemma 4 Reasoning} = \textbf{Explainable Traffic Intelligence}$$

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
                     ★ GOOGLE CLOUD GEMMA 4 MULTIMODAL LAYER ★
                          (gemma-4-26b-a4b-it via Gemini API)
                   ├── 1. Multimodal Scene Understanding (CCTV Vision + Telemetry)
                   └── 2. Custom Traffic Frame Inspector (Upload + Vision Reasoning)
                                           │
                                           ▼
                             React 19 + Cyber HUD Command Deck
```

---

## 💡 Why Gemma 4?

Google Cloud's **Gemma 4** (`gemma-4-26b-a4b-it`) serves as the **core cognitive decision engine** in DRISHTI, moving beyond simple classification into nuanced, human-level situational reasoning:

1. **Native Multimodality (Vision + Ground-Truth Telemetry):** Gemma 4 directly ingests high-definition CCTV frames (JPEG) simultaneously with verified bounding box telemetry, number plate readings, and temporal bookmarks to reason about congestion density, lane utilization, and safety hazards in one pass.
2. **High Intelligence-per-Parameter (26B MoE with 4B Active):** Delivers deep cognitive reasoning at blazing speeds with sub-2-second cloud inference latency, ideal for real-time traffic monitoring consoles.
3. **Strict Schema Adherence:** Governed by specialized prompt harnesses, Gemma 4 outputs deterministic, structured JSON with zero hallucinated plate identities.
4. **Generalization to Unseen Roadways:** In the Custom Frame Inspector, Gemma 4 instantly understands arbitrary traffic scenes — identifying pedestrians, vulnerable cyclists, auto-rickshaws, and signal countdowns without task-specific retraining.

---

## 🌟 Key Gemma 4 Multimodal Capabilities

### 1. Multimodal CCTV Traffic Scene Understanding
- Ingests synchronized 1080p CCTV snapshots across 4 cameras between Vivekananda Sarani and Kanyapur Link Road.
- Combines visual pixels with live database telemetry (`detected_plates`, vehicle classes, bounding box densities).
- Automatically categorizes congestion level (`LOW`, `MODERATE`, `HIGH`, `SEVERE`), evaluates lane discipline, identifies roadway hazards, and provides clarity assessments.
- Quick-jump timeline bookmarks allow instant navigation across key traffic sightings.

### 2. Custom Traffic Frame Inspector
- Allows operators to upload arbitrary traffic photos from smartphones, external CCTV nodes, dashcams, or road surveys.
- Features a real-time **cyberpunk laser scanline overlay** and animated **multimodal reasoning radar checklist** during analysis.
- Gemma 4 analyzes the frame to provide:
  - **Scene Description**: Detailed breakdown of roadway, pedestrian crossings, signal timers, and vehicle compositions.
  - **Apparent Traffic Density**: Categorization of corridor capacity.
  - **Road & Environmental Conditions**: Surface status, lighting, weather, and visibility.
  - **Actionable Insights**: Specific situational recommendations for traffic safety and hazard prevention.

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

Navigate to the **"AI Intelligence [GEMMA 4]"** tab to explore real-time multimodal scene reasoning across synchronized CCTV nodes and inspect custom traffic frames.

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
