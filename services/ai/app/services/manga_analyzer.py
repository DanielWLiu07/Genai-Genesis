"""
Manga panel extractor and action scorer.

Panel extraction algorithm inspired by adenzu/Manga-Panel-Extractor:
  1. Grayscale + binary threshold to isolate white panel areas
  2. Morphological close to seal small gaps in panel borders
  3. Find external contours → bounding rectangles
  4. Filter by minimum area (≥4% of page) and aspect ratio
  5. Sort by reading order (top-to-bottom, left-to-right)

Action scoring uses Gemini vision to score each panel 1-10 for action/fight
intensity. Falls back to an edge-density heuristic if the model call fails.
"""

import asyncio
import base64
import logging
import uuid
from functools import partial
from typing import List, Tuple

import cv2
import numpy as np

from app.services.gemini import get_json_model, parse_json_response, _extract_text

logger = logging.getLogger(__name__)

# ── Gemini system prompts ────────────────────────────────────────────────────

PANEL_SCORING_SYSTEM = """You are a manga expert analyzing individual manga panels.
Return ONLY a JSON object with these exact fields:
{
  "action_score": 7,
  "panel_type": "fight",
  "description": "Two characters clash swords with intense speed lines",
  "has_speed_lines": true,
  "has_impact_effects": true,
  "characters_visible": 2,
  "mood": "intense"
}

action_score: integer 1-10
  1-3 = static dialogue, exposition, background scenery
  4-5 = movement, mild tension, reaction shots
  6-7 = action, running, combat build-up
  8-9 = intense fight, impact, explosion
  10 = peak climax moment, final blow

panel_type: one of fight, action, movement, dialogue, establishing, reaction, emotional
mood: one of intense, calm, dramatic, comedic, mysterious, emotional, explosive"""

MANGA_ANALYSIS_SYSTEM = """You are a narrative analysis AI specializing in manga and comics.
Given a list of panel descriptions from a manga, derive the story's key elements.

Return ONLY a JSON object with this exact structure:
{
  "summary": "2-3 sentence compelling summary",
  "themes": ["theme1", "theme2"],
  "genre": "action",
  "sub_genres": ["shonen", "martial arts"],
  "mood": "intense and energetic",
  "target_audience": "teens and young adults",
  "style": "manga",
  "characters": [
    {
      "name": "inferred name or 'Unknown Protagonist'",
      "role": "protagonist",
      "description": "description from panels",
      "visual_description": "appearance as seen in panels"
    }
  ],
  "key_scenes": [
    {
      "title": "scene title",
      "description": "what happens",
      "quote": null,
      "mood": "intense",
      "visual_description": "panel visual description",
      "scene_type": "action",
      "importance": 8,
      "has_uploaded_image": true,
      "uploaded_image_url": null
    }
  ]
}"""


# ── Panel extraction (OpenCV) ────────────────────────────────────────────────

