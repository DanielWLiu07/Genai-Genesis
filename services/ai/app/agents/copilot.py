"""
Railtracks-powered AI Copilot agent for Lotus.

The CopilotAgent is an rt.agent_node whose LLM autonomously decides which
tools to call in response to a natural-language editing request. Each tool
records its call into a per-request ContextVar list so that the FastAPI
router can return them to the frontend (which applies them via Zustand).

Built with Railtracks — https://github.com/RailtownAI/railtracks
"""

import os
import json
import logging
from contextvars import ContextVar
from typing import Optional

logger = logging.getLogger(__name__)

# ── Railtracks env setup ────────────────────────────────────────────────────
def _init_railtracks_env():
    """Ensure GOOGLE_API_KEY is set so Railtracks GeminiLLM can initialise."""
    if not os.environ.get("GOOGLE_API_KEY"):
        try:
            from app.config import get_settings
            key = get_settings().gemini_api_key
            if key:
                os.environ["GOOGLE_API_KEY"] = key
        except Exception:
            pass

_init_railtracks_env()

# ── Per-request tool-call collector (ContextVar = asyncio-safe) ──────────────
_copilot_ctx: ContextVar[Optional[list]] = ContextVar("copilot_calls", default=None)


def _record(tool_name: str, **kwargs):
    calls = _copilot_ctx.get()
    if calls is not None:
        calls.append({"tool_name": tool_name, "arguments": {k: v for k, v in kwargs.items() if v is not None}})


