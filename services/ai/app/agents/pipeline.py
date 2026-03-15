"""
Railtracks multi-agent pipeline for Lotus trailer generation.

Architecture:
  TrailerPipelineAgent (rt.agent_node, LLM orchestrator)
    ├── analyze_node  (rt.function_node) → story_analyzer service
    ├── plan_node     (rt.function_node) → trailer_planner service
    └── quality_node  (rt.function_node) → suggestions service

The orchestrator's LLM decides to call each tool in sequence.
Results are captured via a ContextVar dict so the router can return
the full structured output (analysis + plan + quality) to the client.

Built with Railtracks — https://github.com/RailtownAI/railtracks
"""

import os
import json
import logging
from contextvars import ContextVar
from typing import Optional

logger = logging.getLogger(__name__)


def _init_railtracks_env():
    if not os.environ.get("GOOGLE_API_KEY"):
        try:
            from app.config import get_settings
            key = get_settings().gemini_api_key
            if key:
                os.environ["GOOGLE_API_KEY"] = key
        except Exception:
            pass

_init_railtracks_env()

# Per-request result store
_pipeline_ctx: ContextVar[Optional[dict]] = ContextVar("pipeline_results", default=None)


def _results() -> dict:
    r = _pipeline_ctx.get()
    return r if r is not None else {}


