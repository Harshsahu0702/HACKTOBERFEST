import json
from pathlib import Path
from typing import Dict, List, Any

import cv2
import numpy as np
import torch

from torchreid.reid.utils import FeatureExtractor


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

TRACKING_DIR = PROJECT_ROOT / "runs" / "tracking"
REID_DIR = PROJECT_ROOT / "runs" / "reid"

REID_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# JUNCTION CONFIGURATION
# ============================================================

JUNCTIONS = {

    # S01 -> c001-c005
    "S01": range(1, 6),

    # S03 -> c010-c015
    "S03": range(10, 16),

    # S04 -> c016-c040
    "S04": range(16, 41),
}


# ============================================================
# MODEL
# ============================================================

print()
print("==============================================")
print("LOADING VEHICLE RE-ID MODEL")
print("==============================================")


DEVICE = (
    "cuda"
    if torch.cuda.is_available()
    else "cpu"
)


extractor = FeatureExtractor(
    model_name="osnet_x1_0",
    model_path=None,
    device=DEVICE,
)


print(
    f"Device: {DEVICE}"
)

print(
    "Re-ID model loaded."
)


# ============================================================
# LOAD TRACKING JSON
# ============================================================

def load_tracks(
    path: Path
) -> Dict[str, Any]:

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as f:

        return json.load(f)


# ============================================================
# GET VEHICLE CROP
# ============================================================

def get_vehicle_crop(
    video_path: str,
    track: Dict[str, Any]
):

    cap = cv2.VideoCapture(
        video_path
    )

    if not cap.isOpened():
        return None


    first_frame = int(
        track.get(
            "first_frame",
            1
        )
    )

    last_frame = int(
        track.get(
            "last_frame",
            first_frame
        )
    )


    # Middle frame of the track
    frame_no = (
        first_frame + last_frame
    ) // 2


    cap.set(
        cv2.CAP_PROP_POS_FRAMES,
        max(
            0,
            frame_no - 1
        )
    )


    ok, frame = cap.read()

    cap.release()


    if not ok:
        return None


    # ========================================================
    # USE ACTUAL SAMPLE BBOX IF AVAILABLE
    # ========================================================

    sample_bboxes = track.get(
        "sample_bboxes",
        []
    )


    bbox = None


    if sample_bboxes:

        middle_index = (
            len(sample_bboxes) // 2
        )

        bbox = sample_bboxes[
            middle_index
        ].get("bbox")


    # ========================================================
    # FALLBACK TO TRAJECTORY
    # ========================================================

    if bbox is None:

        trajectory = track.get(
            "trajectory_sample",
            []
        )

        if not trajectory:
            return None


        x, y = trajectory[
            len(trajectory) // 2
        ]


        crop_w = 180
        crop_h = 120


        x1 = int(
            x - crop_w / 2
        )

        y1 = int(
            y - crop_h / 2
        )

        x2 = int(
            x + crop_w / 2
        )

        y2 = int(
            y + crop_h / 2
        )

    else:

        x1, y1, x2, y2 = bbox

        x1 = int(x1)
        y1 = int(y1)
        x2 = int(x2)
        y2 = int(y2)


    # ========================================================
    # CLAMP TO IMAGE
    # ========================================================

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
        return None


    crop = frame[
        y1:y2,
        x1:x2
    ]


    if crop.size == 0:
        return None


    return crop


# ============================================================
# EXTRACT RE-ID FEATURE
# ============================================================

def extract_feature(crop):

    if crop is None:
        return None


    rgb = cv2.cvtColor(
        crop,
        cv2.COLOR_BGR2RGB
    )


    feature = extractor(
        [rgb]
    )


    feature = (
        feature
        .detach()
        .cpu()
        .numpy()[0]
    )


    norm = np.linalg.norm(
        feature
    )


    if norm > 0:

        feature = (
            feature / norm
        )


    return feature


# ============================================================
# PROCESS ONE CAMERA
# ============================================================

