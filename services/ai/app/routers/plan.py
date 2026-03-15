from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.services.trailer_planner import plan_trailer
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["plan"])

# Railtracks multi-agent pipeline
try:
    from app.agents.pipeline import run_pipeline as _rt_run_pipeline
    _RAILTRACKS_PIPELINE = True
except Exception as _rt_e:
    _RAILTRACKS_PIPELINE = False
    logger.warning(f"Railtracks pipeline unavailable: {_rt_e}")


class PlanRequest(BaseModel):
    project_id: str
    analysis: Optional[dict] = None
    settings: Optional[dict] = None
    style: Optional[str] = None  # horror, romance, thriller, fantasy, manga, etc.
    pacing: str = "balanced"  # fast, balanced, slow
    music_track: Optional[dict] = None  # {name, url, bpm, mood, genre}


class PipelineRequest(BaseModel):
    """Full Railtracks multi-agent pipeline: analyze → plan → quality review."""
    project_id: str
    book_text: str
    style: Optional[str] = "cinematic"
    pacing: str = "balanced"
    characters: Optional[List[dict]] = None
    uploaded_images: Optional[List[str]] = None


@router.post("/plan-trailer")
async def plan(data: PlanRequest):
    if not data.analysis:
        raise HTTPException(
            status_code=400,
            detail="No analysis provided. Run /ai/analyze first.",
        )

    logger.info(f"Planning trailer for project {data.project_id}, style={data.style}, pacing={data.pacing}")
    result = await plan_trailer(data.analysis, style=data.style, pacing=data.pacing, music_track=data.music_track)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    clip_count = len(result.get("clips", []))
    total_s = result.get("total_duration_ms", 0) / 1000

    # Auto-generate AMV effects from the plan + analysis
    # Pass music beat data (including instrument hits) if a track was uploaded
    music_beat_map = None
    if data.music_track:
        audio = data.music_track.get("audio_analysis") or data.music_track
        music_beat_map = {
            "bpm": audio.get("bpm"),
            "beats": [t * 1000 for t in (audio.get("beat_timestamps") or [])],
            "kick_times": audio.get("kick_times") or [],
            "snare_times": audio.get("snare_times") or [],
            "hihat_times": audio.get("hihat_times") or [],
            "crash_times": audio.get("crash_times") or [],
            "horn_times": audio.get("horn_times") or [],
            "melodic_times": audio.get("melodic_times") or [],
        }
    try:
        from app.agents.pipeline import _rt_amv_suggest_fallback
        amv_effects, beat_map = _rt_amv_suggest_fallback(data.analysis or {}, result, music_beat_map=music_beat_map)
        result["effects"] = amv_effects
        result["beat_map"] = beat_map
        logger.info(f"Trailer plan complete: {clip_count} clips, {total_s:.1f}s, {len(amv_effects)} AMV effects")
    except Exception as amv_err:
        logger.warning(f"AMV suggest fallback failed: {amv_err}")
        logger.info(f"Trailer plan complete: {clip_count} clips, {total_s:.1f}s total")

    return result


@router.post("/pipeline")
async def pipeline(data: PipelineRequest):
    """
    Railtracks multi-agent pipeline: one call returns story analysis,
    trailer clip plan, AND quality review.

    Internally orchestrated by TrailerPipelineAgent (rt.agent_node) which
    autonomously calls analyze_node → plan_node → quality_node in sequence.
    Falls back to sequential direct calls if Railtracks is unavailable.
    """
    if not data.book_text or len(data.book_text.strip()) < 10:
        raise HTTPException(status_code=400, detail="book_text is required")

    logger.info(
        f"[pipeline] project={data.project_id} style={data.style} "
        f"pacing={data.pacing} railtracks={_RAILTRACKS_PIPELINE}"
    )

    # ── Railtracks path ──────────────────────────────────────────────────────
    if _RAILTRACKS_PIPELINE:
        try:
            result = await _rt_run_pipeline(
                book_text=data.book_text,
                style=data.style or "cinematic",
                pacing=data.pacing,
                characters=data.characters,
                image_urls=data.uploaded_images,
            )
            if result.get("analysis") and result.get("plan"):
                logger.info(
                    f"[pipeline] Railtracks complete: "
                    f"{len(result['plan'].get('clips', []))} clips, "
                    f"score={result.get('quality', {}).get('score', 'N/A')}, "
                    f"amv_effects={len(result.get('amv_effects', []))}"
                )
                return {**result, "powered_by": "railtracks"}
        except Exception as rt_err:
            logger.warning(f"[pipeline] Railtracks failed, falling back: {rt_err}")

    # ── Fallback: sequential direct calls ───────────────────────────────────
    from app.services.story_analyzer import analyze_story
    from app.services.suggestions import get_suggestions

    characters = data.characters
    analysis = await analyze_story(
        data.book_text,
        characters=characters,
        uploaded_image_urls=data.uploaded_images,
    )
    if "error" in analysis:
        raise HTTPException(status_code=500, detail=analysis["error"])

    plan_result = await plan_trailer(analysis, style=data.style, pacing=data.pacing)
    if "error" in plan_result:
        raise HTTPException(status_code=500, detail=plan_result["error"])

    quality = await get_suggestions({"clips": plan_result.get("clips", [])}, analysis)

    # Fallback AMV effects using the same logic as amv_suggest_node
    try:
        from app.agents.pipeline import _rt_amv_suggest_fallback
        amv_effects, beat_map = _rt_amv_suggest_fallback(analysis, plan_result)
    except Exception:
        amv_effects, beat_map = [], None

    return {
        "analysis": analysis,
        "plan": plan_result,
        "quality": quality,
        "amv_effects": amv_effects,
        "beat_map": beat_map,
        "powered_by": "fallback",
    }