try:
    import railtracks as rt
    from railtracks.llm import GeminiLLM, SystemMessage

    # ── Tool nodes ───────────────────────────────────────────────────────────

    @rt.function_node
    async def analyze_node(book_text: str, characters_json: str = "",
                           image_urls_json: str = "") -> str:
        """
        Analyse the story text to extract genre, mood, characters, themes, and
        8-12 key scenes suitable for a cinematic trailer.
        """
        from app.services.story_analyzer import analyze_story

        characters = json.loads(characters_json) if characters_json else None
        image_urls = json.loads(image_urls_json) if image_urls_json else None

        result = await analyze_story(
            book_text,
            characters=characters,
            uploaded_image_urls=image_urls,
        )

        ctx = _pipeline_ctx.get()
        if ctx is not None:
            ctx["analysis"] = result

        scenes = len(result.get("key_scenes", []))
        chars = len(result.get("characters", []))
        return (
            f"Analysis complete: {scenes} scenes, {chars} characters, "
            f"genre={result.get('genre','?')}, mood={result.get('mood','?')}"
        )

    @rt.function_node
    async def plan_node(style: str = "cinematic", pacing: str = "balanced") -> str:
        """
        Generate the trailer clip timeline from the previously analysed story.
        Must call analyze_node first.
        """
        from app.services.trailer_planner import plan_trailer

        analysis = _results().get("analysis") or {}
        if not analysis:
            return "Error: no analysis available — call analyze_node first."

        result = await plan_trailer(analysis, style=style, pacing=pacing)

        ctx = _pipeline_ctx.get()
        if ctx is not None:
            ctx["plan"] = result

        clips = len(result.get("clips", []))
        total_s = result.get("total_duration_ms", 0) / 1000
        return f"Trailer plan: {clips} clips, {total_s:.1f}s total, style={style}, pacing={pacing}"

    @rt.function_node
    async def quality_node() -> str:
        """
        Review the trailer plan quality and provide improvement suggestions.
        Must call plan_node first.
        """
        from app.services.suggestions import get_suggestions

        r = _results()
        plan = r.get("plan") or {}
        analysis = r.get("analysis") or {}

        if not plan:
            return "Error: no plan available — call plan_node first."

        result = await get_suggestions({"clips": plan.get("clips", [])}, analysis)

        ctx = _pipeline_ctx.get()
        if ctx is not None:
            ctx["quality"] = result

        score = result.get("score", "N/A")
        overview = result.get("overall", "")[:120]
        suggestions = len(result.get("suggestions", []))
        return f"Quality score: {score}/10 — {overview} ({suggestions} suggestions)"

    @rt.function_node
    async def amv_suggest_node(bpm: int = 120) -> str:
        """
        Auto-generate beat-synced AMV effects for the trailer based on genre/mood and clip layout.
        Must call plan_node first. Pick BPM based on genre: action/horror 140-180, fantasy/thriller 110-140, romance/drama 80-110.
        """
        import uuid as _uuid

        r = _results()
        plan = r.get("plan") or {}
        analysis = r.get("analysis") or {}

        if not plan:
            return "Error: no plan available — call plan_node first."

        genre = (analysis.get("genre") or "").lower()
        mood = (analysis.get("mood") or "").lower()
        clips = plan.get("clips", [])

        # Build cumulative timestamps for each clip boundary
        boundaries = []
        t = 0
        for c in clips:
            boundaries.append(t)
            t += c.get("duration_ms", 2000)
        total_ms = t

        # Genre → effect palette
        if any(x in genre + mood for x in ["horror", "dark", "grim", "terror"]):
            beat_fx = ["red_flash", "glitch", "heavy_shake", "chromatic"]
            accent_fx = ["vignette", "film_grain", "invert", "strobe"]
            transition_fx = ["black_white", "blur_out"]
        elif any(x in genre + mood for x in ["action", "thriller", "intense", "epic"]):
            beat_fx = ["flash_white", "zoom_burst", "heavy_shake", "chromatic"]
            accent_fx = ["manga_ink", "cross_cut", "contrast_punch", "strobe"]
            transition_fx = ["speed_ramp", "panel_split"]
        elif any(x in genre + mood for x in ["fantasy", "magic", "wonder", "mystical"]):
            beat_fx = ["zoom_burst", "neon", "rgb_shift_v", "flash_white"]
            accent_fx = ["blur_out", "echo", "overexpose", "letterbox"]
            transition_fx = ["sepia", "freeze"]
        elif any(x in genre + mood for x in ["romance", "love", "warm", "tender"]):
            beat_fx = ["zoom_burst", "blur_out", "overexpose", "flash_white"]
            accent_fx = ["sepia", "letterbox", "film_grain", "vignette"]
            transition_fx = ["black_white", "echo"]
        else:  # cinematic default
            beat_fx = ["flash_white", "zoom_burst", "chromatic", "shake"]
            accent_fx = ["manga_ink", "letterbox", "film_grain", "contrast_punch"]
            transition_fx = ["speed_ramp", "blur_out"]

        beat_ms = max(200, round(60000 / bpm))
        effects = []

        def eff(type_, ts, dur, intensity, **params):
            e = {
                "id": str(_uuid.uuid4()),
                "type": type_,
                "timestamp_ms": max(0, int(ts)),
                "duration_ms": int(dur),
                "intensity": round(intensity, 2),
            }
            if params:
                e["params"] = params
            return e

        # Pull instrument hit times from context if music was analyzed
        music_beat_map = ctx.get("music_beat_map") if ctx else None
        def _ms(key): return [int(t * 1000) for t in (music_beat_map or {}).get(key, [])] if music_beat_map else []
        kick_ms    = _ms("kick_times")
        snare_ms   = _ms("snare_times")
        hihat_ms   = _ms("hihat_times")
        crash_ms   = _ms("crash_times")
        horn_ms    = _ms("horn_times")
        melodic_ms = _ms("melodic_times")

        # 1. Flash on every hard cut boundary
        cut_indices = [i for i in range(1, len(clips)) if clips[i].get("shot_type") == "cut"]
        for i, idx in enumerate(cut_indices[:12]):
            fx = beat_fx[i % len(beat_fx)]
            effects.append(eff(fx, boundaries[idx], 150, 0.85))

        # 2a. Instrument-specific effects if music data available
        if kick_ms:
            # Kick → heavy_shake / flash_white (hardest hits)
            for t in kick_ms:
                if t > total_ms: break
                effects.append(eff("heavy_shake" if t % 2 == 0 else "flash_white", t, 120, 0.9))
        if snare_ms:
            # Snare → chromatic aberration / zoom_burst
            for t in snare_ms:
                if t > total_ms: break
                effects.append(eff("chromatic" if t % 2 == 0 else "zoom_burst", t, 150, 0.8))
        if crash_ms:
            # Crash cymbal → full-frame flash + vignette (long ring-out)
            for t in crash_ms:
                if t > total_ms: break
                effects.append(eff("flash_white", t, 300, 1.0, brightness=3.0))
                effects.append(eff("vignette", t + 50, 400, 0.7))
        if horn_ms:
            # Horn / brass stab → neon glow + contrast punch
            for t in horn_ms[:15]:
                if t > total_ms: break
                effects.append(eff("neon", t, 250, 0.75))
                effects.append(eff("contrast_punch", t + 30, 200, 0.6))
        if melodic_ms:
            # General melodic → subtle neon
            for t in melodic_ms[:20]:
                if t > total_ms: break
                effects.append(eff("neon", t, 200, 0.5))
        if hihat_ms:
            # Hi-hat → fast flicker every 4th hit (subtle texture)
            for t in hihat_ms[::4]:
                if t > total_ms: break
                effects.append(eff("flicker", t, 80, 0.4))

        # 2b. Beat-grid accents across escalation (30-80%) — only if no instrument data
        if not kick_ms and not snare_ms:
            esc_start = int(total_ms * 0.3)
            esc_end = int(total_ms * 0.8)
            bt = esc_start
            step = 0
            while bt < esc_end:
                fx = accent_fx[step % len(accent_fx)]
                effects.append(eff(fx, bt, 200, 0.75))
                bt += beat_ms * 2
                step += 1

        # 3. Climax burst (last 20%) — stacked heavy effects
        climax_start = int(total_ms * 0.8)
        for i in range(4):
            ts = climax_start + i * beat_ms
            effects.append(eff("flash_white", ts, 120, 1.0, brightness=2.5))
            if i % 2 == 0:
                effects.append(eff("zoom_burst", ts + 50, 250, 0.9, scale=1.8))

        # 4. Scene group transition effects
        group_changes = [boundaries[i] for i in range(1, len(clips))
                         if clips[i].get("scene_group") != clips[i-1].get("scene_group")]
        for idx, b in enumerate(group_changes[:5]):
            fx = transition_fx[idx % len(transition_fx)]
            effects.append(eff(fx, b, 400, 0.7))

        effects.sort(key=lambda e: e["timestamp_ms"])

        # Use actual detected beats if available, else BPM grid
        if music_beat_map and music_beat_map.get("beats"):
            beat_list = [t for t in music_beat_map["beats"] if t <= total_ms]
        else:
            beat_list = list(range(0, total_ms, beat_ms))

        beat_map = {
            "bpm": music_beat_map.get("bpm", bpm) if music_beat_map else bpm,
            "offset_ms": 0,
            "beats": beat_list,
        }

        ctx = _pipeline_ctx.get()
        if ctx is not None:
            ctx["amv_effects"] = effects
            ctx["beat_map"] = beat_map

        return f"Placed {len(effects)} AMV effects at BPM={bpm} for {genre or 'cinematic'}/{mood or 'epic'} style"

    # ── Orchestrator agent ───────────────────────────────────────────────────

    _PIPELINE_SYSTEM = """You are the Lotus Trailer Pipeline Orchestrator.
Your job is to create a complete cinematic trailer plan from a book/story in four steps:

1. Call analyze_node with the full book_text (and optional characters_json / image_urls_json).
2. Call plan_node with the desired style and pacing once analysis is done.
3. Call quality_node to review the plan quality.
4. Call amv_suggest_node with an appropriate BPM (80-180) based on genre/mood:
   - action/horror/intense → 140-180 BPM
   - fantasy/thriller/epic → 110-140 BPM
   - romance/drama/tender → 80-110 BPM

Always follow this exact sequence. Do not skip steps. After all four calls,
return a brief JSON summary:
{"analysis_scenes": <int>, "plan_clips": <int>, "quality_score": <int>, "amv_effects": <int>, "status": "complete"}"""

    TrailerPipelineAgent = rt.agent_node(
        name="Trailer Pipeline Orchestrator",
        tool_nodes={analyze_node, plan_node, quality_node, amv_suggest_node},
        llm=GeminiLLM("gemini-2.5-flash"),
        system_message=SystemMessage(_PIPELINE_SYSTEM),
        max_tool_calls=8,
    )

    _RAILTRACKS_AVAILABLE = True
    logger.info("Railtracks TrailerPipelineAgent initialised successfully")

