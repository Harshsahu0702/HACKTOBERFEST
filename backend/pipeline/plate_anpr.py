import json
import re
from pathlib import Path

import cv2
from ultralytics import YOLO
from paddleocr import PaddleOCR


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

TRACKING_DIR = PROJECT_ROOT / "runs" / "tracking"
PLATE_DIR = PROJECT_ROOT / "runs" / "detect" / "plate_detection"

PLATE_DIR.mkdir(parents=True, exist_ok=True)

PLATE_IMAGES_DIR = PLATE_DIR / "plates"
PLATE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

PLATE_MODEL = PROJECT_ROOT / "models" / "license_plate.pt"


# ============================================================
# CONFIG
# ============================================================

CAMERA_ID = "camera_01"

VIDEO_PATH = Path(
    r"H:\extracted\train\S01\c001\vdo.avi"
)

TRACK_FILE = (
    TRACKING_DIR / f"{CAMERA_ID}_tracks.json"
)

OUTPUT_FILE = (
    TRACKING_DIR / "vehicle_plate_summary.json"
)

MATCH_FILE = (
    TRACKING_DIR / "vehicle_plate_matches.json"
)

OCR_FILE = (
    PLATE_DIR / "ocr_results.json"
)

META_FILE = (
    PLATE_DIR / "plate_metadata.json"
)


# ============================================================
# LOAD MODELS
# ============================================================

print("[1] Loading license plate detector...")

plate_model = YOLO(str(PLATE_MODEL))

print("[2] Loading PaddleOCR...")

ocr = PaddleOCR(
    lang="en"
)

print("[3] Models loaded successfully")


# ============================================================
# LOAD TRACK DATA
# ============================================================

if not TRACK_FILE.exists():
    raise FileNotFoundError(
        f"Tracking file not found: {TRACK_FILE}"
    )

with open(
    TRACK_FILE,
    "r",
    encoding="utf-8"
) as f:
    tracking_data = json.load(f)


tracks = tracking_data.get("tracks", [])

print(
    f"[4] Loaded {len(tracks)} vehicle tracks"
)


# ============================================================
# HELPERS
# ============================================================

def clean_plate_text(text: str) -> str:
    """
    Keep only alphanumeric characters.
    """

    text = str(text).upper()

    text = re.sub(
        r"[^A-Z0-9]",
        "",
        text
    )

    return text


def extract_ocr_text(image):
    """
    Run PaddleOCR on plate crop.
    """

    if image is None:
        return None, 0.0

    if image.size == 0:
        return None, 0.0

    try:

        result = ocr.predict(
            image
        )

        best_text = None
        best_conf = 0.0

        for res in result:

            data = getattr(
                res,
                "json",
                None
            )

            if callable(data):
                data = data()

            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except Exception:
                    data = None

            if not isinstance(data, dict):
                continue

            payload = data.get(
                "res",
                data
            )

            texts = payload.get(
                "rec_texts",
                []
            )

            scores = payload.get(
                "rec_scores",
                []
            )

            for i, text in enumerate(texts):

                conf = (
                    float(scores[i])
                    if i < len(scores)
                    else 0.0
                )

                cleaned = clean_plate_text(
                    text
                )

                if (
                    cleaned
                    and conf > best_conf
                ):
                    best_text = cleaned
                    best_conf = conf

        return best_text, best_conf

    except Exception as e:

        print(
            f"[OCR WARNING] {e}"
        )

        return None, 0.0


# ============================================================
# OPEN VIDEO
# ============================================================

if not VIDEO_PATH.exists():

    raise FileNotFoundError(
        f"Video not found: {VIDEO_PATH}"
    )

cap = cv2.VideoCapture(
    str(VIDEO_PATH)
)

if not cap.isOpened():

    raise RuntimeError(
        f"Cannot open video: {VIDEO_PATH}"
    )

fps = cap.get(
    cv2.CAP_PROP_FPS
)

if not fps or fps <= 0:
    fps = 10.0


# ============================================================
# STORAGE
# ============================================================

plate_results = {}

plate_matches = []

plate_metadata = []

ocr_results = []


# ============================================================
# PROCESS TRACKS
# ============================================================

print(
    "[5] Starting plate detection + OCR..."
)