# ── Railtracks tool nodes (one per copilot tool) ────────────────────────────
try:
    import railtracks as rt
    from railtracks.llm import GeminiLLM, SystemMessage

    @rt.function_node
    async def add_clip(prompt: str, duration_ms: int = 3000, type: str = "image",
                       text: Optional[str] = None, order: Optional[int] = None,
                       transition_type: str = "dissolve") -> str:
        """Add a new scene/clip to the trailer timeline."""
        _record("add_clip", prompt=prompt, duration_ms=duration_ms, type=type,
                text=text, order=order, transition_type=transition_type)
        return f"Added {type} clip at position {order or 'end'}"

    @rt.function_node
    async def remove_clip(clip_id: str) -> str:
        """Remove a clip from the timeline by its UUID."""
        _record("remove_clip", clip_id=clip_id)
        return f"Removed clip {clip_id}"

    @rt.function_node
    async def update_clip(clip_id: str, prompt: Optional[str] = None,
                          duration_ms: Optional[int] = None, text: Optional[str] = None,
                          transition_type: Optional[str] = None) -> str:
        """Update properties of an existing clip."""
        _record("update_clip", clip_id=clip_id, prompt=prompt, duration_ms=duration_ms,
                text=text, transition_type=transition_type)
        return f"Updated clip {clip_id}"

    @rt.function_node
    async def reorder_clips(clip_ids: list) -> str:
        """Reorder clips — provide the full ordered list of clip UUIDs."""
        _record("reorder_clips", clip_ids=clip_ids)
        return f"Reordered {len(clip_ids)} clips"

    @rt.function_node
    async def set_transition(clip_id: str, transition_type: str) -> str:
        """Set the transition after a clip using any supported transition preset."""
        _record("set_transition", clip_id=clip_id, transition_type=transition_type)
        return f"Set {transition_type} transition on {clip_id}"

    @rt.function_node
    async def regenerate_clip(clip_id: str, new_prompt: Optional[str] = None) -> str:
        """Mark a clip for visual regeneration, optionally with a new prompt."""
        _record("regenerate_clip", clip_id=clip_id, new_prompt=new_prompt)
        return f"Queued regeneration for {clip_id}"

    @rt.function_node
    async def set_music(name: str, url: Optional[str] = None,
                        duration_ms: Optional[int] = None, volume: Optional[float] = None) -> str:
        """Set the background music track for the trailer."""
        _record("set_music", name=name, url=url, duration_ms=duration_ms, volume=volume)
        return f"Set music: {name}"

    @rt.function_node
    async def update_settings(resolution: Optional[str] = None,
                              aspect_ratio: Optional[str] = None,
                              fps: Optional[int] = None) -> str:
        """Update render settings (resolution, aspect ratio, FPS)."""
        _record("update_settings", resolution=resolution, aspect_ratio=aspect_ratio, fps=fps)
        return "Updated render settings"

    @rt.function_node
    async def update_scene_duration(scene_id: str, duration_sec: float) -> str:
        """Change the duration of a specific scene in seconds."""
        _record("update_scene_duration", scene_id=scene_id, duration_sec=duration_sec)
        return f"Updated duration of {scene_id} to {duration_sec}s"

    @rt.function_node
    async def set_shot_type(clip_id: str, shot_type: str) -> str:
        """Set whether a clip is continuous (same scene) or a cut (new scene)."""
        _record("set_shot_type", clip_id=clip_id, shot_type=shot_type)
        return f"Set shot_type={shot_type} on {clip_id}"

    @rt.function_node
    async def add_amv_effect(type: str, timestamp_ms: int,
                             duration_ms: int = 200, intensity: float = 0.8,
                             scale: Optional[float] = None,
                             center_x: Optional[float] = None,
                             center_y: Optional[float] = None,
                             radius: Optional[float] = None,
                             sigma: Optional[float] = None,
                             shift: Optional[float] = None,
                             brightness: Optional[float] = None,
                             saturation: Optional[float] = None,
                             contrast: Optional[float] = None,
                             hue_shift: Optional[float] = None,
                             glow: Optional[float] = None,
                             frames: Optional[int] = None,
                             decay: Optional[float] = None,
                             thickness: Optional[int] = None,
                             panel_count: Optional[int] = None,
                             bar_size: Optional[float] = None,
                             pixel_size: Optional[int] = None,
                             amount: Optional[float] = None,
                             angle: Optional[float] = None) -> str:
        """Add a beat-synced AMV visual effect at a specific timestamp with fine-grained params.
        type: flash|shake_h|shake_v|zoom_burst|zoom_out|zoom_pulse|whip_pan|
              shake|heavy_shake|echo|time_echo|freeze|stutter|speed_ramp|
              chromatic|rgb_shift_v|glitch|vhs|tv_noise|
              lut_warm|lut_cold|cyberpunk|duotone|split_tone|color_shift|
              neon|sepia|black_white|invert|bleach_bypass|horror|film_grain|
              scanlines|halftone|contrast_punch|manga_ink|posterize|
              blur_out|radial_blur|tilt_shift|pixelate|mirror_h|
              panel_split|cross_cut|letterbox|vignette|impact_lines|rain|
              strobe|flicker|overexpose|glow_bloom|reverse|speed_ramp
        color param (for flash): integer encoding 0xRRGGBB (white=16777215, black=0, red=16711680, blue=255)
        params: scale(zoom factor), center_x/y(pivot 0-100%), radius(shake px), sigma(blur),
                shift(chromatic px), brightness/contrast/saturation, hue_shift(0-360), glow(saturation boost),
                frames(echo/freeze count), decay(echo weight fade), thickness(cross_cut/panel px),
                panel_count(2-8 panels), bar_size(letterbox % height), pixel_size, amount(grain/flicker), angle(vignette)
        """
        params = {k: v for k, v in {
            "scale": scale, "center_x": center_x, "center_y": center_y,
            "radius": radius, "sigma": sigma, "shift": shift,
            "brightness": brightness, "saturation": saturation, "contrast": contrast,
            "hue_shift": hue_shift, "glow": glow, "frames": frames, "decay": decay,
            "thickness": thickness, "count": panel_count, "bar_size": bar_size,
            "size": pixel_size, "amount": amount, "angle": angle,
        }.items() if v is not None}
        _record("add_amv_effect", type=type, timestamp_ms=timestamp_ms,
                duration_ms=duration_ms, intensity=intensity,
                **({"params": params} if params else {}))
        return f"Added {type} effect @ {timestamp_ms}ms" + (f" with params {list(params.keys())}" if params else "")

    @rt.function_node
    async def update_amv_effect(effect_id: str, type: Optional[str] = None,
                                timestamp_ms: Optional[int] = None,
                                duration_ms: Optional[int] = None,
                                intensity: Optional[float] = None,
                                scale: Optional[float] = None,
                                center_x: Optional[float] = None,
                                center_y: Optional[float] = None,
                                radius: Optional[float] = None,
                                sigma: Optional[float] = None,
                                shift: Optional[float] = None,
                                brightness: Optional[float] = None,
                                contrast: Optional[float] = None,
                                hue_shift: Optional[float] = None,
                                glow: Optional[float] = None,
                                frames: Optional[int] = None) -> str:
        """Update an existing AMV effect's timing, duration, intensity, type, or fine-grained params."""
        params = {k: v for k, v in {
            "scale": scale, "center_x": center_x, "center_y": center_y,
            "radius": radius, "sigma": sigma, "shift": shift,
            "brightness": brightness, "contrast": contrast,
            "hue_shift": hue_shift, "glow": glow, "frames": frames,
        }.items() if v is not None}
        _record("update_amv_effect", effect_id=effect_id, type=type,
                timestamp_ms=timestamp_ms, duration_ms=duration_ms, intensity=intensity,
                **({"params": params} if params else {}))
        return f"Updated effect {effect_id}"

    @rt.function_node
    async def remove_amv_effect(effect_id: str) -> str:
        """Remove a specific AMV effect by its UUID."""
        _record("remove_amv_effect", effect_id=effect_id)
        return f"Removed effect {effect_id}"

    @rt.function_node
    async def clear_amv_effects(type: Optional[str] = None,
                                start_ms: Optional[int] = None,
                                end_ms: Optional[int] = None) -> str:
        """Clear AMV effects in bulk, optionally filtered by type or time range."""
        _record("clear_amv_effects", type=type, start_ms=start_ms, end_ms=end_ms)
        return "Cleared matching AMV effects"

    @rt.function_node
    async def set_bpm(bpm: int) -> str:
        """Set the BPM for beat-synced effects and generate the beat map grid."""
        _record("set_bpm", bpm=bpm)
        return f"Set BPM to {bpm} and generated beat map"

    @rt.function_node
    async def add_amv_effect_range(type: str, start_ms: int, end_ms: int,
                                   interval_ms: Optional[int] = None,
                                   count: Optional[int] = None,
                                   duration_ms: int = 200,
                                   intensity: float = 0.8) -> str:
        """Add the same AMV effect repeatedly across a time range."""
        _record("add_amv_effect_range", type=type, start_ms=start_ms, end_ms=end_ms,
                interval_ms=interval_ms, count=count, duration_ms=duration_ms, intensity=intensity)
        return f"Added repeated {type} effects from {start_ms}ms to {end_ms}ms"

    @rt.function_node
    async def add_amv_effects_on_beats(type: str, start_ms: Optional[int] = None,
                                       end_ms: Optional[int] = None,
                                       every_n_beats: int = 1,
                                       duration_ms: int = 200,
                                       intensity: float = 0.8,
                                       bpm: Optional[int] = None,
                                       instrument: Optional[str] = None) -> str:
        """Add an AMV effect on beats within an optional time range.
        instrument: 'hihats'|'kicks'|'snares'|'crashes'|'energy_peaks'|'beats' — use instrument-specific
        timestamps from the beat_map instead of the generic beat grid. When the context lists hihat/kick
        timestamps, pass instrument='hihats' or 'kicks' to target those exact hits."""
        _record("add_amv_effects_on_beats", type=type, start_ms=start_ms, end_ms=end_ms,
                every_n_beats=every_n_beats, duration_ms=duration_ms, intensity=intensity,
                bpm=bpm, instrument=instrument)
        return f"Added {type} on every {every_n_beats} {instrument or 'beat'}(s)"

    @rt.function_node
    async def auto_amv(bpm: Optional[int] = None, style: str = "aggressive") -> str:
        """Auto-fill the effects timeline with beat-synced AMV effects across the whole trailer."""
        _record("auto_amv", bpm=bpm, style=style)
        return f"Applied {style} auto-AMV at {bpm or 'current'} BPM"

    @rt.function_node
    async def trigger_generate_clip(clip_id: str, new_prompt: Optional[str] = None, media_type: Optional[str] = None) -> str:
        """Trigger image or video generation for a specific clip. media_type='image' (default) uses Imagen/Gemini; media_type='video' uses Veo 3."""
        _record("trigger_generate_clip", clip_id=clip_id, new_prompt=new_prompt, media_type=media_type)
        return f"Triggered {media_type or 'image'} generation for clip {clip_id}"

    @rt.function_node
    async def bulk_update_clips(updates: list) -> str:
        """Batch-update multiple clips at once."""
        _record("bulk_update_clips", updates=updates)
        return f"Bulk-updated {len(updates)} clips"

    # ── System prompt ────────────────────────────────────────────────────────
    _SYSTEM = """You are Lotus's AI copilot — a cinematic trailer editor and AMV specialist.
You help users edit their manga/book trailer through natural language. Think like a professional
AMV editor who understands both cinematic storytelling AND fast-paced anime music video editing.

ALWAYS use tools to apply changes — never just describe what to do.
Be concise: 1-2 sentences max explaining what you did.
Call multiple tools per response for complex edits.
If the context says EDITOR MODE is effects, prefer AMV effect tools and avoid scene-editing tools unless the user explicitly asks for clip/story changes.

SCENE PACING: Hook 2-3s cut | Establishing 3-4s dissolve | Action 1.5-2.5s cut | Emotional 4-5s dissolve
AMV: flash on strong beats 100-200ms (color=16777215 for white, 16711680 for red, 0 for black) |
     zoom_burst/zoom_pulse every 4th beat | chromatic/vhs for tension | cyberpunk/horror for atmosphere |
     scanlines/halftone/impact_lines for manga style | rain/glow_bloom for mood | stutter/tv_noise for glitch
AMV BEAT SYNC: When context lists hihat/kick/snare timestamps, use add_amv_effects_on_beats with instrument='hihats'/'kicks'/'snares'/'crashes'.
     Never ask for BPM if the context already includes BEAT MAP — use it directly.
     If no beat_map: call set_bpm with a reasonable default (128 for action, 90 for drama), then add effects.
     When user says "use hihats" → instrument='hihats'. "use kicks" → instrument='kicks'. "on every beat" → instrument='beats'.
AMV EDITING: use update_amv_effect to tweak placed effects, clear_amv_effects to remove groups of effects,
             add_amv_effect_range for repeated effects over a section, add_amv_effects_on_beats for beat-matched sequences
SHOT TYPE: continuous = same scene flowing | cut = new scene
PROMPTS: always include camera angle, lighting, mood, color palette, atmosphere, anime/manga style.
GENERATION: trigger_generate_clip with media_type='image' for still frames (Imagen/Gemini), media_type='video' for animated clips (Veo 3). Default to 'image' unless user asks for video."""

    # ── CopilotAgent definition ──────────────────────────────────────────────
    CopilotAgent = rt.agent_node(
        name="Lotus Copilot",
        tool_nodes={
            add_clip, remove_clip, update_clip, reorder_clips, set_transition,
            regenerate_clip, set_music, update_settings, update_scene_duration,
            set_shot_type, add_amv_effect, update_amv_effect, remove_amv_effect,
            clear_amv_effects, set_bpm, add_amv_effect_range,
            add_amv_effects_on_beats, auto_amv, trigger_generate_clip, bulk_update_clips,
        },
        llm=GeminiLLM("gemini-2.5-flash"),
        system_message=SystemMessage(_SYSTEM),
        max_tool_calls=20,
    )

    _RAILTRACKS_AVAILABLE = True
    logger.info("Railtracks CopilotAgent initialised successfully")

except Exception as _e:
    _RAILTRACKS_AVAILABLE = False
    CopilotAgent = None
    logger.warning(f"Railtracks unavailable, will fall back to direct Gemini: {_e}")


# ── Public interface ─────────────────────────────────────────────────────────
async def run_copilot(context_prompt: str) -> tuple[str, list]:
    """
    Run the Railtracks CopilotAgent for one turn.
    Returns (assistant_text, tool_calls_list).
    Falls back to an empty result if Railtracks is unavailable.
    """
    if not _RAILTRACKS_AVAILABLE or CopilotAgent is None:
        raise RuntimeError("Railtracks not available")

    import railtracks as rt

    tool_calls: list = []
    token = _copilot_ctx.set(tool_calls)
    try:
        with rt.Session() as _session:
            response = await rt.call(CopilotAgent, context_prompt)
        return response.text or "", tool_calls
    except Exception as exc:
        logger.error(f"Railtracks copilot error: {exc}", exc_info=True)
        raise
    finally:
        _copilot_ctx.reset(token)
