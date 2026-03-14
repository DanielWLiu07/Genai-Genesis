"""FFmpeg video composition pipeline.

Handles: clip concatenation, transitions (crossfade/dissolve/wipe/cut),
text overlays with animations, background music mixing, H.264/AAC encoding.
"""
import subprocess
import os
import shutil
import logging
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

RESOLUTION_MAP = {
    "720p": (1280, 720),
    "1080p": (1920, 1080),
}

ASPECT_RATIO_MAP = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
}


def _ensure_dir(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)


def _run_ffmpeg(cmd: list[str], desc: str = "") -> bool:
    """Run an ffmpeg command, return True on success."""
    logger.info("FFmpeg [%s]: %s", desc, " ".join(cmd))
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            logger.error("FFmpeg error [%s]: %s", desc, result.stderr[-500:] if result.stderr else "unknown")
            return False
        return True
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg timeout [%s]", desc)
        return False


def _create_clip_video(
    media_path: str,
    output_path: str,
    duration_ms: int,
    width: int,
    height: int,
    fps: int,
    is_video: bool = False,
) -> bool:
    """Convert a single image/video to a standardized clip with exact duration."""
    duration_sec = duration_ms / 1000.0

    if is_video:
        cmd = [
            "ffmpeg", "-y",
            "-i", media_path,
            "-t", str(duration_sec),
            "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,fps={fps}",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-an",
            "-pix_fmt", "yuv420p",
            output_path,
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", media_path,
            "-t", str(duration_sec),
            "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,fps={fps}",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p",
            output_path,
        ]

    return _run_ffmpeg(cmd, f"create clip {os.path.basename(output_path)}")


def _build_text_overlay_filter(
    text: str,
    text_style: Optional[dict],
    duration_ms: int,
    width: int,
    height: int,
) -> str:
    """Build an FFmpeg drawtext filter string with optional animation."""
    if not text:
        return ""

    style = text_style or {}
    font_size = style.get("font_size", 48)
    color = style.get("color", "white")
    position = style.get("position", "bottom")
    animation = style.get("animation", "")

    escaped = text.replace("'", "'\\''").replace(":", "\\:")

    y_map = {
        "top": "h*0.1",
        "center": "(h-text_h)/2",
        "bottom": "h*0.85-text_h",
    }
    y_expr = y_map.get(position, "(h-text_h)/2")

    base = (
        f"drawtext=text='{escaped}'"
        f":fontsize={font_size}"
        f":fontcolor={color}"
        f":x=(w-text_w)/2:y={y_expr}"
        f":shadowcolor=black@0.7:shadowx=2:shadowy=2"
    )

    if animation == "fade_in":
        base += f":alpha='if(lt(t,1),t,1)'"
    elif animation == "slide_up":
        base = (
            f"drawtext=text='{escaped}'"
            f":fontsize={font_size}"
            f":fontcolor={color}"
            f":x=(w-text_w)/2"
            f":y='if(lt(t,0.8),h+text_h-(h+text_h-({y_expr}))*t/0.8,{y_expr})'"
            f":shadowcolor=black@0.7:shadowx=2:shadowy=2"
        )
    elif animation == "typewriter":
        base += f":alpha='if(lt(t,0.3),0,1)'"

    return base


def _concatenate_with_transitions(
    clip_paths: list[str],
    clip_data: list[dict],
    output_path: str,
    fps: int,
) -> bool:
    """Concatenate clips with xfade transitions between them."""
    if not clip_paths:
        return False

    if len(clip_paths) == 1:
        shutil.copy2(clip_paths[0], output_path)
        return True

    transition_duration = 0.5

    inputs = []
    for p in clip_paths:
        inputs.extend(["-i", p])

    n = len(clip_paths)
    filter_parts = []
    cumulative_offset = 0.0

    for i in range(1, n):
        transition_type = clip_data[i - 1].get("transition_type", "fade")

        xfade_map = {
            "fade": "fade",
            "dissolve": "dissolve",
            "wipe": "wipeleft",
            "cut": "fade",
        }
        xfade_transition = xfade_map.get(transition_type, "fade")
        t_dur = 0.05 if transition_type == "cut" else transition_duration

        prev_dur = clip_data[i - 1].get("duration_ms", 3000) / 1000.0
        offset = cumulative_offset + prev_dur - t_dur
        cumulative_offset = offset

        if i == 1:
            src_label = "[0:v]"
        else:
            src_label = f"[v{i-1}]"

        out_label = f"[v{i}]" if i < n - 1 else "[vout]"

        filter_parts.append(
            f"{src_label}[{i}:v]xfade=transition={xfade_transition}:duration={t_dur}:offset={offset}{out_label}"
        )

    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p",
        output_path,
    ]

    return _run_ffmpeg(cmd, "concatenate with transitions")


