"""FFmpeg video composition pipeline.

Handles: clip concatenation, transitions (crossfade/dissolve/wipe/cut),
text overlays with animations, background music mixing, H.264/AAC encoding.
"""
import subprocess
import os
import shutil
import logging
import tempfile
import asyncio
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

# Resolve ffmpeg binary — prefer PATH, fall back to known WinGet install location
def _find_ffmpeg() -> str:
    if shutil.which("ffmpeg"):
        return "ffmpeg"
    winget_path = os.path.expandvars(
        r"%LOCALAPPDATA%\Microsoft\WinGet\Packages"
        r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
        r"\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
    )
    if os.path.isfile(winget_path):
        return winget_path
    return "ffmpeg"  # let it fail with a clear message

FFMPEG = _find_ffmpeg()

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
            # Log first 800 chars (actual error) — skip last part which is just FFmpeg build config
            err_lines = [l for l in (result.stderr or "").splitlines() if not l.startswith(" ") or "Error" in l or "Invalid" in l or "error" in l.lower()]
            logger.error("FFmpeg error [%s]: %s", desc, "\n".join(err_lines[:20]) or result.stderr[:800])
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

    # format=rgb24 first to handle RGBA/palette PNGs and WebP from Gemini
    scale_filter = (
        f"format=rgb24,"
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"fps={fps}"
    )
    if is_video:
        cmd = [
            FFMPEG, "-y",
            "-i", media_path,
            "-t", str(duration_sec),
            "-vf", scale_filter,
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
            "-an",
            "-pix_fmt", "yuv420p",
            output_path,
        ]
    else:
        # FFmpeg 8.0 removed -loop as an input option for images.
        # Use the loop video filter instead: loop=-1 loops forever, size=1 reads 1 frame.
        loop_scale_filter = f"loop=loop=-1:size=1:start=0,{scale_filter}"
        cmd = [
            FFMPEG, "-y",
            "-i", media_path,
            "-t", str(duration_sec),
            "-vf", loop_scale_filter,
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
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
        FFMPEG, "-y",
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
    volume: float = 0.8,
) -> bool:
    """Mix background music into the video (source clips are silent so no merge needed)."""
    # Primary: loop music, apply volume, pad to video length, copy video stream unchanged.
    cmd = [
        FFMPEG, "-y",
        "-i", video_path,
        "-stream_loop", "-1", "-i", music_path,
        "-filter_complex", f"[1:a]volume={volume},apad[a]",
        "-map", "0:v",
        "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        output_path,
    ]
    if _run_ffmpeg(cmd, "add music"):
        return True

    # Fallback: simpler command without filter_complex
    cmd2 = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-stream_loop", "-1", "-i", music_path,
        "-map", "0:v",
        "-map", "1:a",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-af", f"volume={volume}",
        "-shortest",
        output_path,
    ]
    return _run_ffmpeg(cmd2, "add music (fallback)")


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
        FFMPEG, "-y",
        "-i", video_path,
        "-filter_complex", f"[0:v]{filter_str}[vout]",
        "-map", "[vout]",
        "-map", "0:a?",
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
    effects: Optional[list] = None,
    beat_map: Optional[dict] = None,
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

    def _best_url(clip: dict) -> str:
        return (clip.get("local_media_path") or
                clip.get("generated_media_url") or
                clip.get("thumbnail_url") or "")

    sorted_clips = sorted(clips, key=lambda c: c.get("order", 0))
    playable_clips = [c for c in sorted_clips if _best_url(c)]
    logger.info("compose_trailer: %d total clips, %d playable", len(clips), len(playable_clips))
    for i, c in enumerate(clips):
        logger.info("  clip[%d] id=%s type=%s gen_status=%s gen_url=%s thumb=%s local=%s",
                    i, c.get("id","?"), c.get("type","?"), c.get("gen_status","?"),
                    bool(c.get("generated_media_url")), bool(c.get("thumbnail_url")), bool(c.get("local_media_path")))

    if not playable_clips:
        return {
            "status": "error",
            "message": "No clips with generated media to compose",
            "output_path": output_path,
        }

    tmpdir = tempfile.mkdtemp(prefix="frameflow_render_")

    try:
        # Step 0: Download all remote URLs in parallel to avoid sequential fetches
        if progress_callback:
            await progress_callback(5, "Downloading clips...")

        async def _download(clip: dict, idx: int) -> str:
            url = _best_url(clip)
            if not url:
                return ""
            # Handle base64 data URLs — decode to temp file so FFmpeg can read them
            if url.startswith("data:"):
                import base64 as _b64
                try:
                    header, b64data = url.split(",", 1)
                    mime = header.split(";")[0].split(":")[1] if ":" in header else "image/png"
                    ext = ".jpg" if ("jpeg" in mime or "jpg" in mime) else ".png"
                    dest = os.path.join(tmpdir, f"dl_{idx:03d}{ext}")
                    with open(dest, "wb") as f:
                        f.write(_b64.b64decode(b64data))
                    return dest
                except Exception as e:
                    logger.warning("Failed to decode data URL for clip %d: %s", idx, e)
                    return ""
            if not url.startswith("http"):
                return url
            # Detect video URL by extension OR clip type
            url_lower = url.split("?")[0].lower()
            ext = ".mp4" if (clip.get("type") == "video" or url_lower.endswith(".mp4") or "fal_" in url_lower) else ".jpg"
            dest = os.path.join(tmpdir, f"dl_{idx:03d}{ext}")
            try:
                async with httpx.AsyncClient(timeout=120) as client:
                    r = await client.get(url)
                    r.raise_for_status()
                    with open(dest, "wb") as f:
                        f.write(r.content)
                return dest
            except Exception as e:
                logger.warning("Failed to download clip %d (%s): %s", idx, url, e)
                return url  # fall back to URL, FFmpeg will try

        local_paths = await asyncio.gather(*[_download(c, i) for i, c in enumerate(playable_clips)])

        # Step 1: Create standardized clips
        if progress_callback:
            await progress_callback(10, "Preparing clips...")

        clip_video_paths = []
        for i, clip in enumerate(playable_clips):
            media_path = local_paths[i]
            clip_output = os.path.join(tmpdir, f"clip_{i:03d}.mp4")
            # Detect video by type field OR by file extension (fal clips have type="image" but .mp4 URLs)
            is_video = clip.get("type") == "video" or (media_path or "").endswith(".mp4")

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
                FFMPEG, "-y",
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
                    FFMPEG, "-y",
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

        # Step 5: Apply AMV effects
        if effects:
            if progress_callback:
                await progress_callback(90, f"Applying {len(effects)} AMV effects...")
            effects_output = os.path.join(tmpdir, "with_effects.mp4")
            ok = await apply_amv_effects(music_output, effects_output, effects, width, height)
            final_input = effects_output if ok else music_output
        else:
            final_input = music_output

        # Step 6: Copy to final output with faststart for browser streaming
        if progress_callback:
            await progress_callback(97, "Final encoding...")

        faststart_cmd = [
            FFMPEG, "-y",
            "-i", final_input,
            "-c", "copy",
            "-movflags", "+faststart",
            output_path,
        ]
        if not _run_ffmpeg(faststart_cmd, "faststart remux"):
            shutil.copy2(final_input, output_path)

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


