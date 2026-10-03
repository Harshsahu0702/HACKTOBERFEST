import os
import mimetypes
from pathlib import Path
from typing import Generator, Tuple, Optional
from fastapi import HTTPException
from fastapi.responses import StreamingResponse, FileResponse

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STATIC_PLATES_DIR = PROJECT_ROOT / "static" / "plates"
LEGACY_PLATES_DIR = PROJECT_ROOT / "runs" / "detect" / "plate_detection" / "plates"

def ensure_mp4_transcoded(camera_id: str, avi_path: Path, mp4_path: Path) -> Path:
    """Ensure that a browser-compatible faststart MP4 file exists for the camera."""
    if mp4_path.exists() and mp4_path.stat().st_size > 1024:
        return mp4_path

    if not avi_path.exists():
        raise FileNotFoundError(f"Source video not found: {avi_path}")

    try:
        import imageio_ffmpeg
        import subprocess

        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        cmd = [
            ffmpeg_exe,
            "-y",
            "-i", str(avi_path),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "24",
            "-movflags", "+faststart",
            str(mp4_path),
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return mp4_path
    except Exception as e:
        print(f"[video_service] Transcoding error for {camera_id}: {e}")
        return avi_path


def parse_byte_range(range_header: str, file_size: int) -> Tuple[int, int]:
    """Parse HTTP Range header e.g. 'bytes=0-1024' or 'bytes=1024-'."""
    try:
        range_str = range_header.replace("bytes=", "").strip()
        parts = range_str.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1

        if start >= file_size:
            start = file_size - 1
        if end >= file_size:
            end = file_size - 1
        if start > end:
            start = 0

        return start, end
    except Exception:
        return 0, file_size - 1


def file_chunk_generator(file_path: Path, start: int, end: int, chunk_size: int = 1024 * 1024) -> Generator[bytes, None, None]:
    """Yield chunks of a file for HTTP range responses."""
    with open(file_path, "rb") as f:
        f.seek(start)
        bytes_to_read = end - start + 1
        while bytes_to_read > 0:
            current_chunk_size = min(chunk_size, bytes_to_read)
            data = f.read(current_chunk_size)
            if not data:
                break
            bytes_to_read -= len(data)
            yield data


GRID_VIDEOS_DIR = PROJECT_ROOT / "dataset" / "grid"
EVIDENCE_CACHE_DIR = PROJECT_ROOT / "static" / "cache" / "evidence"
EVIDENCE_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def get_grid_video_path(camera_id: str) -> Optional[Path]:
    """Return lightweight 480p grid sub-stream path if it exists."""
    p = GRID_VIDEOS_DIR / f"{camera_id}.mp4"
    if p.exists() and p.stat().st_size > 1024:
        return p
    return None


def get_or_create_evidence_clip(
    camera_id: str,
    source_path: Path,
    timestamp: float,
    pre_roll: float = 5.0,
    duration: float = 15.0,
) -> Path:
    """
    Produce and cache a short trimmed evidence MP4 clip around the detection timestamp.
    Uses fast stream copy (-c copy) or ultrafast H.264 transcode with +faststart.
    """
    EVIDENCE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    t_int = int(round(timestamp))
    d_int = int(round(duration))
    pr_int = int(round(pre_roll))
    clip_filename = f"{camera_id}_t{t_int}_pr{pr_int}_d{d_int}.mp4"
    clip_path = EVIDENCE_CACHE_DIR / clip_filename

    if clip_path.exists() and clip_path.stat().st_size > 1024:
        return clip_path

    import subprocess
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    start_sec = max(0.0, timestamp - pre_roll)
    temp_clip = EVIDENCE_CACHE_DIR / f"temp_{clip_filename}"

    # Try fast stream copy first (< 50ms, preserves exact camera quality)
    cmd_copy = [
        ffmpeg_exe,
        "-y",
        "-ss", str(round(start_sec, 2)),
        "-i", str(source_path),
        "-t", str(round(duration, 2)),
        "-c", "copy",
        "-movflags", "+faststart",
        str(temp_clip),
    ]
    try:
        subprocess.run(cmd_copy, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if temp_clip.exists() and temp_clip.stat().st_size > 1024:
            temp_clip.replace(clip_path)
            return clip_path
    except Exception:
        pass

    # Fallback to ultrafast transcode
    cmd_transcode = [
        ffmpeg_exe,
        "-y",
        "-ss", str(round(start_sec, 2)),
        "-i", str(source_path),
        "-t", str(round(duration, 2)),
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-an",
        "-movflags", "+faststart",
        str(temp_clip),
    ]
    try:
        subprocess.run(cmd_transcode, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if temp_clip.exists() and temp_clip.stat().st_size > 1024:
            temp_clip.replace(clip_path)
            return clip_path
    except Exception as e:
        logger.error(f"Failed to transcode evidence clip: {e}")

    return source_path


def get_video_stream_response(video_path: Path, range_header: Optional[str] = None) -> FileResponse:
    """Return high-performance FileResponse supporting HTTP 206 range requests natively."""
    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Video file not found: {video_path.name}")

    media_type, _ = mimetypes.guess_type(str(video_path))
    if not media_type:
        media_type = "video/mp4"

    return FileResponse(
        video_path,
        media_type=media_type,
        headers={"Accept-Ranges": "bytes"},
    )


def get_plate_image_path(image_name: str) -> Optional[Path]:
    """Resolve plate crop image from static/plates or fallback."""
    if not image_name:
        return None
    clean_name = Path(image_name).name

    # 1. Direct check in STATIC_PLATES_DIR
    p1 = STATIC_PLATES_DIR / clean_name
    if p1.exists():
        return p1

    # 2. Check with .jpg extension appended if missing
    if not clean_name.lower().endswith((".jpg", ".jpeg", ".png")):
        p1_ext = STATIC_PLATES_DIR / f"{clean_name}.jpg"
        if p1_ext.exists():
            return p1_ext

    # 3. Check in LEGACY_PLATES_DIR
    p2 = LEGACY_PLATES_DIR / clean_name
    if p2.exists():
        return p2

    # 4. Check evaluation/crops
    eval_p = PROJECT_ROOT / "evaluation" / "crops" / clean_name
    if eval_p.exists():
        return eval_p

    # 5. Fuzzy match against all files in STATIC_PLATES_DIR
    for f in STATIC_PLATES_DIR.glob("*.jpg"):
        if clean_name in f.name or f.stem in clean_name:
            return f

    return None