except Exception as _e:
    _RAILTRACKS_AVAILABLE = False
    TrailerPipelineAgent = None
    logger.warning(f"Railtracks pipeline unavailable: {_e}")


# ── Standalone AMV helper (usable without Railtracks) ────────────────────────

def _rt_amv_suggest_fallback(analysis: dict, plan: dict, bpm: int = 120, music_beat_map: dict = None):
    """Generate AMV effects and beat map from analysis+plan dicts (no Railtracks needed)."""
    import uuid as _uuid

    genre = (analysis.get("genre") or "").lower()
    mood = (analysis.get("mood") or "").lower()
    clips = plan.get("clips", [])

    boundaries = []
    t = 0
    for c in clips:
        boundaries.append(t)
        t += c.get("duration_ms", 2000)
    total_ms = t

    # Auto-pick BPM from genre if not specified
    if bpm == 120:
        if any(x in genre + mood for x in ["action", "horror", "intense", "epic"]):
            bpm = 155
        elif any(x in genre + mood for x in ["fantasy", "thriller"]):
            bpm = 128
        elif any(x in genre + mood for x in ["romance", "tender"]):
            bpm = 95

    if any(x in genre + mood for x in ["horror", "dark", "grim", "terror"]):
        beat_fx = ["red_flash", "glitch", "heavy_shake", "chromatic"]
        accent_fx = ["vignette", "film_grain", "invert", "strobe"]
        transition_fx = ["black_white", "blur_out"]
    elif any(x in genre + mood for x in ["action", "thriller", "intense", "epic"]):
        beat_fx = ["flash_white", "zoom_burst", "heavy_shake", "chromatic"]
        accent_fx = ["manga_ink", "cross_cut", "contrast_punch", "strobe"]
        transition_fx = ["speed_ramp", "panel_split"]
    elif any(x in genre + mood for x in ["fantasy", "magic", "wonder", "mystical"]):
        beat_fx = ["zoom_burst", "neon", "rgb_shift_v", "flash_white"]
        accent_fx = ["blur_out", "echo", "overexpose", "letterbox"]
        transition_fx = ["sepia", "freeze"]
    elif any(x in genre + mood for x in ["romance", "love", "warm", "tender"]):
        beat_fx = ["zoom_burst", "blur_out", "overexpose", "flash_white"]
        accent_fx = ["sepia", "letterbox", "film_grain", "vignette"]
        transition_fx = ["black_white", "echo"]
    else:
        beat_fx = ["flash_white", "zoom_burst", "chromatic", "shake"]
        accent_fx = ["manga_ink", "letterbox", "film_grain", "contrast_punch"]
        transition_fx = ["speed_ramp", "blur_out"]

    beat_ms = max(200, round(60000 / bpm))
    effects = []

    def eff(type_, ts, dur, intensity, **params):
        e = {
            "id": str(_uuid.uuid4()),
            "type": type_,
            "timestamp_ms": max(0, int(ts)),
            "duration_ms": int(dur),
            "intensity": round(intensity, 2),
        }
        if params:
            e["params"] = params
        return e

    # Extract instrument hit times from music analysis if provided
    def _ms(key): return [int(t * 1000) for t in (music_beat_map or {}).get(key, [])]
    kick_ms    = _ms("kick_times")
    snare_ms   = _ms("snare_times")
    hihat_ms   = _ms("hihat_times")
    crash_ms   = _ms("crash_times")
    horn_ms    = _ms("horn_times")
    melodic_ms = _ms("melodic_times")

    cut_indices = [i for i in range(1, len(clips)) if clips[i].get("shot_type") == "cut"]
    for i, idx in enumerate(cut_indices[:12]):
        fx = beat_fx[i % len(beat_fx)]
        effects.append(eff(fx, boundaries[idx], 150, 0.85))

    # Instrument-specific effects if music data available
    if kick_ms:
        for t in kick_ms:
            if t > total_ms: break
            effects.append(eff("heavy_shake" if t % 2 == 0 else "flash_white", t, 120, 0.9))
    if snare_ms:
        for t in snare_ms:
            if t > total_ms: break
            effects.append(eff("chromatic" if t % 2 == 0 else "zoom_burst", t, 150, 0.8))
    if crash_ms:
        for t in crash_ms:
            if t > total_ms: break
            effects.append(eff("flash_white", t, 300, 1.0, brightness=3.0))
            effects.append(eff("vignette", t + 50, 400, 0.7))
    if horn_ms:
        for t in horn_ms[:15]:
            if t > total_ms: break
            effects.append(eff("neon", t, 250, 0.75))
            effects.append(eff("contrast_punch", t + 30, 200, 0.6))
    if melodic_ms:
        for t in melodic_ms[:20]:
            if t > total_ms: break
            effects.append(eff("neon", t, 200, 0.5))
    if hihat_ms:
        for t in hihat_ms[::4]:
            if t > total_ms: break
            effects.append(eff("flicker", t, 80, 0.4))

    # Beat-grid accents only when no instrument data
    if not kick_ms and not snare_ms:
        esc_start = int(total_ms * 0.3)
        esc_end = int(total_ms * 0.8)
        bt = esc_start
        step = 0
        while bt < esc_end:
            fx = accent_fx[step % len(accent_fx)]
            effects.append(eff(fx, bt, 200, 0.75))
            bt += beat_ms * 2
            step += 1

    climax_start = int(total_ms * 0.8)
    for i in range(4):
        ts = climax_start + i * beat_ms
        effects.append(eff("flash_white", ts, 120, 1.0, brightness=2.5))
        if i % 2 == 0:
            effects.append(eff("zoom_burst", ts + 50, 250, 0.9, scale=1.8))

    group_changes = [boundaries[i] for i in range(1, len(clips))
                     if clips[i].get("scene_group") != clips[i-1].get("scene_group")]
    for idx, b in enumerate(group_changes[:5]):
        fx = transition_fx[idx % len(transition_fx)]
        effects.append(eff(fx, b, 400, 0.7))

    effects.sort(key=lambda e: e["timestamp_ms"])

    # Use actual detected beats if available, else BPM grid
    if music_beat_map and music_beat_map.get("beats"):
        beat_list = [t for t in music_beat_map["beats"] if t <= total_ms]
    else:
        beat_list = list(range(0, total_ms, beat_ms))

    beat_map = {
        "bpm": music_beat_map.get("bpm", bpm) if music_beat_map else bpm,
        "offset_ms": 0,
        "beats": beat_list,
    }

    return effects, beat_map