def _build_amv_effects_filter(effects: list, width: int, height: int) -> str:
    """Build an FFmpeg -vf filter chain that applies AMV beat effects at given timestamps.
    Each effect can have optional `params` dict with fine-grained controls per effect type.
    Falls back to intensity-based defaults when params are absent.
    """
    if not effects:
        return ""
    parts = []

    def p(eff: dict, key: str, default):
        """Get param value with fallback to default."""
        val = (eff.get("params") or {}).get(key)
        return val if val is not None else default

    for eff in sorted(effects, key=lambda e: e.get("timestamp_ms", 0)):
        t_s = eff["timestamp_ms"] / 1000.0
        t_e = (eff["timestamp_ms"] + eff.get("duration_ms", 200)) / 1000.0
        intensity = max(0.1, min(1.0, eff.get("intensity", 0.8)))
        en = f"between(t,{t_s:.4f},{t_e:.4f})"
        etype = eff.get("type", "")

        if etype == "flash_white":
            b = p(eff, "brightness", min(1.5, 0.5 + intensity))
            s = p(eff, "saturation", 0.1)
            parts.append(f"eq=brightness={float(b):.3f}:saturation={float(s):.2f}:enable='{en}'")

        elif etype == "flash_black":
            b = p(eff, "brightness", max(-0.9, -0.5 - intensity * 0.4))
            parts.append(f"eq=brightness={float(b):.3f}:enable='{en}'")

        elif etype == "zoom_burst":
            z = float(p(eff, "scale", 1.0 + intensity * 0.8))
            cx = float(p(eff, "center_x", 50)) / 100.0
            cy = float(p(eff, "center_y", 50)) / 100.0
            sw = int(width * z)
            sh = int(height * z)
            crop_x = max(0, int((sw - width) * cx))
            crop_y = max(0, int((sh - height) * cy))
            parts.append(f"scale={sw}:{sh}:enable='{en}'")
            parts.append(f"crop={width}:{height}:{crop_x}:{crop_y}:enable='{en}'")

        elif etype == "zoom_out":
            z = float(p(eff, "scale", max(0.5, 1.0 - intensity * 0.4)))
            cx = float(p(eff, "center_x", 50)) / 100.0
            cy = float(p(eff, "center_y", 50)) / 100.0
            sw = max(1, int(width * z))
            sh = max(1, int(height * z))
            pad_x = int((width - sw) * cx)
            pad_y = int((height - sh) * cy)
            parts.append(f"scale={sw}:{sh}:enable='{en}'")
            parts.append(f"pad={width}:{height}:{pad_x}:{pad_y}:black:enable='{en}'")

        elif etype == "shake":
            radius = float(p(eff, "radius", max(1.0, intensity * 5.0)))
            sigma = max(0.5, radius * 0.6)
            parts.append(f"gblur=sigma={sigma:.1f}:enable='{en}'")

        elif etype == "heavy_shake":
            radius = float(p(eff, "radius", max(4.0, intensity * 12.0)))
            sigma = max(1.0, radius * 0.7)
            parts.append(f"gblur=sigma={sigma:.1f}:steps=4:enable='{en}'")

        elif etype == "echo":
            frames = int(p(eff, "frames", max(2, min(6, int(intensity * 4) + 2))))
            decay = float(p(eff, "decay", max(0.1, 0.5 - intensity * 0.15)))
            w_vals = " ".join([f"{max(0.03, 1.5 - i * decay):.2f}" for i in range(frames)])
            parts.append(f"tmix=frames={frames}:weights='{w_vals}':enable='{en}'")

        elif etype == "speed_ramp":
            sigma = float(p(eff, "sigma", max(0.5, intensity * 3.0)))
            parts.append(f"gblur=sigma={sigma:.1f}:steps=2:enable='{en}'")

        elif etype == "chromatic":
            shift = int(p(eff, "shift", max(2, int(intensity * 14))))
            parts.append(f"rgbashift=rh={shift}:bh=-{shift}:rv=0:bv=0:enable='{en}'")

        elif etype == "panel_split":
            count = int(p(eff, "count", 2))
            thickness = int(p(eff, "thickness", max(3, int(intensity * 8))))
            for i in range(1, count):
                cx = int(width * i / count) - thickness // 2
                parts.append(f"drawbox=x={cx}:y=0:w={thickness}:h=ih:color=white@0.85:t=fill:enable='{en}'")

        elif etype == "reverse":
            c = float(p(eff, "contrast", min(3.0, 1.5 + intensity * 1.5)))
            s = float(p(eff, "glow", min(3.0, 1.0 + intensity * 2.0)))
            parts.append(f"eq=contrast={c:.2f}:saturation={s:.2f}:enable='{en}'")

        elif etype == "glitch":
            h_shift = int(p(eff, "hue_shift", int(intensity * 120)))
            s_boost = float(p(eff, "glow", min(5.0, 1.0 + intensity * 4.0)))
            parts.append(f"hue=h={h_shift}:s={s_boost:.1f}:enable='{en}'")

        elif etype == "strobe":
            b = float(p(eff, "brightness", 1.3))
            parts.append(f"eq=brightness={b:.2f}:saturation=0:enable='{en}'")

        elif etype == "time_echo":
            frames = int(p(eff, "frames", max(4, min(8, int(intensity * 5) + 3))))
            decay = float(p(eff, "decay", 0.35))
            w_vals = " ".join([f"{max(0.03, 1.5 - i * decay):.2f}" for i in range(frames)])
            parts.append(f"tmix=frames={frames}:weights='{w_vals}':enable='{en}'")

        elif etype == "freeze":
            frames = int(p(eff, "frames", max(6, min(12, int(intensity * 8) + 4))))
            w_vals = " ".join(["1.00" for _ in range(frames)])
            parts.append(f"tmix=frames={frames}:weights='{w_vals}':enable='{en}'")

        elif etype == "rgb_shift_v":
            shift = int(p(eff, "shift", max(2, int(intensity * 14))))
            parts.append(f"rgbashift=rv={shift}:bv=-{shift}:rh=0:bh=0:enable='{en}'")

        elif etype == "cross_cut":
            thickness = int(p(eff, "thickness", max(3, int(intensity * 8))))
            cx = width // 2 - thickness // 2
            cy = height // 2 - thickness // 2
            parts.append(f"drawbox=x={cx}:y=0:w={thickness}:h=ih:color=white@0.9:t=fill:enable='{en}'")
            parts.append(f"drawbox=x=0:y={cy}:w=iw:h={thickness}:color=white@0.9:t=fill:enable='{en}'")

        elif etype == "flicker":
            noise_level = int(p(eff, "amount", max(20, int(intensity * 65))))
            parts.append(f"noise=alls={noise_level}:allf=u:enable='{en}'")

        elif etype == "vignette":
            angle_denom = int(p(eff, "angle", max(2, int(6 - intensity * 4))))
            parts.append(f"vignette=PI/{angle_denom}:enable='{en}'")

        elif etype == "black_white":
            c = float(p(eff, "contrast", min(1.6, 1.0 + intensity * 0.5)))
            parts.append(f"eq=saturation=0:contrast={c:.2f}:enable='{en}'")

        elif etype == "invert":
            parts.append(f"negate:enable='{en}'")

        elif etype == "red_flash":
            color_hex = p(eff, "color", None)
            if color_hex and isinstance(color_hex, str):
                # Parse hex color string like '#dc2626'
                h = color_hex.lstrip('#')
                cr = int(h[0:2], 16) / 255.0 if len(h) >= 6 else 1.0
                cg = int(h[2:4], 16) / 255.0 if len(h) >= 6 else 0.0
                cb = int(h[4:6], 16) / 255.0 if len(h) >= 6 else 0.0
                boost = min(2.2, 1.0 + intensity * 1.2)
                if cr > 0.8 and cg < 0.3 and cb < 0.3:
                    # Red — boost red channel
                    parts.append(
                        f"colorchannelmixer=rr={boost:.2f}:rg=0:rb=0:"
                        f"gr=0:gg=0.08:gb=0:"
                        f"br=0:bg=0:bb=0.08:enable='{en}'"
                    )
                elif cr < 0.3 and cg < 0.3 and cb < 0.3:
                    # Black — darken
                    dark = max(-0.9, -0.5 - intensity * 0.4)
                    parts.append(f"eq=brightness={dark:.3f}:enable='{en}'")
                elif cr > 0.5 and cb > 0.5 and cg < 0.4:
                    # Violet/purple — boost red+blue
                    parts.append(
                        f"colorchannelmixer=rr={boost:.2f}:rg=0:rb=0:"
                        f"gr=0:gg=0.05:gb=0:"
                        f"br=0:bg=0:bb={boost:.2f}:enable='{en}'"
                    )
                else:
                    # Generic: scale each channel by its color component
                    rr = max(0.05, cr * boost)
                    gg = max(0.05, cg * boost)
                    bb = max(0.05, cb * boost)
                    parts.append(
                        f"colorchannelmixer=rr={rr:.2f}:gg={gg:.2f}:bb={bb:.2f}:enable='{en}'"
                    )
            else:
                # Default red flash (no color param)
                r_boost = float(p(eff, "glow", min(2.2, 1.0 + intensity * 1.2)))
                parts.append(
                    f"colorchannelmixer=rr={r_boost:.2f}:rg=0:rb=0:"
                    f"gr=0:gg=0.08:gb=0:"
                    f"br=0:bg=0:bb=0.08:enable='{en}'"
                )

        elif etype == "blur_out":
            sigma = float(p(eff, "sigma", max(5.0, intensity * 22.0)))
            parts.append(f"gblur=sigma={sigma:.1f}:steps=2:enable='{en}'")

        elif etype == "film_grain":
            noise_level = int(p(eff, "amount", max(8, int(intensity * 32))))
            parts.append(f"noise=alls={noise_level}:allf=t+u:enable='{en}'")

        elif etype == "letterbox":
            bar_pct = float(p(eff, "bar_size", None) or (6 + intensity * 12))
            bar_h = max(20, int(height * bar_pct / 100))
            parts.append(f"drawbox=x=0:y=0:w=iw:h={bar_h}:color=black:t=fill:enable='{en}'")
            parts.append(f"drawbox=x=0:y=ih-{bar_h}:w=iw:h={bar_h}:color=black:t=fill:enable='{en}'")

        elif etype == "neon":
            h_shift = int(p(eff, "hue_shift", int(intensity * 100 + 200)))
            s_boost = float(p(eff, "glow", min(5.5, 1.0 + intensity * 4.5)))
            parts.append(f"hue=h={h_shift}:s={s_boost:.1f}:enable='{en}'")

        elif etype == "sepia":
            parts.append(
                f"colorchannelmixer="
                f"rr=0.393:rg=0.769:rb=0.189:"
                f"gr=0.349:gg=0.686:gb=0.168:"
                f"br=0.272:bg=0.534:bb=0.131:enable='{en}'"
            )

        elif etype == "overexpose":
            b = float(p(eff, "brightness", min(1.0, 0.3 + intensity * 0.7)))
            c = float(p(eff, "contrast", 0.55))
            parts.append(f"eq=brightness={b:.3f}:contrast={c:.2f}:saturation=0.1:enable='{en}'")

        elif etype == "pixelate":
            size = int(p(eff, "size", max(4, int(intensity * 20))))
            parts.append(f"avgblur=sizeX={size}:sizeY={size}:enable='{en}'")

        elif etype == "contrast_punch":
            c = float(p(eff, "contrast", min(4.5, 1.5 + intensity * 3.0)))
            b = float(p(eff, "brightness", max(-0.4, -intensity * 0.35)))
            s = float(p(eff, "saturation", max(0.0, 1.0 - intensity * 0.6)))
            parts.append(f"eq=contrast={c:.2f}:brightness={b:.3f}:saturation={s:.2f}:enable='{en}'")

        elif etype == "manga_ink":
            c = float(p(eff, "contrast", min(7.0, 2.0 + intensity * 5.0)))
            b = float(p(eff, "brightness", max(-0.55, -intensity * 0.45)))
            parts.append(f"eq=saturation=0:contrast={c:.2f}:brightness={b:.3f}:enable='{en}'")

        elif etype == "flash":
            color_int = int(p(eff, "color", 16777215))
            r = ((color_int >> 16) & 0xFF) / 255.0
            g = ((color_int >> 8) & 0xFF) / 255.0
            b = (color_int & 0xFF) / 255.0
            brightness = float(p(eff, "brightness", min(1.5, 0.5 + intensity)))
            sat = float(p(eff, "saturation", 0.1))
            if r > 0.8 and g < 0.3 and b < 0.3:  # red flash
                r_boost = float(p(eff, "glow", min(2.2, 1.0 + intensity * 1.2)))
                parts.append(
                    f"colorchannelmixer=rr={r_boost:.2f}:rg=0:rb=0:"
                    f"gr=0:gg=0.08:gb=0:"
                    f"br=0:bg=0:bb=0.08:enable='{en}'"
                )
            elif r < 0.3 and g < 0.3 and b < 0.3:  # black flash
                dark = float(p(eff, "brightness", max(-0.9, -0.5 - intensity * 0.4)))
                parts.append(f"eq=brightness={dark:.3f}:enable='{en}'")
            else:
                # Generic color flash via colorchannelmixer boost + eq brightness
                parts.append(
                    f"colorchannelmixer=rr={r:.2f}:gg={g:.2f}:bb={b:.2f}:enable='{en}'"
                )
                parts.append(f"eq=brightness={brightness:.3f}:saturation={sat:.2f}:enable='{en}'")

        elif etype == "shake_h":
            radius = float(p(eff, "radius", max(2.0, intensity * 8.0)))
            parts.append(f"gblur=sigma={radius*0.5:.1f}:sigmaV=0.1:enable='{en}'")

        elif etype == "shake_v":
            radius = float(p(eff, "radius", max(2.0, intensity * 8.0)))
            parts.append(f"gblur=sigma=0.1:sigmaV={radius*0.5:.1f}:enable='{en}'")

        elif etype == "zoom_pulse":
            z = float(p(eff, "scale", 1.0 + intensity * 0.2))
            sw = int(width * z)
            sh = int(height * z)
            cx = int((sw - width) * 0.5)
            cy = int((sh - height) * 0.5)
            parts.append(f"scale={sw}:{sh}:enable='{en}'")
            parts.append(f"crop={width}:{height}:{cx}:{cy}:enable='{en}'")

        elif etype == "whip_pan":
            sigma = float(p(eff, "sigma", max(4.0, intensity * 15.0)))
            parts.append(f"gblur=sigma={sigma:.1f}:steps=3:enable='{en}'")

        elif etype == "stutter":
            frames = int(p(eff, "frames", max(2, min(6, int(intensity * 4) + 2))))
            w_vals = " ".join(["1.00" if i % 2 == 0 else "0.10" for i in range(frames)])
            parts.append(f"tmix=frames={frames}:weights='{w_vals}':enable='{en}'")

        elif etype == "duotone":
            h_shift = int(p(eff, "hue_shift", int(intensity * 180 + 160)))
            s_boost = float(p(eff, "glow", min(5.0, 1.5 + intensity * 3.5)))
            parts.append(f"hue=h={h_shift}:s={s_boost:.1f}:enable='{en}'")
            parts.append(f"eq=contrast=1.3:enable='{en}'")

        elif etype == "lut_warm":
            strength = float(p(eff, "brightness", 0.3 + intensity * 0.3))
            parts.append(
                f"colorbalance=rs={strength*0.4:.3f}:gs={-strength*0.1:.3f}:bs={-strength*0.3:.3f}:"
                f"rm={strength*0.2:.3f}:gm=0:bm={-strength*0.15:.3f}:"
                f"rh={strength*0.1:.3f}:gh={strength*0.05:.3f}:bh={-strength*0.1:.3f}:enable='{en}'"
            )

        elif etype == "lut_cold":
            strength = float(p(eff, "brightness", 0.3 + intensity * 0.3))
            parts.append(
                f"colorbalance=rs={-strength*0.3:.3f}:gs={-strength*0.1:.3f}:bs={strength*0.4:.3f}:"
                f"rm={-strength*0.15:.3f}:gm=0:bm={strength*0.2:.3f}:"
                f"rh={-strength*0.1:.3f}:gh={strength*0.05:.3f}:bh={strength*0.1:.3f}:enable='{en}'"
            )

        elif etype == "cyberpunk":
            cyan = float(p(eff, "shift", 2.5))
            magenta = float(p(eff, "glow", 2.5))
            parts.append(
                f"colorchannelmixer=rr=1:rg={0.2*magenta:.2f}:rb={0.15*magenta:.2f}:"
                f"gr={0.1*cyan:.2f}:gg=1:gb={0.3*cyan:.2f}:"
                f"br={0.15*magenta:.2f}:bg={0.3*cyan:.2f}:bb=1:enable='{en}'"
            )
            parts.append(f"eq=saturation={min(3.0, 1.0 + intensity*2.0):.1f}:contrast=1.2:enable='{en}'")

        elif etype == "horror":
            r_tint = float(p(eff, "glow", min(2.5, 1.2 + intensity * 1.3)))
            noise_level = int(p(eff, "amount", max(15, int(intensity * 40))))
            parts.append(
                f"colorchannelmixer=rr={r_tint:.2f}:rg=0:rb=0:"
                f"gr=0:gg=0.3:gb=0:"
                f"br=0:bg=0:bb=0.3:enable='{en}'"
            )
            parts.append(f"eq=saturation=0.25:enable='{en}'")
            parts.append(f"vignette=PI/3:enable='{en}'")
            parts.append(f"noise=alls={noise_level}:allf=t+u:enable='{en}'")

        elif etype == "bleach_bypass":
            c = float(p(eff, "contrast", min(3.5, 1.5 + intensity * 2.0)))
            s = float(p(eff, "saturation", max(0.05, 0.4 - intensity * 0.3)))
            parts.append(f"eq=saturation={s:.2f}:contrast={c:.2f}:brightness={-0.1*intensity:.3f}:enable='{en}'")

        elif etype == "color_shift":
            h = int(p(eff, "hue_shift", int(intensity * 180)))
            s = float(p(eff, "glow", min(3.0, 1.0 + intensity * 2.0)))
            parts.append(f"hue=h={h}:s={s:.1f}:enable='{en}'")

        elif etype == "posterize":
            levels = int(p(eff, "size", max(2, int(8 - intensity * 6))))
            parts.append(f"posterize={levels}:enable='{en}'")

        elif etype == "split_tone":
            shadow_h = int(p(eff, "hue_shift", 200))
            parts.append(f"colorbalance=rs=-0.2:bs=0.3:enable='{en}'")
            parts.append(f"hue=h={shadow_h // 10}:enable='{en}'")

        elif etype == "scanlines":
            noise_level = int(p(eff, "amount", max(10, int(intensity * 35))))
            parts.append(f"noise=alls={noise_level}:allf=u:enable='{en}'")
            parts.append(f"eq=contrast=1.15:brightness=-0.05:enable='{en}'")

        elif etype == "vhs":
            tracking = int(p(eff, "shift", max(2, int(intensity * 10))))
            noise_level = int(p(eff, "amount", max(10, int(intensity * 35))))
            parts.append(f"rgbashift=rh={tracking}:bh=-{tracking}:rv=0:bv=0:enable='{en}'")
            parts.append(f"noise=alls={noise_level}:allf=t+u:enable='{en}'")

        elif etype == "halftone":
            size = int(p(eff, "size", max(4, int(intensity * 10 + 3))))
            parts.append(f"avgblur=sizeX={size}:sizeY={size}:enable='{en}'")
            parts.append(f"eq=contrast=2.5:brightness=-0.1:enable='{en}'")

        elif etype == "impact_lines":
            # Speed lines: vignette inversion + contrast
            sigma = max(2.0, intensity * 8.0)
            parts.append(f"gblur=sigma={sigma:.1f}:steps=1:enable='{en}'")
            parts.append(f"eq=contrast=3.0:brightness=0.3:saturation=0:enable='{en}'")

        elif etype == "glow_bloom":
            sigma = float(p(eff, "sigma", max(3.0, intensity * 12.0)))
            strength = float(p(eff, "brightness", 0.5 + intensity * 0.5))
            parts.append(f"gblur=sigma={sigma:.1f}:steps=2:enable='{en}'")
            parts.append(f"eq=brightness={strength*0.3:.3f}:saturation={1.0+strength*0.3:.2f}:enable='{en}'")

        elif etype == "tv_noise":
            noise_level = int(p(eff, "amount", max(15, int(intensity * 50))))
            parts.append(f"noise=alls={noise_level}:allf=t+u:enable='{en}'")

        elif etype == "radial_blur":
            sigma = float(p(eff, "sigma", max(4.0, intensity * 15.0)))
            parts.append(f"gblur=sigma={sigma:.1f}:steps=3:enable='{en}'")

        elif etype == "tilt_shift":
            sigma = float(p(eff, "sigma", max(2.0, intensity * 10.0)))
            parts.append(f"gblur=sigma={sigma:.1f}:steps=2:enable='{en}'")

        elif etype == "mirror_h":
            parts.append(f"hflip:enable='{en}'")

        elif etype == "rain":
            noise_level = int(p(eff, "count", max(8, int(intensity * 20))))
            parts.append(f"noise=alls={noise_level}:allf=u:enable='{en}'")
            sigma = max(0.5, intensity * 1.5)
            parts.append(f"gblur=sigma={sigma:.1f}:sigmaV=0.1:enable='{en}'")

    return ",".join(parts) if parts else ""


