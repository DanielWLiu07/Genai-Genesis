"""
Railtracks-powered AI Copilot agent for MangaMate.

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
        """Set the transition after a clip (fade/dissolve/wipe/cut)."""
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
                             duration_ms: int = 200, intensity: float = 0.8) -> str:
        """Add a beat-synced AMV visual effect at a specific timestamp."""
        _record("add_amv_effect", type=type, timestamp_ms=timestamp_ms,
                duration_ms=duration_ms, intensity=intensity)
        return f"Added {type} effect @ {timestamp_ms}ms"

    @rt.function_node
    async def remove_amv_effect(effect_id: str) -> str:
        """Remove a specific AMV effect by its UUID."""
        _record("remove_amv_effect", effect_id=effect_id)
        return f"Removed effect {effect_id}"

    @rt.function_node
    async def set_bpm(bpm: int) -> str:
        """Set the BPM for beat-synced effects and generate the beat map grid."""
        _record("set_bpm", bpm=bpm)
        return f"Set BPM to {bpm} and generated beat map"

    @rt.function_node
    async def auto_amv(bpm: Optional[int] = None, style: str = "aggressive") -> str:
        """Auto-fill the effects timeline with beat-synced AMV effects across the whole trailer."""
        _record("auto_amv", bpm=bpm, style=style)
        return f"Applied {style} auto-AMV at {bpm or 'current'} BPM"

    @rt.function_node
    async def trigger_generate_clip(clip_id: str, new_prompt: Optional[str] = None) -> str:
        """Trigger image generation for a specific clip via the AI pipeline."""
        _record("trigger_generate_clip", clip_id=clip_id, new_prompt=new_prompt)
        return f"Triggered generation for clip {clip_id}"

    @rt.function_node
    async def bulk_update_clips(updates: list) -> str:
        """Batch-update multiple clips at once."""
        _record("bulk_update_clips", updates=updates)
        return f"Bulk-updated {len(updates)} clips"

    # ── System prompt ────────────────────────────────────────────────────────
    _SYSTEM = """You are MangaMate's AI copilot — a cinematic trailer editor and AMV specialist.
You help users edit their manga/book trailer through natural language. Think like a professional
AMV editor who understands both cinematic storytelling AND fast-paced anime music video editing.

ALWAYS use tools to apply changes — never just describe what to do.
Be concise: 1-2 sentences max explaining what you did.
Call multiple tools per response for complex edits.

SCENE PACING: Hook 2-3s cut | Establishing 3-4s dissolve | Action 1.5-2.5s cut | Emotional 4-5s dissolve
AMV: flash_white/black on strong beats 100-200ms intensity 0.8-1.0 | zoom_burst every 4th beat 200-300ms
     chromatic for tension 200-400ms | glitch digital/sci-fi 150-300ms | strobe climax 50-100ms
SHOT TYPE: continuous = same scene flowing | cut = new scene
PROMPTS: always include camera angle, lighting, mood, color palette, atmosphere, anime/manga style."""

    # ── CopilotAgent definition ──────────────────────────────────────────────
    CopilotAgent = rt.agent_node(
        name="MangaMate Copilot",
        tool_nodes={
            add_clip, remove_clip, update_clip, reorder_clips, set_transition,
            regenerate_clip, set_music, update_settings, update_scene_duration,
            set_shot_type, add_amv_effect, remove_amv_effect, set_bpm,
            auto_amv, trigger_generate_clip, bulk_update_clips,
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