def process_camera(
    junction: str,
    camera_number: int,
    all_features: List[Dict[str, Any]]
):

    camera_id = (
        f"camera_{camera_number:02d}"
    )

    camera_name = (
        f"c{camera_number:03d}"
    )


    tracks_path = (
        TRACKING_DIR
        / f"{camera_id}_tracks.json"
    )


    print()
    print(
        "----------------------------------------------"
    )

    print(
        f"Processing: {junction}/{camera_name}"
    )

    print(
        f"Tracking: {tracks_path.name}"
    )


    # ========================================================
    # TRACKING FILE CHECK
    # ========================================================

    if not tracks_path.exists():

        print(
            "[SKIP] Tracking JSON not found"
        )

        return 0


    # ========================================================
    # LOAD TRACKS
    # ========================================================

    tracks_data = load_tracks(
        tracks_path
    )


    tracks = tracks_data.get(
        "tracks",
        []
    )


    video_path = tracks_data.get(
        "video"
    )


    # If video path inside JSON is invalid,
    # use standard static video location.

    if not video_path:

        video_path = str(
            PROJECT_ROOT
            / "static"
            / "videos"
            / junction
            / f"{camera_name}.mp4"
        )


    video_path_obj = Path(
        video_path
    )


    if not video_path_obj.exists():

        video_path = str(
            PROJECT_ROOT
            / "static"
            / "videos"
            / junction
            / f"{camera_name}.mp4"
        )


    if not Path(video_path).exists():

        print(
            "[SKIP] Video not found"
        )

        return 0


    print(
        f"Tracks: {len(tracks)}"
    )

    print(
        f"Video : {video_path}"
    )


    processed = 0


    # ========================================================
    # PROCESS EACH VEHICLE TRACK
    # ========================================================

    for index, track in enumerate(
        tracks,
        start=1
    ):


        crop = get_vehicle_crop(
            video_path,
            track
        )


        if crop is None:
            continue


        feature = extract_feature(
            crop
        )


        if feature is None:
            continue


        # ====================================================
        # STORE COMPLETE RE-ID RECORD
        # ====================================================

        all_features.append({

            "global_vehicle_id":
                None,

            "junction":
                junction,

            "camera_id":
                camera_id,

            "camera_name":
                camera_name,

            "vehicle_id":
                track.get(
                    "track_id"
                ),

            "vehicle_type":
                track.get(
                    "vehicle_type"
                ),

            "first_frame":
                track.get(
                    "first_frame"
                ),

            "last_frame":
                track.get(
                    "last_frame"
                ),

            "first_time_sec":
                track.get(
                    "first_time_sec"
                ),

            "last_time_sec":
                track.get(
                    "last_time_sec"
                ),

            "duration_sec":
                track.get(
                    "duration_sec"
                ),

            "trajectory_sample":
                track.get(
                    "trajectory_sample",
                    []
                ),

            "feature":
                feature.tolist(),
        })


        processed += 1


        if processed % 25 == 0:

            print(
                f"    Features: "
                f"{processed}/{len(tracks)}"
            )


    print(
        f"[DONE] {junction}/{camera_name}"
    )

    print(
        f"       Features: {processed}"
    )


    return processed


# ============================================================
# MAIN
# ============================================================

def main():

    all_features = []


    total_processed = 0

    total_skipped = 0

    total_cameras = 0


    # ========================================================
    # PROCESS ALL JUNCTIONS
    # ========================================================

    for junction, camera_numbers in JUNCTIONS.items():

        print()
        print()
        print(
            "##############################################"
        )

        print(
            f"JUNCTION: {junction}"
        )

        print(
            "##############################################"
        )


        for camera_number in camera_numbers:

            total_cameras += 1


            before = len(
                all_features
            )


            count = process_camera(
                junction,
                camera_number,
                all_features
            )


            if count == 0:

                total_skipped += 1

            else:

                total_processed += count


    # ========================================================
    # SAVE FEATURES
    # ========================================================

    output_file = (
        REID_DIR
        / "vehicle_features.json"
    )


    with open(
        output_file,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            all_features,
            f
        )


    # ========================================================
    # SUMMARY
    # ========================================================

    cameras_found = sorted(
        set(
            x["camera_id"]
            for x in all_features
        )
    )


    junctions_found = sorted(
        set(
            x["junction"]
            for x in all_features
        )
    )


    print()
    print()
    print(
        "=============================================="
    )

    print(
        "RE-ID FEATURE EXTRACTION COMPLETE"
    )

    print(
        "=============================================="
    )

    print(
        f"Cameras configured : {total_cameras}"
    )

    print(
        f"Cameras with data  : {len(cameras_found)}"
    )

    print(
        f"Skipped cameras    : {total_skipped}"
    )

    print(
        f"Total features     : {len(all_features)}"
    )

    print(
        f"Junctions          : {junctions_found}"
    )

    print(
        f"Output             : {output_file}"
    )

    print(
        "=============================================="
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    main()