def _resize_for_scoring(panel: np.ndarray, max_dim: int = 768) -> np.ndarray:
    """Resize panel to fit within max_dim × max_dim for faster API calls."""
    h, w = panel.shape[:2]
    if max(h, w) <= max_dim:
        return panel
    scale = max_dim / max(h, w)
    return cv2.resize(panel, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _encode_panel(panel: np.ndarray, quality: int = 82) -> bytes:
    """Encode a BGR panel to JPEG bytes."""
    _, buf = cv2.imencode(".jpg", panel, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes()


def _sort_by_reading_order(rects: List[Tuple[int, int, int, int]], row_tol_frac: float = 0.5):
    """Sort bounding rects (x, y, w, h) in left-to-right, top-to-bottom order.

    Panels whose y-centres are within row_tol_frac * median_height of each other
    are considered to be on the same row.
    """
    if not rects:
        return rects
    heights = [h for _, _, _, h in rects]
    med_h = float(np.median(heights))
    tol = med_h * row_tol_frac

    # Group into rows
    rows: List[List[Tuple[int, int, int, int]]] = []
    sorted_by_y = sorted(rects, key=lambda r: r[1])
    for rect in sorted_by_y:
        cy = rect[1] + rect[3] / 2
        placed = False
        for row in rows:
            row_cy = sum(r[1] + r[3] / 2 for r in row) / len(row)
            if abs(cy - row_cy) <= tol:
                row.append(rect)
                placed = True
                break
        if not placed:
            rows.append([rect])

    result = []
    for row in rows:
        result.extend(sorted(row, key=lambda r: r[0]))  # left-to-right
    return result


def extract_panels_from_page(image_bytes: bytes) -> List[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
    """Extract manga panels from a single page image.

    Returns list of (panel_bgr_array, (x, y, w, h)) sorted in reading order.
    Falls back to returning the whole page if no panels are detected.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        logger.warning("Could not decode image bytes")
        return []

    page_h, page_w = img.shape[:2]
    page_area = page_h * page_w
    min_area = page_area * 0.04  # panel must be ≥ 4% of the page

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Binary threshold — manga borders are black, panel interiors are white
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)

    # Morphological close to seal small gaps/artefacts in panel borders
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    rects: List[Tuple[int, int, int, int]] = []
    for cnt in contours:
        if cv2.contourArea(cnt) < min_area:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        # Skip degenerate shapes (very thin strips)
        aspect = w / h if h > 0 else 0
        if aspect < 0.1 or aspect > 15:
            continue
        # Skip near-full-page rect (probably the page background)
        if w * h > page_area * 0.90:
            continue
        rects.append((x, y, w, h))

    if not rects:
        # Fallback: treat the whole page as a single panel
        logger.debug("No panels detected — returning whole page")
        return [(img, (0, 0, page_w, page_h))]

    sorted_rects = _sort_by_reading_order(rects)
    panels = []
    for (x, y, w, h) in sorted_rects:
        crop = img[y: y + h, x: x + w]
        panels.append((crop, (x, y, w, h)))

    return panels


# ── Heuristic fallback scorer ────────────────────────────────────────────────

def _heuristic_action_score(panel_bgr: np.ndarray) -> int:
    """Estimate action intensity from edge density (no API call required)."""
    gray = cv2.cvtColor(panel_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    density = float(np.sum(edges > 0)) / (gray.shape[0] * gray.shape[1])
    # density ~0 → score 1; density ~0.30+ → score 10
    score = int(density * 33)
    return max(1, min(10, score))


# ── Gemini vision scoring ────────────────────────────────────────────────────

async def _score_panel_gemini(panel_bgr: np.ndarray) -> dict:
    """Call Gemini Flash (vision) to score a single panel."""
    resized = _resize_for_scoring(panel_bgr)
    panel_bytes = _encode_panel(resized)
    b64 = base64.b64encode(panel_bytes).decode()

    model = get_json_model(PANEL_SCORING_SYSTEM)
    img_part = {"inline_data": {"mime_type": "image/jpeg", "data": b64}}
    prompt = "Analyze this manga panel and return the JSON score."

    loop = asyncio.get_event_loop()
    try:
        response = await loop.run_in_executor(
            None, partial(model.generate_content, [img_part, prompt])
        )
        text = _extract_text(response)
        return parse_json_response(text)
    except Exception as exc:
        logger.warning(f"Gemini vision scoring failed, using heuristic: {exc}")
        score = _heuristic_action_score(panel_bgr)
        return {
            "action_score": score,
            "panel_type": "action" if score >= 6 else "dialogue",
            "description": f"Manga panel (heuristic score {score})",
            "has_speed_lines": score >= 7,
            "has_impact_effects": score >= 8,
            "characters_visible": 1,
            "mood": "intense" if score >= 7 else "calm",
        }


async def score_panels(panels: List[np.ndarray], concurrency: int = 3) -> List[dict]:
    """Score panels with bounded concurrency to respect rate limits."""
    sem = asyncio.Semaphore(concurrency)

    async def _score(panel: np.ndarray) -> dict:
        async with sem:
            result = await _score_panel_gemini(panel)
            await asyncio.sleep(0.2)  # gentle rate-limit buffer
            return result

    return await asyncio.gather(*[_score(p) for p in panels])


# ── Three-act panel selection ────────────────────────────────────────────────

def _select_three_act(
    panels: List[np.ndarray],
    scores: List[dict],
    max_panels: int,
) -> List[tuple]:
    """Select panels proportionally from the beginning, middle, and end of the
    sequence so the resulting clip list has narrative structure (setup →
    escalation → conclusion) rather than clustering around the highest-action
    moments in one section.

    Each act receives a quota of slots.  Within each act, panels are ranked by
    action_score and the top-quota are chosen.  The result is re-sorted into
    original sequence order so clips play in story order.

    Act weights: beginning 30 %, middle 40 %, end 30 %
    (middle gets a little more because that is typically where the most action
    panels live; the weight is applied after rounding so totals always sum to
    max_panels ± 1).
    """
    n = len(panels)
    if n == 0:
        return []

    indexed = list(enumerate(zip(panels, scores)))  # [(orig_idx, (panel, score)), ...]

    # Boundary cuts for three acts
    b1 = n // 3          # end of beginning act (exclusive)
    b2 = 2 * n // 3      # end of middle act (exclusive)

    acts = {
        "beginning": indexed[:b1],
        "middle":    indexed[b1:b2],
        "end":       indexed[b2:],
    }

    # Slot allocation: 30 / 40 / 30 split, then fill any remainder into middle
    quota_begin = max(1, round(max_panels * 0.30))
    quota_end   = max(1, round(max_panels * 0.30))
    quota_mid   = max(1, max_panels - quota_begin - quota_end)

    quotas = {
        "beginning": quota_begin,
        "middle":    quota_mid,
        "end":       quota_end,
    }

    def _best_from_act(act_panels, quota):
        """Return up to `quota` items sorted by action_score descending,
        but always include at least one panel even if the action score is low."""
        ranked = sorted(act_panels, key=lambda t: t[1][1].get("action_score", 0), reverse=True)
        # Take the top-quota; if the act has fewer panels than the quota, take all
        return ranked[:min(quota, len(ranked))]

    selected = []
    for act_name, act_panels in acts.items():
        chosen = _best_from_act(act_panels, quotas[act_name])
        selected.extend(chosen)

    # Re-sort into original narrative order
    selected.sort(key=lambda t: t[0])

    return [(panel, score) for _, (panel, score) in selected]


# ── Story analysis from panel descriptions ───────────────────────────────────

async def build_analysis_from_panels(scored_panels: List[dict]) -> dict:
    """Ask Gemini to derive story analysis from collected panel descriptions."""
    lines = [
        f"Panel {i + 1} [{p.get('panel_type', 'unknown')}] "
        f"(action_score={p.get('action_score', 0)}): {p.get('description', '')}"
        for i, p in enumerate(scored_panels)
    ]
    panel_text = "\n".join(lines)

    prompt = (
        "Based on the following manga panel descriptions, derive the story analysis.\n\n"
        f"PANEL DESCRIPTIONS:\n{panel_text}\n\n"
        "Return the JSON story analysis."
    )

    model = get_json_model(MANGA_ANALYSIS_SYSTEM)
    loop = asyncio.get_event_loop()
    try:
        response = await loop.run_in_executor(
            None, partial(model.generate_content, prompt)
        )
        text = _extract_text(response)
        result = parse_json_response(text)
    except Exception as exc:
        logger.error(f"Manga analysis failed: {exc}")
        result = {
            "summary": "A manga story with action-packed scenes.",
            "themes": ["action", "adventure"],
            "genre": "action",
            "sub_genres": ["manga"],
            "mood": "intense",
            "target_audience": "general",
            "style": "manga",
            "characters": [],
            "key_scenes": [],
        }

    # Backfill key_scenes from scored panels (so the trailer planner has scene data)
    if not result.get("key_scenes"):
        result["key_scenes"] = [
            {
                "title": f"Panel {i + 1}",
                "description": p.get("description", ""),
                "quote": None,
                "mood": p.get("mood", "intense"),
                "visual_description": p.get("description", ""),
                "scene_type": p.get("panel_type", "action"),
                "importance": p.get("action_score", 5),
                "has_uploaded_image": True,
                "uploaded_image_url": None,
            }
            for i, p in enumerate(scored_panels)
        ]

    return result


# ── Clip construction ────────────────────────────────────────────────────────

def build_clips_from_panels(
    panels: List[np.ndarray],
    scored: List[dict],
) -> List[dict]:
    """Create timeline clip objects from manga panels.

    Each clip has:
    - generated_media_url: base64 data URL of the panel image
    - gen_status: "done"  (no AI generation needed)
    - manga_panel: True   (flag used by the editor to block re-generation)
    """
    clips = []
    for i, (panel_bgr, score_data) in enumerate(zip(panels, scored)):
        resized = _resize_for_scoring(panel_bgr, max_dim=1024)
        panel_bytes = _encode_panel(resized, quality=88)
        b64 = base64.b64encode(panel_bytes).decode()
        data_url = f"data:image/jpeg;base64,{b64}"

        # Duration based on action score: fast cuts for high action
        action = score_data.get("action_score", 5)
        if action >= 8:
            duration_ms = 1500
        elif action >= 6:
            duration_ms = 2000
        else:
            duration_ms = 2500

        clips.append({
            "id": str(uuid.uuid4()),
            "order": i,
            "type": "image",
            "duration_ms": duration_ms,
            "prompt": score_data.get("description", f"Manga panel {i + 1}"),
            "generated_media_url": data_url,
            "thumbnail_url": data_url,
            "gen_status": "done",
            "transition_type": "cut" if action >= 7 else "dissolve",
            "shot_type": "cut",
            "scene_group": i // 4,
            "position": {"x": (i % 3) * 310, "y": (i // 3) * 210},
            "text": None,
            "text_style": None,
            "manga_panel": True,
        })

    return clips


# ── Main pipeline ────────────────────────────────────────────────────────────

async def analyze_manga_pages(
    pages: List[bytes],
    max_panels: int = 12,
) -> dict:
    """Full manga pipeline: extract → score → filter → analyze → build clips.

    Args:
        pages: Raw bytes of each manga page image (PNG/JPG).
        max_panels: Maximum number of panels to keep (highest action scores).

    Returns:
        {
            "panels": [{"description", "action_score", "panel_type", ...}],
            "analysis": {summary, themes, genre, ...},
            "clips": [...],
            "panel_count": int,
            "page_count": int,
        }
    """
    logger.info(f"Processing {len(pages)} manga page(s)")

    # ── Step 1: Extract panels from every page ──
    all_panels_bgr: List[np.ndarray] = []
    page_count = len(pages)

    loop = asyncio.get_event_loop()
    for i, page_bytes in enumerate(pages):
        extracted = await loop.run_in_executor(
            None, extract_panels_from_page, page_bytes
        )
        for panel_bgr, _ in extracted:
            all_panels_bgr.append(panel_bgr)
        logger.debug(f"Page {i + 1}: {len(extracted)} panels extracted")

    if not all_panels_bgr:
        return {
            "panels": [],
            "analysis": {},
            "clips": [],
            "panel_count": 0,
            "page_count": page_count,
            "error": "No panels could be extracted from the uploaded pages.",
        }

    # Cap at 30 panels before scoring to avoid excessive API calls
    candidates = all_panels_bgr[: min(30, len(all_panels_bgr))]

    # ── Step 2: Score each panel with Gemini vision ──
    logger.info(f"Scoring {len(candidates)} panels for action content")
    scored_data = await score_panels(candidates, concurrency=3)

    # ── Step 3: Three-act selection ──
    # Divide the candidate sequence into beginning / middle / end thirds, then
    # pick the best-scoring action panels from each act so the final clip list
    # has a clear start, escalation, and conclusion rather than being a dense
    # cluster of peak-action moments from a single stretch of the manga.
    top_panels = _select_three_act(candidates, scored_data, max_panels)

    logger.info(f"Selected {len(top_panels)} panels (three-act) from {len(candidates)} candidates")

    top_panels_bgr = [p for p, _ in top_panels]
    top_scored = [s for _, s in top_panels]

    # ── Step 4: Build story analysis from ALL scored panels (richer context) ──
    analysis = await build_analysis_from_panels(scored_data)

    # ── Step 5: Build clips from selected panels ──
    clips = build_clips_from_panels(top_panels_bgr, top_scored)

    return {
        "panels": top_scored,
        "analysis": analysis,
        "clips": clips,
        "panel_count": len(top_panels),
        "page_count": page_count,
    }
