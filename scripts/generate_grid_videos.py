"""
scripts/generate_grid_videos.py

Generates lightweight, browser-optimized 480p H.264 MP4 sub-streams for the
4-camera CCTV grid view. The original high-res 1080p source videos are preserved.
"""

import sys
import time
from pathlib import Path
import subprocess

PROJECT_ROOT = Path(__file__).resolve().parents[1]
GRID_DIR = PROJECT_ROOT / "dataset" / "grid"
GRID_DIR.mkdir(parents=True, exist_ok=True)

try:
    import imageio_ffmpeg
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except Exception as e:
    print(f"[Error] imageio_ffmpeg not available: {e}")
    sys.exit(1)

CAMERAS = {
    "junction_A_camera_01": PROJECT_ROOT / "dataset" / "junction_A" / "camera_01.mp4",
    "junction_A_camera_02": PROJECT_ROOT / "dataset" / "junction_A" / "camera_02.mp4",
    "junction_B_camera_01": PROJECT_ROOT / "dataset" / "junction_B" / "camera_01.mp4",
    "junction_B_camera_02": PROJECT_ROOT / "dataset" / "junction_B" / "camera_02.mp4",
}

def generate_grid_video(cam_id: str, src_path: Path) -> Path:
    dest_path = GRID_DIR / f"{cam_id}.mp4"
    if dest_path.exists() and dest_path.stat().st_size > 1024:
        print(f"[Skip] Already exists: {dest_path.name} ({round(dest_path.stat().st_size / (1024*1024), 2)} MB)")
        return dest_path

    if not src_path.exists():
        print(f"[Warn] Source not found: {src_path}")
        return None

    print(f"[Transcoding] {cam_id} -> 480p grid sub-stream...")
    t0 = time.time()
    cmd = [
        FFMPEG_EXE,
        "-y",
        "-threads", "0",
        "-i", str(src_path),
        "-vf", "fps=20,scale=-2:480",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "27",
        "-pix_fmt", "yuv420p",
        "-an",
        "-movflags", "+faststart",
        str(dest_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    dt = round(time.time() - t0, 2)
    sz = round(dest_path.stat().st_size / (1024 * 1024), 2)
    print(f"[Done] Created {dest_path.name} in {dt}s ({sz} MB, original was {round(src_path.stat().st_size / (1024*1024), 2)} MB)")
    return dest_path

def main():
    print("=== CCTV GRID SUB-STREAM GENERATOR ===")
    for cam_id, src in CAMERAS.items():
        generate_grid_video(cam_id, src)
    print("=== ALL GRID SUB-STREAMS READY ===")

if __name__ == "__main__":
    main()
