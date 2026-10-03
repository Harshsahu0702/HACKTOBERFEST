"""
scripts/live_webcam_anpr.py

DRISHTI — Real-Time Standalone Laptop Camera ANPR & Optical Text Recognition Studio.
Run directly on your laptop to detect license plates, text on paper, phone screens, or signs.

Usage:
    python scripts/live_webcam_anpr.py
    python scripts/live_webcam_anpr.py --cam 0 --conf 0.25

Controls:
    [SPACE]   - Trigger manual deep scan / freeze
    [S]       - Save current detection snapshot to disk
    [M]       - Toggle mirror flip mode
    [C]       - Switch camera device (0, 1, 2)
    [Q] / ESC - Exit
"""

import sys
import time
import argparse
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import cv2
import numpy as np
from backend.services.live_anpr_service import live_anpr_service

SNAPSHOT_DIR = PROJECT_ROOT / "runs" / "detect" / "webcam_live"
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)


def draw_hud(frame, results, fps, mirror_mode, scan_status="SCANNING"):
    h, w = frame.shape[:2]
    canvas = frame.copy()

    # Top Cyber Header Bar
    cv2.rectangle(canvas, (0, 0), (w, 54), (20, 20, 20), -1)
    cv2.line(canvas, (0, 54), (w, 54), (0, 215, 255), 2)

    # Title & FPS
    cv2.putText(canvas, "DRISHTI // LIVE LAPTOP ANPR & OPTICAL TEXT SCANNER", (18, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
    cv2.putText(canvas, f"FPS: {fps:.1f}", (w - 140, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 200), 2)

    # Viewfinder Target Box in center
    vw, vh = int(w * 0.75), int(h * 0.50)
    vx1, vy1 = (w - vw) // 2, (h - vh) // 2
    vx2, vy2 = vx1 + vw, vy1 + vh

    # Target Reticle Corners
    reticle_color = (0, 220, 100) if scan_status == "LOCKED" else (0, 180, 255)
    corner_len = 30
    thick = 3
    # Top-Left
    cv2.line(canvas, (vx1, vy1), (vx1 + corner_len, vy1), reticle_color, thick)
    cv2.line(canvas, (vx1, vy1), (vx1, vy1 + corner_len), reticle_color, thick)
    # Top-Right
    cv2.line(canvas, (vx2, vy1), (vx2 - corner_len, vy1), reticle_color, thick)
    cv2.line(canvas, (vx2, vy1), (vx2, vy1 + corner_len), reticle_color, thick)
    # Bottom-Left
    cv2.line(canvas, (vx1, vy2), (vx1 + corner_len, vy2), reticle_color, thick)
    cv2.line(canvas, (vx1, vy2), (vx1, vy2 - corner_len), reticle_color, thick)
    # Bottom-Right
    cv2.line(canvas, (vx2, vy2), (vx2 - corner_len, vy2), reticle_color, thick)
    cv2.line(canvas, (vx2, vy2), (vx2, vy2 - corner_len), reticle_color, thick)

    cv2.putText(canvas, "SHOW LICENSE PLATE OR TEXT INSIDE TARGET", (vx1 + 15, vy1 - 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.50, reticle_color, 1)

    # Draw detected bounding boxes & text
    detections = results.get("detections", [])
    primary = results.get("primary")
    is_blacklist = bool(results.get("blacklist_alert"))

    for det in detections:
        x1, y1, x2, y2 = det.get("bbox", [0, 0, 0, 0])
        txt = det.get("formatted_plate") or det.get("exact_text")
        conf = det.get("overall_confidence", 0.0)
        is_plate = det.get("is_vehicle_plate", False)

        box_color = (0, 0, 255) if is_blacklist else ((0, 255, 0) if is_plate else (255, 180, 0))
        cv2.rectangle(canvas, (x1, y1), (x2, y2), box_color, 2)

        # Label background
        label = f"{txt} ({conf*100:.1f}%)"
        (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(canvas, (x1, max(0, y1 - lh - 10)), (x1 + lw + 10, y1), box_color, -1)
        cv2.putText(canvas, label, (x1 + 5, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)

    # Bottom Intel HUD Bar
    cv2.rectangle(canvas, (0, h - 90), (w, h), (15, 15, 15), -1)
    cv2.line(canvas, (0, h - 90), (w, h - 90), (100, 100, 100), 1)

    if primary:
        p_txt = primary.get("formatted_plate") or primary.get("exact_text")
        p_conf = primary.get("overall_confidence", 0.0) * 100
        src = primary.get("source", "OCR")
        vahan = results.get("vahan") or {}
        model = vahan.get("maker_model", "Scene Text Detected")

        if is_blacklist:
            cv2.rectangle(canvas, (10, h - 82), (w - 10, h - 48), (0, 0, 180), -1)
            cv2.putText(canvas, f"CRITICAL ALERT: BLACKLISTED VEHICLE [{p_txt}] DETECTED!", (20, h - 58),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
        else:
            cv2.putText(canvas, f"DETECTED: {p_txt} | ACCURACY: {p_conf:.1f}% | SOURCE: {src}",
                        (18, h - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 160), 2)

        cv2.putText(canvas, f"INTELLIGENCE: {model} | STATUS: ACTIVE TARGET LOCK",
                    (18, h - 22), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (200, 200, 200), 1)
    else:
        cv2.putText(canvas, "STATUS: STANDBY — HOLD VEHICLE NUMBER PLATE OR ANY TEXT UP TO CAMERA",
                    (18, h - 55), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (160, 160, 160), 1)
        cv2.putText(canvas, "CONTROLS: [SPACE] Deep Scan | [S] Save Snapshot | [M] Mirror Flip | [Q] Quit",
                    (18, h - 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (120, 120, 120), 1)

    return canvas


def main():
    parser = argparse.ArgumentParser(description="DRISHTI Live Laptop Camera ANPR & Optical Text Scanner")
    parser.add_argument("--cam", type=int, default=0, help="Camera device index (default: 0)")
    parser.add_argument("--conf", type=float, default=0.25, help="Detection confidence threshold")
    parser.add_argument("--mirror", action="store_true", default=False, help="Mirror flip camera horizontally")
    args = parser.parse_args()

    print("=" * 70)
    print("  DRISHTI — REAL-TIME LAPTOP WEBCAM ANPR & OPTICAL TEXT SCANNER")
    print("  Smart India Hackathon 2026 | PS 26127 (BEL)")
    print("=" * 70)
    print(f"Opening camera index {args.cam}...")

    cap = cv2.VideoCapture(args.cam)
    if not cap.isOpened():
        print(f"[Error] Could not open camera {args.cam}. Trying camera 1...")
        cap = cv2.VideoCapture(1)
        if not cap.isOpened():
            print("[Error] No camera found. Please verify camera permissions.")
            return

    # Set 720p or 1080p
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("Camera initialized! Press 'Q' or ESC to exit.")
    mirror_mode = args.mirror

    last_scan_time = 0
    scan_interval = 0.5  # Scan every 500ms
    latest_results = {}
    fps_history = []
    t_prev = time.time()

    window_name = "DRISHTI - Live ANPR Laptop Camera Studio"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1024, 600)

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("[Warning] Camera frame drop, retrying...")
                time.sleep(0.05)
                continue

            t_now = time.time()
            fps = 1.0 / max(0.001, t_now - t_prev)
            t_prev = t_now
            fps_history.append(fps)
            if len(fps_history) > 15:
                fps_history.pop(0)
            avg_fps = sum(fps_history) / len(fps_history)

            if mirror_mode:
                frame = cv2.flip(frame, 1)

            # Periodic AI Scan
            if t_now - last_scan_time >= scan_interval:
                last_scan_time = t_now
                try:
                    latest_results = live_anpr_service.process_frame(
                        image_data=frame,
                        min_confidence=args.conf,
                        mirror_flip=False,
                    )
                except Exception as e:
                    print(f"[Scan Error] {e}")

            scan_status = "LOCKED" if latest_results.get("has_detection") else "SCANNING"
            hud_frame = draw_hud(frame, latest_results, avg_fps, mirror_mode, scan_status)

            cv2.imshow(window_name, hud_frame)
            key = cv2.waitKey(1) & 0xFF

            if key in [ord("q"), ord("Q"), 27]:
                print("Exiting live scanner...")
                break
            elif key == ord("m") or key == ord("M"):
                mirror_mode = not mirror_mode
                print(f"[Controls] Mirror mode: {'ON' if mirror_mode else 'OFF'}")
            elif key == ord("s") or key == ord("S"):
                fname = SNAPSHOT_DIR / f"snapshot_{int(time.time())}.jpg"
                cv2.imwrite(str(fname), hud_frame)
                print(f"[Snapshot] Saved to {fname}")
            elif key == 32:  # SPACE - force deep scan
                print("[Scan] Manual deep scan triggered...")
                latest_results = live_anpr_service.process_frame(frame, min_confidence=args.conf)
    finally:
        cap.release()
        cv2.destroyAllWindows()
        print("Camera released. DRISHTI Live ANPR finished.")


if __name__ == "__main__":
    main()