async def apply_amv_effects(
    input_path: str,
    output_path: str,
    effects: list,
    width: int,
    height: int,
) -> bool:
    """Apply AMV beat effects to a video using FFmpeg filter chain."""
    vf = _build_amv_effects_filter(effects, width, height)
    if not vf:
        shutil.copy2(input_path, output_path)
        return True

    # Use filter_complex so video and audio are handled separately.
    # This ensures the music audio stream (from the previous step) is preserved
    # unchanged while only video filters are applied.
    cmd = [
        FFMPEG, "-y",
        "-i", input_path,
        "-filter_complex", f"[0:v]{vf}[vout]",
        "-map", "[vout]",
        "-map", "0:a?",          # copy audio if present, skip if not (? = optional)
        "-c:v", "libx264", "-preset", "fast", "-crf", "21",
        "-c:a", "copy",
        "-pix_fmt", "yuv420p",
        output_path,
    ]
    return _run_ffmpeg(cmd, "apply amv effects")


async def generate_preview(input_path: str, output_path: str, max_width: int = 640) -> bool:
    """Generate a lower-quality preview version of a video."""
    _ensure_dir(output_path)
    cmd = [
        FFMPEG, "-y",
        "-i", input_path,
        "-vf", f"scale={max_width}:-2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
        "-c:a", "aac", "-b:a", "96k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_path,
    ]
    return _run_ffmpeg(cmd, "generate preview")


async def extract_thumbnail(input_path: str, output_path: str, timestamp_sec: float = 0.5) -> bool:
    """Extract a thumbnail frame from a video."""
    _ensure_dir(output_path)
    cmd = [
        FFMPEG, "-y",
        "-i", input_path,
        "-ss", str(timestamp_sec),
        "-vframes", "1",
        "-q:v", "2",
        output_path,
    ]
    return _run_ffmpeg(cmd, "extract thumbnail")