def _add_music(
    video_path: str,
    music_path: str,
    output_path: str,
    volume: float = 0.3,
) -> bool:
    """Mix background music into the video."""
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-stream_loop", "-1", "-i", music_path,
        "-filter_complex", f"[1:a]volume={volume}[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        output_path,
    ]

    return _run_ffmpeg(cmd, "add music")


def _add_text_overlays(
    video_path: str,
    output_path: str,
    clips: list[dict],
    width: int,
    height: int,
) -> bool:
    """Add text overlays to the composed video at correct timestamps."""
    filters = []
    current_time = 0.0

    for clip in clips:
        text = clip.get("text", "")
        if not text:
            current_time += clip.get("duration_ms", 3000) / 1000.0
            continue

        duration_ms = clip.get("duration_ms", 3000)
        duration_sec = duration_ms / 1000.0
        end_time = current_time + duration_sec

        text_filter = _build_text_overlay_filter(
            text, clip.get("text_style"), duration_ms, width, height
        )
        if text_filter:
            text_filter += f":enable='between(t,{current_time},{end_time})'"
            filters.append(text_filter)

        current_time = end_time

    if not filters:
        shutil.copy2(video_path, output_path)
        return True

    filter_str = ",".join(filters)
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", filter_str,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        "-pix_fmt", "yuv420p",
        output_path,
    ]

    return _run_ffmpeg(cmd, "add text overlays")