# ── Public interface ─────────────────────────────────────────────────────────

async def run_pipeline(
    book_text: str,
    style: str = "cinematic",
    pacing: str = "balanced",
    characters: Optional[list] = None,
    image_urls: Optional[list] = None,
) -> dict:
    """
    Execute the full multi-agent trailer generation pipeline.
    Returns {"analysis": {...}, "plan": {...}, "quality": {...}, "agent_summary": "..."}
    """
    if not _RAILTRACKS_AVAILABLE or TrailerPipelineAgent is None:
        raise RuntimeError("Railtracks pipeline not available")

    import railtracks as rt

    results: dict = {}
    token = _pipeline_ctx.set(results)
    try:
        characters_json = json.dumps(characters) if characters else ""
        image_urls_json = json.dumps(image_urls) if image_urls else ""

        prompt = (
            f"Create a {style} trailer with {pacing} pacing.\n\n"
            f"BOOK TEXT (first 12000 chars):\n{book_text[:12000]}\n\n"
            f"characters_json: {characters_json}\n"
            f"image_urls_json: {image_urls_json}"
        )

        with rt.Session() as _session:
            response = await rt.call(TrailerPipelineAgent, prompt)

        return {
            "analysis": results.get("analysis"),
            "plan": results.get("plan"),
            "quality": results.get("quality"),
            "amv_effects": results.get("amv_effects", []),
            "beat_map": results.get("beat_map"),
            "agent_summary": response.text or "",
        }
    except Exception as exc:
        logger.error(f"Railtracks pipeline error: {exc}", exc_info=True)
        raise
    finally:
        _pipeline_ctx.reset(token)
