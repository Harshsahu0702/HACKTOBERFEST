"""
calibration.py — Camera calibration loader and coordinate transform utilities.

Coordinate system note
----------------------
The S01 homography matrices map image pixel coordinates to a 2-D ground-plane
coordinate system that is internal to the CityFlowV2 / AIC22 dataset.  These
are NOT geographic (lat/lon) coordinates.  The dataset README states only a
single approximate GPS centre for S01 (42.525678, -90.723601), which is
insufficient to geo-reference individual pixel positions.

Pipeline per camera:
  c001–c004:  raw pixel (u,v)  →  H  →  world (wx, wy)
  c005:       raw pixel (u,v)  →  undistort(K,D)  →  (u',v')  →  H  →  world (wx, wy)

All world coordinates are stored as-is (camera-local ground-plane units).
geo_lat / geo_lon remain None unless a verified per-camera GPS transform is
added in the future.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class CameraCalibration:
    """Parsed calibration data for one camera."""
    camera_id: str
    homography: np.ndarray              # 3×3 float64
    intrinsic: Optional[np.ndarray]     # 3×3 float64, None when not provided
    distortion: Optional[np.ndarray]    # 1×4 float64 [k1,k2,p1,p2], None when not provided
    reprojection_error: float
    # Derived convenience flags
    has_distortion: bool = field(init=False)

    def __post_init__(self) -> None:
        self.has_distortion = (
            self.distortion is not None
            and np.any(self.distortion != 0.0)
        )


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def _parse_matrix(text: str) -> np.ndarray:
    """Parse a semicolon-separated 3×3 matrix string."""
    rows = text.strip().split(";")
    return np.array([[float(v) for v in r.split()] for r in rows], dtype=np.float64)


def load_calibration(camera_id: str, calibration_path: Path) -> CameraCalibration:
    """
    Parse a CityFlowV2-style calibration.txt file.

    Expected format (c001–c004):
        Homography matrix: <3x3 semicolon-separated>
        Reprojection error: <float>

    Extended format (c005):
        Homography matrix: <3x3>
        Intrinsic parameter matrix: <3x3>
        Distortion coefficients: <k1 k2 p1 p2>
        Reprojection error: <float>
    """
    if not calibration_path.exists():
        raise FileNotFoundError(f"Calibration file not found: {calibration_path}")

    content = calibration_path.read_text(encoding="utf-8")
    lines = [l.strip() for l in content.splitlines() if l.strip()]

    homography: Optional[np.ndarray] = None
    intrinsic: Optional[np.ndarray] = None
    distortion: Optional[np.ndarray] = None
    reprojection_error: float = -1.0

    for line in lines:
        if line.startswith("Homography matrix:"):
            mat_str = line.split(":", 1)[1].strip()
            homography = _parse_matrix(mat_str)
        elif line.startswith("Intrinsic parameter matrix:"):
            mat_str = line.split(":", 1)[1].strip()
            intrinsic = _parse_matrix(mat_str)
        elif line.startswith("Distortion coefficients:"):
            coef_str = line.split(":", 1)[1].strip()
            distortion = np.array([float(v) for v in coef_str.split()], dtype=np.float64)
        elif line.startswith("Reprojection error:"):
            reprojection_error = float(line.split(":", 1)[1].strip())

    if homography is None:
        raise ValueError(f"No homography matrix found in {calibration_path}")

    return CameraCalibration(
        camera_id=camera_id,
        homography=homography,
        intrinsic=intrinsic,
        distortion=distortion,
        reprojection_error=reprojection_error,
    )


# ---------------------------------------------------------------------------
# Per-point transforms
# ---------------------------------------------------------------------------

def undistort_point(
    u: float,
    v: float,
    K: np.ndarray,
    D: np.ndarray,
) -> Tuple[float, float]:
    """
    Apply radial/tangential distortion correction to a single pixel point.

    Used only for cameras that have valid distortion coefficients (currently
    only c005 in S01, with k1=-0.60).

    Returns the undistorted pixel coordinates (u', v').
    """
    pts = np.array([[[u, v]]], dtype=np.float32)
    corrected = cv2.undistortPoints(pts, K.astype(np.float32), D.astype(np.float32), P=K.astype(np.float32))
    return float(corrected[0, 0, 0]), float(corrected[0, 0, 1])


def pixel_to_ground(
    u: float,
    v: float,
    H: np.ndarray,
) -> Tuple[float, float]:
    """
    Apply homography H to pixel (u, v) to get ground-plane coordinates.

    NOTE: The result (wx, wy) is in camera-local ground-plane units
          as defined by the CityFlowV2 calibration process.
          These are NOT geographic (lat/lon) coordinates.
    """
    pt = np.array([u, v, 1.0], dtype=np.float64)
    w = H @ pt
    if abs(w[2]) < 1e-10:
        return 0.0, 0.0
    return float(w[0] / w[2]), float(w[1] / w[2])


def trajectory_to_ground(
    pixel_trajectory: List[List[float]],
    calib: CameraCalibration,
) -> List[List[float]]:
    """
    Transform a list of pixel centroids [[cx, cy], ...] to ground-plane
    coordinates [[wx, wy], ...] using the camera's calibration.

    For c005 (has_distortion=True), undistortion is applied first.
    For c001–c004, the homography is applied directly.
    """
    world_trajectory: List[List[float]] = []
    for cx, cy in pixel_trajectory:
        if calib.has_distortion and calib.intrinsic is not None and calib.distortion is not None:
            cx, cy = undistort_point(cx, cy, calib.intrinsic, calib.distortion)
        wx, wy = pixel_to_ground(cx, cy, calib.homography)
        world_trajectory.append([round(wx, 3), round(wy, 3)])
    return world_trajectory


# ---------------------------------------------------------------------------
# Bulk loader (all cameras)
# ---------------------------------------------------------------------------

def load_all_calibrations(cameras_cfg: Dict) -> Dict[str, CameraCalibration]:
    """
    Load calibration for all cameras defined in cameras_cfg.
    Returns {camera_id: CameraCalibration}.
    Logs a warning and skips cameras with missing/malformed calibration files.
    """
    calibrations: Dict[str, CameraCalibration] = {}
    for cam_id, cfg in cameras_cfg.items():
        cal_path_str = cfg.get("calibration_path")
        if not cal_path_str:
            print(f"[calibration] WARNING: No calibration_path for {cam_id}, skipping.")
            continue
        cal_path = Path(cal_path_str)
        try:
            calib = load_calibration(cam_id, cal_path)
            print(
                f"[calibration] {cam_id}: loaded homography "
                f"(reprojection_error={calib.reprojection_error:.2f}px, "
                f"has_distortion={calib.has_distortion})"
            )
            calibrations[cam_id] = calib
        except Exception as exc:
            print(f"[calibration] WARNING: Failed to load calibration for {cam_id}: {exc}")
    return calibrations
