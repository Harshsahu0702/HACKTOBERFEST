from pathlib import Path
import json
import cv2

from ultralytics import YOLO


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

VIDEO_ROOT = PROJECT_ROOT / "static" / "videos"
OUTPUT_DIR = PROJECT_ROOT / "runs" / "cross_camera"

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

MODEL_PATH = PROJECT_ROOT / "yolo11n.pt"


# ============================================================
# VEHICLE CLASSES
# COCO
# ============================================================

VEHICLE_CLASSES = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}


# ============================================================
# DISCOVER ALL JUNCTIONS / CAMERAS AUTOMATICALLY
#
# Example:
#
# static/videos/
#   S01/
#       c001.mp4
#       c002.mp4
#
#   S03/
#       c010.mp4
#       c011.mp4
#
#   S04/
#       c016.mp4
#       ...
#       c040.mp4
#
# Future:
#
#   S05/
#       c041.mp4
#       ...
#
# automatically supported.
# ============================================================

def discover_cameras():

    cameras = []

    if not VIDEO_ROOT.exists():
        raise FileNotFoundError(
            f"Video directory not found: {VIDEO_ROOT}"
        )

    for scene_dir in sorted(VIDEO_ROOT.iterdir()):

        if not scene_dir.is_dir():
            continue

        scene = scene_dir.name

        for video_path in sorted(scene_dir.glob("*.mp4")):

            camera_name = video_path.stem

            # Only camera-style files such as c001, c016, c040
            if not camera_name.startswith("c"):
                continue

            try:
                camera_number = int(camera_name[1:])
            except ValueError:
                continue

            camera_id = f"camera_{camera_number:02d}"

            cameras.append({
                "camera_id": camera_id,
                "camera_name": camera_name,
                "scene": scene,
                "video": video_path,
            })

    return cameras


# ============================================================
# PROCESS ONE CAMERA
# ============================================================

