"""
Railtracks multi-agent pipeline for MangaMate trailer generation.

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

    # ── Orchestrator agent ───────────────────────────────────────────────────

    _PIPELINE_SYSTEM = """You are the MangaMate Trailer Pipeline Orchestrator.
Your job is to create a complete cinematic trailer plan from a book/story in three steps:

1. Call analyze_node with the full book_text (and optional characters_json / image_urls_json).
2. Call plan_node with the desired style and pacing once analysis is done.
3. Call quality_node to review the plan quality.

Always follow this exact sequence. Do not skip steps. After all three calls,
return a brief JSON summary:
{"analysis_scenes": <int>, "plan_clips": <int>, "quality_score": <int>, "status": "complete"}"""

    TrailerPipelineAgent = rt.agent_node(
        name="Trailer Pipeline Orchestrator",
        tool_nodes={analyze_node, plan_node, quality_node},
        llm_model=GeminiLLM("gemini-2.5-flash"),
        system_message=SystemMessage(_PIPELINE_SYSTEM),
        max_tool_calls=6,
    )

    _RAILTRACKS_AVAILABLE = True
    logger.info("Railtracks TrailerPipelineAgent initialised successfully")

except Exception as _e:
    _RAILTRACKS_AVAILABLE = False
    TrailerPipelineAgent = None
    logger.warning(f"Railtracks pipeline unavailable: {_e}")


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
            "agent_summary": response.text or "",
        }
    except Exception as exc:
        logger.error(f"Railtracks pipeline error: {exc}", exc_info=True)
        raise
    finally:
        _pipeline_ctx.reset(token)
