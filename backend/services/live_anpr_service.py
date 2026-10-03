"""
backend/services/live_anpr_service.py

DRISHTI — Real-Time Live Laptop Webcam ANPR & Optical Text Recognition Service.
Designed for SIH 2026 / PS 26127.

Features:
1. Dual-Engine Architecture:
   - Engine A: Ultralytics YOLO License Plate Detector (models/license_plate.pt)
   - Engine B: PaddleOCR PP-OCRv6 for character-level precision and direct scene text
2. Multi-Target Detection:
   - Reads vehicle license plates held up to laptop camera (paper, phone screen, car photo, physical plate)
   - Reads ANY arbitrary text shown in camera (signs, documents, handwriting, badges)
3. Instant Intelligence Enrichment:
   - Standard Indian RTO / Bharat Series regex pattern validation & formatting
   - Automatic Blacklist & Watchlist cross-referencing (flags stolen/wanted vehicles immediately)
   - VAHAN 4.0 National Vehicle Registry data lookup (make, model, owner, RTO, insurance)
4. Session Scan History & Audit Trail
"""

import os
import re
import io
import time
import uuid
import base64
import threading
import numpy as np
from PIL import Image

try:
    import cv2
    CV2_AVAILABLE = True
except Exception as _cv2_err:
    print(f"[LiveANPR Notice] cv2 not available ({_cv2_err}). Using PIL fallback.")
    CV2_AVAILABLE = False
    cv2 = None
import threading
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PLATE_MODEL_PATH = PROJECT_ROOT / "models" / "license_plate.pt"
HISTORY_LOG_FILE = PROJECT_ROOT / "runs" / "detect" / "live_webcam_history.json"


# Indian State RTO Codes
INDIAN_STATE_CODES = {
    "AN", "AP", "AR", "AS", "BR", "CH", "CG", "DD", "DL", "DN", "GA", "GJ",
    "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH", "ML", "MN", "MP",
    "MZ", "NL", "OD", "PB", "PY", "RJ", "SK", "TN", "TR", "TS", "UK", "UP", "WB"
}

# Regex for Indian Vehicle Plates
REGEX_STANDARD_PLATE = re.compile(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{0,3})([0-9]{4})$")
REGEX_BHARAT_PLATE = re.compile(r"^([0-9]{2})(BH)([0-9]{4})([A-Z]{1,2})$")