for index, track in enumerate(
    tracks,
    start=1
):

    vehicle_id = track.get(
        "track_id"
    )

    first_frame = int(
        track.get(
            "first_frame",
            0
        )
    )

    last_frame = int(
        track.get(
            "last_frame",
            first_frame
        )
    )

    # --------------------------------------------------------
    # Select several frames from each track
    # --------------------------------------------------------

    if last_frame < first_frame:
        continue

    frame_candidates = sorted(
        set(
            [
                first_frame,
                first_frame
                + (last_frame - first_frame)
                // 4,
                first_frame
                + (last_frame - first_frame)
                // 2,
                first_frame
                + 3
                * (last_frame - first_frame)
                // 4,
                last_frame,
            ]
        )
    )

    vehicle_observations = []

    best_text = None
    best_conf = 0.0
    best_image = None
    best_frame = None

    # --------------------------------------------------------
    # Process candidate frames
    # --------------------------------------------------------

    for frame_number in frame_candidates:

        cap.set(
            cv2.CAP_PROP_POS_FRAMES,
            frame_number
        )

        ret, frame = cap.read()

        if not ret:
            continue

        # ----------------------------------------------------
        # Detect license plates
        # ----------------------------------------------------

        results = plate_model.predict(
            source=frame,
            conf=0.25,
            verbose=False
        )

        for result in results:

            boxes = result.boxes

            if boxes is None:
                continue

            for box in boxes:

                xyxy = box.xyxy[0].cpu().numpy()

                x1, y1, x2, y2 = map(
                    int,
                    xyxy
                )

                # Clamp coordinates
                h, w = frame.shape[:2]

                x1 = max(
                    0,
                    min(x1, w - 1)
                )

                y1 = max(
                    0,
                    min(y1, h - 1)
                )

                x2 = max(
                    0,
                    min(x2, w)
                )

                y2 = max(
                    0,
                    min(y2, h)
                )

                if x2 <= x1 or y2 <= y1:
                    continue

                plate_crop = frame[
                    y1:y2,
                    x1:x2
                ]

                if plate_crop.size == 0:
                    continue

                # ------------------------------------------------
                # OCR
                # ------------------------------------------------

                text, conf = extract_ocr_text(
                    plate_crop
                )

                detection_conf = float(
                    box.conf[0].item()
                )

                plate_observation = {
                    "vehicle_id": vehicle_id,
                    "frame": frame_number,
                    "bbox": [
                        x1,
                        y1,
                        x2,
                        y2,
                    ],
                    "plate_detection_confidence":
                        round(
                            detection_conf,
                            4
                        ),
                    "plate_text": text,
                    "ocr_confidence":
                        round(
                            conf,
                            4
                        ),
                }

                plate_matches.append(
                    plate_observation
                )

                if text:

                    vehicle_observations.append(
                        {
                            "text": text,
                            "confidence": conf,
                            "frame": frame_number,
                        }
                    )

                    if conf > best_conf:

                        best_text = text
                        best_conf = conf
                        best_frame = frame_number

                        image_name = (
                            f"{CAMERA_ID}"
                            f"_vehicle_{vehicle_id}"
                            f"_frame_{frame_number}"
                            ".jpg"
                        )

                        image_path = (
                            PLATE_IMAGES_DIR
                            / image_name
                        )

                        cv2.imwrite(
                            str(image_path),
                            plate_crop
                        )

                        best_image = image_name

                        plate_metadata.append(
                            {
                                "vehicle_id": vehicle_id,
                                "frame": frame_number,
                                "bbox": [
                                    x1,
                                    y1,
                                    x2,
                                    y2,
                                ],
                                "image": str(
                                    image_path
                                ),
                            }
                        )

                        ocr_results.append(
                            {
                                "vehicle_id":
                                    vehicle_id,
                                "frame":
                                    frame_number,
                                "text":
                                    text,
                                "confidence":
                                    round(
                                        conf,
                                        4
                                    ),
                            }
                        )

    # --------------------------------------------------------
    # Save vehicle-level result
    # --------------------------------------------------------

    if best_text:

        plate_results[
            str(vehicle_id)
        ] = {
            "vehicle_id": vehicle_id,
            "plate_text": best_text,
            "plate_confidence":
                round(
                    best_conf,
                    4
                ),
            "plate_image":
                best_image,
            "observations":
                len(
                    vehicle_observations
                ),
            "plate_read_count":
                len(
                    vehicle_observations
                ),
            "first_seen_frame":
                first_frame,
            "last_seen_frame":
                last_frame,
        }

    else:

        plate_results[
            str(vehicle_id)
        ] = {
            "vehicle_id": vehicle_id,
            "plate_text": None,
            "plate_confidence": 0.0,
            "plate_image": None,
            "observations": 0,
            "plate_read_count": 0,
            "first_seen_frame":
                first_frame,
            "last_seen_frame":
                last_frame,
        }

    if index % 10 == 0:

        print(
            f"Processed "
            f"{index}/{len(tracks)} tracks"
        )


# ============================================================
# RELEASE VIDEO
# ============================================================

cap.release()


# ============================================================
# SAVE FILES
# ============================================================

summary = list(
    plate_results.values()
)

with open(
    OUTPUT_FILE,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        summary,
        f,
        indent=2
    )


with open(
    MATCH_FILE,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        plate_matches,
        f,
        indent=2
    )


with open(
    OCR_FILE,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        ocr_results,
        f,
        indent=2
    )


with open(
    META_FILE,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        plate_metadata,
        f,
        indent=2
    )


# ============================================================
# FINAL SUMMARY
# ============================================================

detected_count = sum(
    1
    for x in summary
    if x.get("plate_text")
)

print()
print(
    "===================================="
)

print(
    "PLATE ANPR COMPLETE"
)

print(
    "===================================="
)

print(
    f"Vehicles processed : {len(summary)}"
)

print(
    f"Plates detected    : {detected_count}"
)

print(
    f"No plate           : "
    f"{len(summary) - detected_count}"
)

print(
    f"Summary             : {OUTPUT_FILE}"
)

print(
    f"Matches             : {MATCH_FILE}"
)

print(
    f"OCR results         : {OCR_FILE}"
)

print(
    f"Plate images        : {PLATE_IMAGES_DIR}"
)

print(
    "===================================="
)