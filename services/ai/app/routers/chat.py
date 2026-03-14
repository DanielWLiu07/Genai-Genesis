from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from app.services.gemini import get_model
from app.services.tools import get_gemini_tools
import google.generativeai as genai
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["chat"])

# Railtracks copilot — imported lazily so startup doesn't fail if railtracks
# is missing; falls back to direct Gemini call in that case.
try:
    from app.agents.copilot import run_copilot as _rt_run_copilot
    _RAILTRACKS_CHAT = True
except Exception as _rt_e:
    _RAILTRACKS_CHAT = False
    logger.warning(f"Railtracks chat unavailable, using direct Gemini: {_rt_e}")


class ChatRequest(BaseModel):
    project_id: str
    message: str
    timeline: Optional[dict] = None
    analysis: Optional[dict] = None
    history: List[dict] = []


COPILOT_SYSTEM = """You are MangaMate's AI copilot — a cinematic trailer editor and AMV specialist.

You help users edit their manga/book trailer through natural language. You think like a professional AMV editor who understands both cinematic storytelling AND fast-paced anime music video editing.

TOOLS AVAILABLE:
Scene editing: add_clip, remove_clip, update_clip, reorder_clips, bulk_update_clips, set_transition, set_shot_type
Regeneration: regenerate_clip, trigger_generate_clip
Audio: set_music, update_settings, update_scene_duration
AMV Effects: add_amv_effect, update_amv_effect, remove_amv_effect, clear_amv_effects, set_bpm, add_amv_effect_range, add_amv_effects_on_beats, auto_amv

BEHAVIOR:
- ALWAYS use tools to apply changes — never just describe what to do
- Be concise: 1-2 sentences max explaining what you did
- Think in two modes: (1) story/scene editing, (2) AMV effects editing
- When user wants to change existing effects, prefer update_amv_effect or clear_amv_effects instead of stacking duplicates
- When user wants repeated effects over a section, use add_amv_effect_range or add_amv_effects_on_beats
- When user says "make it more intense/flashy/AMV" → use auto_amv or add_amv_effect
- When user says "change scene X" → use update_clip with that clip's ID
- Call multiple tools per response for complex edits
- If vague ("make it better"), analyze the timeline and make specific improvements
- If the context says EDITOR MODE is effects, stay focused on FX/BPM/effect timing unless the user explicitly asks for scene edits

SCENE PACING:
- Hook: 2-3s, striking visual, cut transition
- Establishing: 3-4s, wide shot, dissolve
- Action/conflict: 1.5-2.5s, quick cuts
- Emotional peak: 4-5s, dissolve/fade
- Text overlays: 2-3s
- Total: 30-60s ideal

AMV EFFECTS KNOWLEDGE:
- flash_white: on strong beats, 100-200ms, intensity 0.8-1.0
- zoom_burst: on every 4th beat, 200-300ms
- shake: on impact moments, 150-250ms
- echo: on every 8th beat or chorus, 300-500ms
- chromatic: for tension/horror, 200-400ms
- glitch: for digital/sci-fi feel, 150-300ms
- strobe: for climax, 50-100ms
- BPM 120-140 for action, 80-100 for drama, 150+ for intense fight scenes

SHOT CONTINUITY:
- Use set_shot_type("continuous") when scenes flow together in same location
- Use set_shot_type("cut") for scene changes (default)
- Continuous shots get smoother video generation from Kling

VISUAL PROMPT STYLE:
Write detailed cinematic prompts:
- Camera angle (wide, medium, close-up, aerial, low-angle, Dutch angle)
- Lighting (golden hour, dramatic sidelight, neon, moonlit, chiaroscuro)
- Color palette (warm amber, cool blue, desaturated, high contrast)
- Atmosphere (fog, rain, dust particles, lens flare, bokeh)
- Style (manga illustration, anime sakuga, cel-shading, ink wash)"""


@router.post("/chat")
async def chat(data: ChatRequest):
    analysis = data.analysis or (data.timeline or {}).get("analysis")
    timeline_context = _build_timeline_context(data.timeline, analysis)
    user_message = data.message
    if timeline_context:
        user_message = f"{timeline_context}\n\nUser request: {data.message}"

    # ── Railtracks path ──────────────────────────────────────────────────────
    if _RAILTRACKS_CHAT:
        try:
            content, tool_calls = await _rt_run_copilot(user_message)
            if not content and tool_calls:
                actions = [tc["tool_name"] for tc in tool_calls]
                content = f"Done! Applied: {', '.join(actions)}"
            return {"role": "assistant", "content": content, "tool_calls": tool_calls}
        except Exception as rt_err:
            logger.warning(f"Railtracks copilot failed, falling back to Gemini: {rt_err}")

    # ── Direct Gemini fallback ───────────────────────────────────────────────
    try:
        tools = get_gemini_tools()
        model = get_model(system_instruction=COPILOT_SYSTEM, tools=tools)
    except RuntimeError as e:
        return {"role": "assistant", "content": str(e), "tool_calls": []}

    gemini_history = []
    for msg in data.history[-10:]:
        role = msg.get("role", "user")
        if role == "assistant":
            role = "model"
        elif role != "user":
            continue
        content = msg.get("content", "")
        if content:
            gemini_history.append({"role": role, "parts": [content]})

    chat_session = model.start_chat(history=gemini_history)

    try:
        response = chat_session.send_message(user_message)

        tool_calls = []
        text_parts = []
        for part in response.parts:
            if part.function_call:
                fc = part.function_call
                args = {key: _convert_proto_value(value) for key, value in fc.args.items()}
                tool_calls.append({"tool_name": fc.name, "arguments": args})
            elif part.text:
                text_parts.append(part.text)

        content = " ".join(text_parts) if text_parts else ""

        if tool_calls and not content:
            func_responses = [
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=tc["tool_name"],
                        response={"result": "success", "applied": True},
                    )
                )
                for tc in tool_calls
            ]
            try:
                content = chat_session.send_message(func_responses).text
            except Exception:
                content = f"Done! Applied: {', '.join(tc['tool_name'] for tc in tool_calls)}"

        return {"role": "assistant", "content": content, "tool_calls": tool_calls}

    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        return {"role": "assistant", "content": f"Something went wrong: {str(e)}", "tool_calls": []}