def process_camera(model, camera):

    camera_id = camera["camera_id"]
    camera_name = camera["camera_name"]
    scene = camera["scene"]
    video_path = camera["video"]

    output_file = (
        OUTPUT_DIR
        / f"{camera_id}_tracks.json"
    )

    print()
    print("=" * 60)
    print(f"PROCESSING {camera_id}")
    print(f"Junction : {scene}")
    print(f"Camera   : {camera_name}")
    print(f"Video    : {video_path}")
    print("=" * 60)

    # --------------------------------------------------------
    # Open video only for metadata
    # --------------------------------------------------------

    cap = cv2.VideoCapture(
        str(video_path)
    )

    if not cap.isOpened():

        print(
            f"[FAILED] Cannot open video: {video_path}"
        )

        return False

    fps = cap.get(
        cv2.CAP_PROP_FPS
    ) or 25.0

    frame_count = int(
        cap.get(
            cv2.CAP_PROP_FRAME_COUNT
        )
    )

    width = int(
        cap.get(
            cv2.CAP_PROP_FRAME_WIDTH
        )
    )

    height = int(
        cap.get(
            cv2.CAP_PROP_FRAME_HEIGHT
        )
    )

    cap.release()

    print(
        f"FPS        : {fps:.2f}"
    )

    print(
        f"Frames     : {frame_count}"
    )

    print(
        f"Resolution : {width} x {height}"
    )

    # --------------------------------------------------------
    # Track vehicles
    # --------------------------------------------------------

    tracks = {}

    frame_number = 0

    print(
        "Starting YOLO + ByteTrack..."
    )

    results = model.track(

        source=str(video_path),

        stream=True,

        persist=True,

        tracker="bytetrack.yaml",

        classes=list(
            VEHICLE_CLASSES.keys()
        ),

        conf=0.30,

        verbose=False,
    )

    for result in results:

        frame_number += 1

        boxes = result.boxes

        if boxes is None:
            continue

        if boxes.id is None:
            continue

        ids = (
            boxes.id
            .int()
            .cpu()
            .tolist()
        )

        classes = (
            boxes.cls
            .int()
            .cpu()
            .tolist()
        )

        confidences = (
            boxes.conf
            .cpu()
            .tolist()
        )

        xyxy = (
            boxes.xyxy
            .cpu()
            .tolist()
        )

        for (
            track_id,
            cls_id,
            confidence,
            bbox,
        ) in zip(
            ids,
            classes,
            confidences,
            xyxy,
        ):

            if cls_id not in VEHICLE_CLASSES:
                continue

            vehicle_type = (
                VEHICLE_CLASSES[cls_id]
            )

            x1, y1, x2, y2 = [
                round(float(v), 2)
                for v in bbox
            ]

            cx = round(
                (x1 + x2) / 2,
                2
            )

            cy = round(
                (y1 + y2) / 2,
                2
            )

            track_id = int(track_id)

            # ------------------------------------------------
            # New vehicle track
            # ------------------------------------------------

            if track_id not in tracks:

                tracks[track_id] = {

                    "camera_id":
                        camera_id,

                    "camera_name":
                        camera_name,

                    "scene":
                        scene,

                    "track_id":
                        track_id,

                    "vehicle_type":
                        vehicle_type,

                    "class_id":
                        int(cls_id),

                    "first_frame":
                        frame_number,

                    "last_frame":
                        frame_number,

                    "first_time_sec":
                        round(
                            frame_number / fps,
                            3
                        ),

                    "last_time_sec":
                        round(
                            frame_number / fps,
                            3
                        ),

                    "num_detections":
                        0,

                    "num_crops_sampled":
                        0,

                    "avg_confidence":
                        0.0,

                    "max_confidence":
                        round(
                            float(confidence),
                            4
                        ),

                    "confidence_sum":
                        0.0,

                    "trajectory_sample":
                        [],

                    "sample_bboxes":
                        [],
                }

            track = tracks[track_id]

            # ------------------------------------------------
            # Update track
            # ------------------------------------------------

            track["last_frame"] = (
                frame_number
            )

            track["last_time_sec"] = round(
                frame_number / fps,
                3
            )

            track["num_detections"] += 1

            track["confidence_sum"] += (
                float(confidence)
            )

            track["max_confidence"] = max(
                track["max_confidence"],
                round(
                    float(confidence),
                    4
                )
            )

            # ------------------------------------------------
            # Sample trajectory
            # Every ~10 frames
            # ------------------------------------------------

            if (
                frame_number
                % max(1, int(fps))
                == 0
            ):

                track[
                    "trajectory_sample"
                ].append(
                    [
                        cx,
                        cy
                    ]
                )

            # ------------------------------------------------
            # Sample bounding box
            # Every ~10 frames
            # Maximum 30 samples
            # ------------------------------------------------

            if (
                frame_number
                % max(1, int(fps))
                == 0
                and len(
                    track["sample_bboxes"]
                ) < 30
            ):

                track[
                    "sample_bboxes"
                ].append({

                    "frame":
                        frame_number,

                    "bbox": [
                        x1,
                        y1,
                        x2,
                        y2,
                    ],

                })

                track[
                    "num_crops_sampled"
                ] += 1

        # ----------------------------------------------------
        # Progress
        # ----------------------------------------------------

        if frame_number % 100 == 0:

            print(
                f"Processed "
                f"{frame_number}/{frame_count}"
                f" | tracks: {len(tracks)}"
            )

    # --------------------------------------------------------
    # Finalize tracks
    # --------------------------------------------------------

    output_tracks = []

    for track in tracks.values():

        detections = (
            track["num_detections"]
        )

        if detections > 0:

            track["avg_confidence"] = round(
                track["confidence_sum"]
                / detections,
                4
            )

        track.pop(
            "confidence_sum",
            None
        )

        track["duration_frames"] = (
            track["last_frame"]
            - track["first_frame"]
            + 1
        )

        track["duration_sec"] = round(
            track["last_time_sec"]
            - track["first_time_sec"],
            3
        )

        output_tracks.append(
            track
        )

    output_tracks.sort(
        key=lambda x: x["track_id"]
    )

    # --------------------------------------------------------
    # JSON structure
    # --------------------------------------------------------

    output = {

        "camera_id":
            camera_id,

        "camera_name":
            camera_name,

        "scene":
            scene,

        "video":
            str(video_path),

        "fps":
            fps,

        "frame_count":
            frame_count,

        "resolution": [
            width,
            height
        ],

        "total_tracks":
            len(output_tracks),

        "tracks":
            output_tracks,
    }

    # --------------------------------------------------------
    # Save
    # --------------------------------------------------------

    with open(
        output_file,
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            output,
            f,
            indent=2
        )

    print()
    print(
        f"[DONE] {camera_id}"
    )

    print(
        f"Tracks : {len(output_tracks)}"
    )

    print(
        f"Output : {output_file}"
    )

    return True


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print("=" * 60)
    print("MULTI-JUNCTION VEHICLE TRACKING")
    print("=" * 60)

    # --------------------------------------------------------
    # Model
    # --------------------------------------------------------

    if not MODEL_PATH.exists():

        raise FileNotFoundError(
            f"YOLO model not found: {MODEL_PATH}"
        )

    print()
    print("[1] Loading YOLO model...")

    model = YOLO(
        str(MODEL_PATH)
    )

    print(
        "[OK] YOLO model loaded"
    )

    # --------------------------------------------------------
    # Discover cameras
    # --------------------------------------------------------

    cameras = discover_cameras()

    if not cameras:

        raise RuntimeError(
            f"No camera videos found inside {VIDEO_ROOT}"
        )

    print()
    print(
        f"[2] Cameras discovered: "
        f"{len(cameras)}"
    )

    # --------------------------------------------------------
    # Show junction summary
    # --------------------------------------------------------

    junction_counts = {}

    for camera in cameras:

        scene = camera["scene"]

        junction_counts[scene] = (
            junction_counts.get(
                scene,
                0
            ) + 1
        )

    print()
    print("JUNCTION SUMMARY")

    for scene, count in sorted(
        junction_counts.items()
    ):

        print(
            f"  {scene}: "
            f"{count} cameras"
        )

    # --------------------------------------------------------
    # Process
    # --------------------------------------------------------

    successful = 0
    failed = 0

    for index, camera in enumerate(
        cameras,
        start=1
    ):

        print()
        print(
            f"[{index}/{len(cameras)}] "
            f"{camera['camera_id']}"
        )

        try:

            ok = process_camera(
                model,
                camera
            )

            if ok:
                successful += 1
            else:
                failed += 1

        except Exception as e:

            failed += 1

            print()
            print(
                f"[ERROR] "
                f"{camera['camera_id']}"
            )

            print(
                str(e)
            )

    # --------------------------------------------------------
    # Summary
    # --------------------------------------------------------

    print()
    print("=" * 60)
    print("MULTI-JUNCTION TRACKING COMPLETE")
    print("=" * 60)

    print(
        f"Discovered cameras : {len(cameras)}"
    )

    print(
        f"Successful         : {successful}"
    )

    print(
        f"Failed             : {failed}"
    )

    print(
        f"Output directory   : {OUTPUT_DIR}"
    )

    print("=" * 60)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()