class LiveANPRService:
    """Singleton service for real-time live webcam ANPR & OCR inference."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(LiveANPRService, cls).__new__(cls)
                cls._instance._init_service()
            return cls._instance

    def _init_service(self):
        self.yolo_model = None
        self.ocr_engine = None
        self.models_loaded = False
        self.loading_lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self.scan_history: List[Dict[str, Any]] = []
        self._load_persisted_history()

        # Start warm-up in a daemon thread so backend startup is instant
        threading.Thread(target=self._ensure_models_loaded, daemon=True).start()

    def _ensure_models_loaded(self):
        if self.models_loaded:
            return True

        with self.loading_lock:
            if self.models_loaded:
                return True

            try:
                print("[LiveANPR] Initializing YOLO License Plate Detector...")
                if PLATE_MODEL_PATH.exists():
                    from ultralytics import YOLO
                    self.yolo_model = YOLO(str(PLATE_MODEL_PATH))
                    print(f"[LiveANPR] YOLO model loaded from {PLATE_MODEL_PATH.name}")
                else:
                    print(f"[LiveANPR Warning] Plate model not found at {PLATE_MODEL_PATH}")

                print("[LiveANPR] Initializing PaddleOCR Engine...")
                from paddleocr import PaddleOCR
                self.ocr_engine = PaddleOCR(
                    lang="en",
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=True,
                    enable_mkldnn=False,
                )
                print("[LiveANPR] PaddleOCR initialized successfully with multi-angle text orientation and stable CPU executor.")

                # Warmup inference
                dummy = np.full((120, 360, 3), 240, dtype=np.uint8)
                if CV2_AVAILABLE and cv2 is not None:
                    try:
                        cv2.putText(dummy, "MH 12 DE 1433", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
                    except Exception:
                        pass
                if self.yolo_model:
                    self.yolo_model.predict(dummy, verbose=False)
                if self.ocr_engine:
                    self.ocr_engine.predict(dummy)

                self.models_loaded = True
                print("[LiveANPR] AI Engines fully warmed up and ready for live webcam stream!")
                return True
            except Exception as e:
                print(f"[LiveANPR Error] Model loading failed: {e}")
                return False

    def is_ready(self) -> bool:
        return self.models_loaded

    def _load_persisted_history(self):
        try:
            if HISTORY_LOG_FILE.exists():
                import json
                with open(HISTORY_LOG_FILE, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                if isinstance(raw, list):
                    noise_set = {"IND", "INDIA", "TARGET", "BRACKETS", "1000", "210", "ALIGN"}
                    self.scan_history = [
                        x for x in raw
                        if isinstance(x, dict)
                        and x.get("is_vehicle_plate")
                        and len(x.get("cleaned_text", "")) >= 5
                        and x.get("cleaned_text") not in noise_set
                    ]
                else:
                    self.scan_history = []
        except Exception:
            self.scan_history = []

    def _save_history(self):
        try:
            import json
            HISTORY_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(HISTORY_LOG_FILE, "w", encoding="utf-8") as f:
                json.dump(self.scan_history[-100:], f, indent=2)
        except Exception:
            pass

    @staticmethod
    def clean_alphanumeric(text: str) -> str:
        """Strip non-alphanumeric characters and uppercase."""
        if not text:
            return ""
        return re.sub(r"[^A-Za-z0-9]", "", str(text)).upper()

    @classmethod
    def parse_indian_plate(cls, raw_clean: str) -> Tuple[bool, str, Dict[str, str]]:
        """
        Validate and format Indian number plates.
        Returns: (is_valid, formatted_display, meta)
        """
        text = cls.clean_alphanumeric(raw_clean)
        if len(text) < 6 or len(text) > 11:
            return False, raw_clean, {}

        # 1. Standard format: DL 01 AB 1234 or WB 38 C 5030
        m = REGEX_STANDARD_PLATE.match(text)
        if m:
            state, rto, series, num = m.groups()
            if state in INDIAN_STATE_CODES:
                formatted = f"{state} {rto} {series} {num}".replace("  ", " ").strip()
                return True, formatted, {
                    "type": "Standard State RTO",
                    "state_code": state,
                    "rto_code": f"{state}{rto}",
                    "series": series,
                    "number": num,
                }

        # 2. Bharat Series: 22 BH 1234 AA
        m2 = REGEX_BHARAT_PLATE.match(text)
        if m2:
            year, bh, num, series = m2.groups()
            formatted = f"{year} {bh} {num} {series}"
            return True, formatted, {
                "type": "Bharat Series (BH)",
                "year": f"20{year}",
                "series": series,
                "number": num,
            }

        return False, text, {}

    def _enhance_crop(self, crop: np.ndarray) -> np.ndarray:
        """Apply CLAHE contrast stretching & bilateral denoising for high-accuracy OCR."""
        if crop is None or crop.size == 0:
            return crop
        if not CV2_AVAILABLE or cv2 is None:
            return crop
        try:
            h, w = crop.shape[:2]
            # Upscale if very small
            if h < 64 or w < 160:
                scale = max(64.0 / h, 160.0 / w, 2.0)
                crop = cv2.resize(crop, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)

            # Convert to LAB for luminance CLAHE
            lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            merged = cv2.merge((cl, a, b))
            enhanced = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
            return enhanced
        except Exception:
            return crop

    def process_frame(
        self,
        image_data: Any,
        min_confidence: float = 0.25,
        mirror_flip: bool = False,
    ) -> Dict[str, Any]:
        """
        Process a live video frame from laptop webcam.
        Drops overlapping frames if inference engine is currently busy (avoids queuing lag).
        """
        if not self._inference_lock.acquire(blocking=False):
            return {
                "success": True,
                "has_detection": False,
                "detections_count": 0,
                "detections": [],
                "primary": None,
                "busy": True,
                "message": "AI Engine busy",
            }

        try:
            return self._process_frame_internal(image_data, min_confidence, mirror_flip)
        finally:
            self._inference_lock.release()

    def _process_frame_internal(
        self,
        image_data: Any,
        min_confidence: float = 0.25,
        mirror_flip: bool = False,
    ) -> Dict[str, Any]:
        """
        Internal single-frame inference logic.
        """
        start_time = time.time()
        self._ensure_models_loaded()

        # 1. Decode image
        frame = None
        if isinstance(image_data, str):
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            try:
                img_bytes = base64.b64decode(image_data)
                if CV2_AVAILABLE and cv2 is not None:
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if frame is None:
                    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                    frame = np.array(pil_img)[:, :, ::-1].copy()
            except Exception as e:
                return {"success": False, "error": f"Failed to decode base64 image: {e}"}
        elif isinstance(image_data, bytes):
            try:
                if CV2_AVAILABLE and cv2 is not None:
                    nparr = np.frombuffer(image_data, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if frame is None:
                    pil_img = Image.open(io.BytesIO(image_data)).convert("RGB")
                    frame = np.array(pil_img)[:, :, ::-1].copy()
            except Exception as e:
                return {"success": False, "error": f"Failed to decode image bytes: {e}"}
        elif isinstance(image_data, np.ndarray):
            frame = image_data.copy()

        if frame is None or frame.size == 0:
            return {"success": False, "error": "Invalid or empty image frame received."}

        # Optional horizontal mirror flip (often needed if user webcam stream is un-mirrored)
        if mirror_flip:
            frame = cv2.flip(frame, 1) if (CV2_AVAILABLE and cv2 is not None) else np.fliplr(frame).copy()

        frame_h, frame_w = frame.shape[:2]

        def _scan_single_orientation(scan_frame: np.ndarray, is_flipped_coords: bool = False):
            cur_detections = []
            cur_seen = set()

            # STAGE 1: YOLO License Plate Detector
            yolo_dets = []
            if self.yolo_model is not None:
                try:
                    yolo_res = self.yolo_model.predict(scan_frame, conf=min_confidence, verbose=False)
                    for r in yolo_res:
                        if r.boxes is not None:
                            for box in r.boxes:
                                xyxy = box.xyxy[0].cpu().numpy().astype(int)
                                x1, y1, x2, y2 = xyxy
                                x1 = max(0, min(x1, frame_w - 1))
                                y1 = max(0, min(y1, frame_h - 1))
                                x2 = max(0, min(x2, frame_w))
                                y2 = max(0, min(y2, frame_h))
                                if x2 > x1 and y2 > y1:
                                    conf = float(box.conf[0].item())
                                    yolo_dets.append({
                                        "bbox": [int(x1), int(y1), int(x2), int(y2)],
                                        "det_conf": conf,
                                    })
                except Exception as e:
                    print(f"[LiveANPR YOLO Error] {e}")

            # Sort YOLO detections by confidence descending, take top 2
            yolo_dets.sort(key=lambda d: d["det_conf"], reverse=True)

            # OCR crops from YOLO plates
            for det in yolo_dets[:2]:
                x1, y1, x2, y2 = det["bbox"]
                crop = scan_frame[y1:y2, x1:x2]
                if crop.size == 0:
                    continue

                crop_enhanced = self._enhance_crop(crop)
                flipped_crop = cv2.flip(crop_enhanced, 1) if (CV2_AVAILABLE and cv2 is not None) else np.fliplr(crop_enhanced).copy()
                crops_to_try = [(crop_enhanced, False), (flipped_crop, True)]
                found_valid_in_crop = False

                for test_crop, _ in crops_to_try:
                    if self.ocr_engine is None:
                        break
                    try:
                        ocr_res = self.ocr_engine.predict(test_crop)
                        for item in ocr_res:
                            data = getattr(item, "json", None)
                            if callable(data):
                                data = data()
                            payload = data.get("res", data) if isinstance(data, dict) else {}
                            rec_texts = payload.get("rec_texts", [])
                            rec_scores = payload.get("rec_scores", [])

                            for t_idx, txt in enumerate(rec_texts):
                                cleaned = self.clean_alphanumeric(txt)
                                if not cleaned or len(cleaned) < 3 or cleaned in {"IND", "INDIA", "TARGET", "BRACKETS"}:
                                    continue
                                ocr_score = float(rec_scores[t_idx]) if t_idx < len(rec_scores) else 0.85
                                is_valid, formatted, meta = self.parse_indian_plate(cleaned)

                                # Map coordinates if flipped
                                ox1 = frame_w - x2 if is_flipped_coords else x1
                                ox2 = frame_w - x1 if is_flipped_coords else x2

                                rel_bbox = [
                                    round(ox1 / frame_w, 4),
                                    round(y1 / frame_h, 4),
                                    round((ox2 - ox1) / frame_w, 4),
                                    round((y2 - y1) / frame_h, 4),
                                ]

                                det_entry = {
                                    "id": f"det_{uuid.uuid4().hex[:8]}",
                                    "raw_text": txt,
                                    "exact_text": txt.strip(),
                                    "cleaned_text": cleaned,
                                    "formatted_plate": formatted if is_valid else txt.strip(),
                                    "is_vehicle_plate": is_valid,
                                    "plate_meta": meta,
                                    "ocr_confidence": round(ocr_score, 4),
                                    "detection_confidence": round(det["det_conf"], 4),
                                    "overall_confidence": round((ocr_score * 0.7 + det["det_conf"] * 0.3), 4),
                                    "source": "YOLO_PLATE_CROP",
                                    "bbox": [ox1, y1, ox2, y2],
                                    "relative_bbox": rel_bbox,
                                }
                                cur_detections.append(det_entry)
                                cur_seen.add(cleaned)
                                if is_valid:
                                    found_valid_in_crop = True

                        if found_valid_in_crop:
                            break
                    except Exception as e:
                        print(f"[LiveANPR Crop OCR Error] {e}")

            # FAST PATH: If YOLO plate detector already found a valid vehicle plate,
            # RETURN IMMEDIATELY! Do NOT run expensive full-scene OCR!
            if any(d.get("is_vehicle_plate") for d in cur_detections):
                return cur_detections

            # STAGE 2: Direct Scene OCR (ONLY if YOLO didn't find any valid plate)
            if self.ocr_engine is not None:
                try:
                    # Fast Scene OCR at 640px max
                    scan_img = scan_frame
                    scale_factor = 1.0
                    if frame_w > 640:
                        scale_factor = 640.0 / frame_w
                        if CV2_AVAILABLE and cv2 is not None:
                            scan_img = cv2.resize(scan_frame, (640, int(frame_h * scale_factor)))
                        else:
                            scan_img = np.array(Image.fromarray(scan_frame).resize((640, int(frame_h * scale_factor))))

                    scene_ocr = self.ocr_engine.predict(scan_img)
                    for item in scene_ocr:
                        data = getattr(item, "json", None)
                        if callable(data):
                            data = data()
                        payload = data.get("res", data) if isinstance(data, dict) else {}
                        rec_texts = payload.get("rec_texts", [])
                        rec_scores = payload.get("rec_scores", [])
                        polys = payload.get("dt_polys", [])

                        for t_idx, txt in enumerate(rec_texts):
                            exact_txt = str(txt).strip()
                            cleaned = self.clean_alphanumeric(exact_txt)
                            if not exact_txt or len(cleaned) < 2:
                                continue
                            if cleaned in cur_seen or cleaned in {"IND", "INDIA", "BRACKETS", "TARGET", "ALIGN", "VEHICLE", "NUMBER", "PLATE", "INSIDE", "TEXT"}:
                                continue

                            ocr_score = float(rec_scores[t_idx]) if t_idx < len(rec_scores) else 0.80

                            bx1, by1, bx2, by2 = 0, 0, frame_w, frame_h
                            if t_idx < len(polys):
                                poly = polys[t_idx]
                                pts = np.array(poly, dtype=float)
                                if scale_factor != 1.0:
                                    pts /= scale_factor
                                bx1 = int(max(0, np.min(pts[:, 0])))
                                by1 = int(max(0, np.min(pts[:, 1])))
                                bx2 = int(min(frame_w, np.max(pts[:, 0])))
                                by2 = int(min(frame_h, np.max(pts[:, 1])))

                            is_valid, formatted, meta = self.parse_indian_plate(cleaned)

                            # Map coordinates if flipped
                            ox1 = frame_w - bx2 if is_flipped_coords else bx1
                            ox2 = frame_w - bx1 if is_flipped_coords else bx2

                            rel_bbox = [
                                round(ox1 / frame_w, 4),
                                round(by1 / frame_h, 4),
                                round((ox2 - ox1) / frame_w, 4),
                                round((by2 - by1) / frame_h, 4),
                            ]

                            det_entry = {
                                "id": f"det_{uuid.uuid4().hex[:8]}",
                                "raw_text": exact_txt,
                                "exact_text": exact_txt,
                                "cleaned_text": cleaned,
                                "formatted_plate": formatted if is_valid else exact_txt,
                                "is_vehicle_plate": is_valid,
                                "plate_meta": meta,
                                "ocr_confidence": round(ocr_score, 4),
                                "detection_confidence": 0.90,
                                "overall_confidence": round(ocr_score, 4),
                                "source": "DIRECT_SCENE_OCR",
                                "bbox": [ox1, by1, ox2, by2],
                                "relative_bbox": rel_bbox,
                            }
                            cur_detections.append(det_entry)
                            cur_seen.add(cleaned)
                except Exception as e:
                    print(f"[LiveANPR Scene OCR Error] {e}")

            return cur_detections

        # 1. First pass on received frame
        detections = _scan_single_orientation(frame, is_flipped_coords=False)

        # 2. Dual-Orientation Auto-Fallback:
        # If no valid vehicle plate was detected in primary orientation, automatically test the flipped orientation.
        has_plate = any(d.get("is_vehicle_plate") for d in detections)
        if not has_plate:
            flipped_frame = cv2.flip(frame, 1) if (CV2_AVAILABLE and cv2 is not None) else np.fliplr(frame).copy()
            flipped_dets = _scan_single_orientation(flipped_frame, is_flipped_coords=True)
            flipped_has_plate = any(d.get("is_vehicle_plate") for d in flipped_dets)

            if flipped_has_plate or (not detections and flipped_dets):
                detections = flipped_dets

        # Sort detections: Valid vehicle plates first, then by confidence desc
        detections.sort(key=lambda d: (1 if d["is_vehicle_plate"] else 0, d["overall_confidence"]), reverse=True)

        # ----------------------------------------------------
        # STAGE 3: Intelligence Enrichment (Blacklist + VAHAN)
        # ----------------------------------------------------
        primary_det = detections[0] if detections else None
        blacklist_alert = None
        vahan_info = None

        if primary_det:
            target_plate = primary_det["cleaned_text"]

            # 1. Check Watchlist / Blacklist
            try:
                from backend.services.watchlist_service import watchlist_service, normalize_plate
                wl = watchlist_service.get_watchlist()
                norm_target = normalize_plate(target_plate)
                for entry in wl:
                    if normalize_plate(entry.get("plate", "")) == norm_target or (len(norm_target) >= 6 and norm_target in normalize_plate(entry.get("plate", ""))):
                        blacklist_alert = {
                            "matched": True,
                            "plate": entry.get("plate"),
                            "status": entry.get("status", "blacklisted"),
                            "reason": entry.get("reason", "Flagged in DRISHTI Watchlist"),
                            "priority": entry.get("priority", "HIGH"),
                            "added_at": entry.get("added_at"),
                            "alert_level": "CRITICAL" if entry.get("status") == "blacklisted" else "MONITORED",
                        }
                        primary_det["is_blacklisted"] = True
                        break
            except Exception as e:
                print(f"[LiveANPR Watchlist Check Notice] {e}")

            # 2. VAHAN 4.0 Lookup
            try:
                from backend.services.vahan_service import get_vahan_rc_details
                vahan_data = get_vahan_rc_details(target_plate)
                if vahan_data and (vahan_data.get("vahan_status") == "VERIFIED_ACTIVE" or vahan_data.get("status") == "SUCCESS"):
                    maker_str = vahan_data.get("maker", "")
                    model_str = vahan_data.get("model", "")
                    full_model = vahan_data.get("maker_model") or f"{maker_str} {model_str}".strip()
                    vahan_info = {
                        "owner_name": vahan_data.get("owner_name", "Registered Owner"),
                        "maker_model": full_model or "Passenger Vehicle",
                        "vehicle_class": vahan_data.get("vehicle_class", "Motor Car (LMV)"),
                        "fuel_type": vahan_data.get("fuel_type", "Petrol"),
                        "registration_date": vahan_data.get("registration_date", "N/A"),
                        "rc_status": vahan_data.get("rc_status", "ACTIVE (VALID)"),
                        "rto_office": vahan_data.get("rto_office", "RTO Authority"),
                        "state": vahan_data.get("state", "India"),
                        "stolen_alert": vahan_data.get("blacklisted_crime_record", False) or vahan_data.get("stolen_alert", False),
                        "insurance_valid_upto": vahan_data.get("insurance_valid_upto", "Valid"),
                        "chassis_number_masked": vahan_data.get("chassis_number_masked", ""),
                        "engine_number_masked": vahan_data.get("engine_number_masked", ""),
                    }
                    if vahan_info.get("stolen_alert") and not blacklist_alert:
                        blacklist_alert = {
                            "matched": True,
                            "plate": target_plate,
                            "status": "blacklisted",
                            "reason": "STOLEN VEHICLE ALERT (VAHAN National Database)",
                            "priority": "CRITICAL",
                            "alert_level": "CRITICAL",
                        }
            except Exception as e:
                print(f"[LiveANPR VAHAN Lookup Notice] {e}")

        # Elapsed time
        elapsed_ms = round((time.time() - start_time) * 1000, 1)

        result_payload = {
            "success": True,
            "has_detection": len(detections) > 0,
            "detections_count": len(detections),
            "detections": detections,
            "primary": primary_det,
            "blacklist_alert": blacklist_alert,
            "vahan": vahan_info,
            "inference_time_ms": elapsed_ms,
            "frame_dimensions": {"width": frame_w, "height": frame_h},
            "timestamp": time.time(),
        }

        # Log into history ONLY if:
        # 1. It is a verified vehicle plate (is_vehicle_plate == True)
        # OR
        # 2. It is high-confidence text of at least 6 characters that is NOT a noise fragment
        if primary_det:
            cleaned = primary_det.get("cleaned_text", "")
            is_plate = primary_det.get("is_vehicle_plate", False)
            noise_words = {"IND", "INDIA", "BRACKETS", "TARGET", "ALIGN", "VEHICLE", "NUMBER", "PLATE", "INSIDE", "TEXT"}
            if is_plate or (len(cleaned) >= 6 and primary_det.get("overall_confidence", 0) >= 0.75 and cleaned not in noise_words):
                self._record_scan_event(primary_det, blacklist_alert, vahan_info, frame)

        return result_payload

    def _record_scan_event(self, det: Dict[str, Any], alert: Optional[Dict[str, Any]], vahan: Optional[Dict[str, Any]], frame: np.ndarray):
        """Save scan event to live session history."""
        try:
            # Generate small thumbnail
            x1, y1, x2, y2 = det.get("bbox", [0, 0, frame.shape[1], frame.shape[0]])
            crop = frame[max(0, y1):min(frame.shape[0], y2), max(0, x1):min(frame.shape[1], x2)]
            thumb_b64 = None
            if crop.size > 0:
                if CV2_AVAILABLE and cv2 is not None:
                    thumb = cv2.resize(crop, (160, 60))
                    _, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 75])
                    thumb_b64 = base64.b64encode(buf).decode("utf-8")
                else:
                    pil_thumb = Image.fromarray(crop).resize((160, 60))
                    bio = io.BytesIO()
                    pil_thumb.save(bio, format="JPEG", quality=75)
                    thumb_b64 = base64.b64encode(bio.getvalue()).decode("utf-8")

            event = {
                "scan_id": f"scan_{uuid.uuid4().hex[:8]}",
                "timestamp": time.time(),
                "time_display": time.strftime("%H:%M:%S", time.localtime()),
                "exact_text": det.get("exact_text"),
                "formatted_plate": det.get("formatted_plate"),
                "cleaned_text": det.get("cleaned_text"),
                "is_vehicle_plate": det.get("is_vehicle_plate", False),
                "confidence": det.get("overall_confidence", 0.0),
                "source": det.get("source"),
                "is_blacklisted": bool(alert),
                "blacklist_reason": alert.get("reason") if alert else None,
                "vahan_model": vahan.get("maker_model") if vahan else None,
                "thumbnail": f"data:image/jpeg;base64,{thumb_b64}" if thumb_b64 else None,
            }

            self.scan_history.insert(0, event)
            if len(self.scan_history) > 100:
                self.scan_history.pop()

            self._save_history()
        except Exception as e:
            print(f"[LiveANPR History Log Notice] {e}")

    def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self.scan_history[:limit]

    def clear_history(self):
        self.scan_history = []
        self._save_history()


# Global Singleton Instance
live_anpr_service = LiveANPRService()