def _build_timeline_context(timeline: dict | None, analysis: dict | None = None) -> str:
    """Build a concise timeline summary including effects and story context."""
    if not timeline:
        return "The timeline is currently empty."

    editor_mode = timeline.get("editor_mode") or "general"
    clips = timeline.get("clips", [])
    effects = timeline.get("effects", [])
    beat_map = timeline.get("beat_map") or timeline.get("beatMap")
    tl_analysis = analysis or timeline.get("analysis")

    lines = []

    if editor_mode == "effects":
        lines.append("EDITOR MODE: effects-only timeline editor. Prefer AMV effect edits over clip/story changes unless the user explicitly asks for story edits.")
        lines.append("")

    # Story context
    if tl_analysis:
        genre = tl_analysis.get("genre", "")
        mood = tl_analysis.get("mood", "")
        themes = tl_analysis.get("themes", [])
        chars = tl_analysis.get("characters", [])
        if genre or mood:
            lines.append(f"STORY: genre={genre}, mood={mood}, themes={', '.join(themes[:3]) if themes else 'none'}")
        if chars:
            char_names = [c.get("name", "") for c in chars[:4] if c.get("name")]
            lines.append(f"CHARACTERS: {', '.join(char_names)}")
        lines.append("")

    if not clips:
        lines.append("Timeline is empty.")
        return "\n".join(lines)

    total_ms = sum(c.get("duration_ms", 0) for c in clips)
    lines.append(f"TIMELINE ({len(clips)} clips, {total_ms/1000:.1f}s total):")

    acc_ms = 0
    for clip in sorted(clips, key=lambda c: c.get("order", 0)):
        dur = clip.get("duration_ms", 3000) / 1000
        ctype = clip.get("type", "image")
        status = clip.get("gen_status", "pending")
        shot = clip.get("shot_type", "cut")
        transition = clip.get("transition_type", "cut")
        start_ms = acc_ms
        end_ms = acc_ms + clip.get("duration_ms", 3000)
        text = f' "{clip["text"]}"' if clip.get("text") else ""
        prompt = clip.get("prompt", "")
        prompt_preview = (prompt[:70] + "…") if len(prompt) > 70 else prompt
        has_thumb = "✓" if clip.get("thumbnail_url") else "○"
        lines.append(
            f"  [{clip.get('order','?')}] id={clip['id']} | {ctype} {has_thumb} | {dur}s | {status} | {shot} | →{transition}{text}"
        )
        if prompt_preview:
            lines.append(f"      {prompt_preview}")
        lines.append(f"      range={start_ms}-{end_ms}ms")
        acc_ms = end_ms

    # Effects summary
    if effects:
        lines.append(f"\nAMV EFFECTS ({len(effects)} total):")
        from collections import Counter
        type_counts = Counter(e.get("type") for e in effects)
        for etype, cnt in sorted(type_counts.items(), key=lambda x: -x[1]):
            lines.append(f"  {etype}: {cnt}x")
        # Show first few effects with timestamps
        for e in sorted(effects, key=lambda x: x.get("timestamp_ms", 0))[:5]:
            lines.append(f"  id={e['id']} | {e['type']} @ {e['timestamp_ms']}ms | dur={e.get('duration_ms')}ms | intensity={e.get('intensity', 0):.1f}")
        if len(effects) > 5:
            lines.append(f"  ... and {len(effects)-5} more")

    if beat_map:
        lines.append(f"\nBEAT MAP: {beat_map.get('bpm')} BPM, {len(beat_map.get('beats', []))} beats")

    return "\n".join(lines)


def _convert_proto_value(value):
    """Convert protobuf values to Python native types."""
    if hasattr(value, "items"):
        return {k: _convert_proto_value(v) for k, v in value.items()}
    if hasattr(value, "__iter__") and not isinstance(value, (str, bytes)):
        return [_convert_proto_value(v) for v in value]
    return value