async def compose_trailer(
    clips: list[dict],
    output_path: str,
    settings: Optional[dict] = None,
    music_track: Optional[dict] = None,
    progress_callback=None,
) -> dict:
    """Compose final trailer video from clips using FFmpeg.

    Args:
        clips: List of clip dicts with media paths, durations, transitions, text.
        output_path: Final output MP4 path.
        settings: {resolution, aspect_ratio, fps}
        music_track: {url, name, volume}
        progress_callback: async callable(progress: int, message: str)

    Returns: {status, output_path, message, duration_ms}
    """
    settings = settings or {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24}

    aspect = settings.get("aspect_ratio", "16:9")
    width, height = ASPECT_RATIO_MAP.get(aspect, (1920, 1080))

    res = settings.get("resolution", "1080p")
    if res in RESOLUTION_MAP:
        base_w, base_h = RESOLUTION_MAP[res]
        if aspect == "16:9":
            width, height = base_w, base_h
        elif aspect == "9:16":
            width, height = base_h, base_w
        elif aspect == "1:1":
            width = height = min(base_w, base_h)

    fps = settings.get("fps", 24)
    _ensure_dir(output_path)

    playable_clips = [
        c for c in clips
        if c.get("generated_media_url") or c.get("local_media_path")
    ]

    if not playable_clips:
        return {
            "status": "error",
            "message": "No clips with generated media to compose",
            "output_path": output_path,
        }

    tmpdir = tempfile.mkdtemp(prefix="frameflow_render_")

    try:
        # Step 1: Create standardized clips
        if progress_callback:
            await progress_callback(10, "Preparing clips...")

        clip_video_paths = []
        for i, clip in enumerate(playable_clips):
            media_path = clip.get("local_media_path") or clip.get("generated_media_url", "")
            clip_output = os.path.join(tmpdir, f"clip_{i:03d}.mp4")
            is_video = clip.get("type") == "video"

            success = _create_clip_video(
                media_path, clip_output,
                clip.get("duration_ms", 3000),
                width, height, fps, is_video,
            )
            if not success:
                logger.warning("Failed to process clip %d, skipping", i)
                continue

            clip_video_paths.append(clip_output)

            if progress_callback:
                pct = 10 + int(40 * (i + 1) / len(playable_clips))
                await progress_callback(pct, f"Processed clip {i+1}/{len(playable_clips)}")

        if not clip_video_paths:
            return {"status": "error", "message": "All clips failed to process"}

        # Step 2: Concatenate with transitions
        if progress_callback:
            await progress_callback(55, "Applying transitions...")

        concat_output = os.path.join(tmpdir, "concat.mp4")
        all_cuts = all(c.get("transition_type", "cut") == "cut" for c in playable_clips)

        if all_cuts or len(clip_video_paths) == 1:
            concat_list = os.path.join(tmpdir, "concat.txt")
            with open(concat_list, "w") as f:
                for p in clip_video_paths:
                    f.write(f"file '{p}'\n")
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", concat_list,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-pix_fmt", "yuv420p",
                concat_output,
            ]
            if not _run_ffmpeg(cmd, "simple concat"):
                return {"status": "error", "message": "Failed to concatenate clips"}
        else:
            if not _concatenate_with_transitions(
                clip_video_paths, playable_clips, concat_output, fps
            ):
                # Fallback to simple concat
                concat_list = os.path.join(tmpdir, "concat.txt")
                with open(concat_list, "w") as f:
                    for p in clip_video_paths:
                        f.write(f"file '{p}'\n")
                cmd = [
                    "ffmpeg", "-y",
                    "-f", "concat", "-safe", "0",
                    "-i", concat_list,
                    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                    "-pix_fmt", "yuv420p",
                    concat_output,
                ]
                if not _run_ffmpeg(cmd, "fallback concat"):
                    return {"status": "error", "message": "Failed to concatenate clips"}

        # Step 3: Add text overlays
        if progress_callback:
            await progress_callback(70, "Adding text overlays...")

        has_text = any(c.get("text") for c in playable_clips)
        text_output = os.path.join(tmpdir, "with_text.mp4")

        if has_text:
            if not _add_text_overlays(concat_output, text_output, playable_clips, width, height):
                text_output = concat_output
        else:
            text_output = concat_output

        # Step 4: Add background music
        if progress_callback:
            await progress_callback(85, "Mixing audio...")

        music_output = os.path.join(tmpdir, "with_music.mp4")
        music_path = None
        if music_track:
            music_path = music_track.get("local_path") or music_track.get("url")

        if music_path and os.path.exists(music_path):
            volume = music_track.get("volume", 0.3)
            if not _add_music(text_output, music_path, music_output, volume):
                music_output = text_output
        else:
            music_output = text_output

        # Step 5: Copy to final output
        if progress_callback:
            await progress_callback(95, "Final encoding...")

        shutil.copy2(music_output, output_path)

        total_duration_ms = sum(c.get("duration_ms", 3000) for c in playable_clips)

        if progress_callback:
            await progress_callback(100, "Render complete!")

        return {
            "status": "done",
            "output_path": output_path,
            "message": f"Trailer rendered: {len(playable_clips)} clips, {total_duration_ms/1000:.1f}s",
            "duration_ms": total_duration_ms,
        }

    except Exception as e:
        logger.error("Composition error: %s", str(e))
        return {"status": "error", "message": f"Composition failed: {str(e)}"}
    finally:
        try:
            shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass


async def generate_preview(input_path: str, output_path: str, max_width: int = 640) -> bool:
    """Generate a lower-quality preview version of a video."""
    _ensure_dir(output_path)
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vf", f"scale={max_width}:-2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
        "-c:a", "aac", "-b:a", "96k",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    return _run_ffmpeg(cmd, "generate preview")


async def extract_thumbnail(input_path: str, output_path: str, timestamp_sec: float = 0.5) -> bool:
    """Extract a thumbnail frame from a video."""
    _ensure_dir(output_path)
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-ss", str(timestamp_sec),
        "-vframes", "1",
        "-q:v", "2",
        output_path,
    ]
    return _run_ffmpeg(cmd, "extract thumbnail")
