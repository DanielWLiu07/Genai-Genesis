"""Build rich generation prompts combining scene context, characters, and AMV/manga style.

Strategy:
- Characters in scene → inject visual_description (richest) or appearance or description
- Previous/next scene context → continuity hints
- User feedback → refinement injected directly after core scene
- Mood + genre + themes → atmosphere layer
- Camera motion → cinematic variety keyed by clip position
- AMV style → consistent aesthetic boilerplate
- Word budget: target ~130 words for Kling's sweet spot
"""

from typing import Optional

# ── AMV / Manga motion style layers ─────────────────────────────────────────

# Image-specific action style — captures peak-motion frame so video AI (Kling) can animate it
_IMAGE_ACTION_STYLE = (
    "peak-action freeze frame — body at maximum extension, limbs fully committed at moment of impact or apex of leap, "
    "motion implied by: speed lines radiating from impact point, motion blur streaks on arms and legs, "
    "shockwave distortion rings, airborne debris and dust mid-cloud, cloth/hair fully mid-whip, "
    "manga sakuga smear on fast-moving limbs, thick bold ink outlines, heavy black shadows, "
    "high contrast ink wash — drawn to show WHERE THE BODY CAME FROM and WHERE IT IS GOING"
)

_AMV_STYLE = (
    "manga AMV style, sakuga-quality extreme motion, "
    "MASSIVE full-body action in frame — heavy sword swings, explosive power releases, dramatic leaps, "
    "bodies in full extension at peak of motion, weight and impact visible in every frame, "
    "thick bold ink lines, heavy black shadows, high contrast ink wash, "
    "speed lines bursting from impact point, motion blur streaks across limbs, "
    "manga impact frames with onomatopoeia energy, shockwave distortion rings, "
    "debris and environmental destruction from force, dust clouds and sparks, "
    "Dutch angles and extreme perspectives amplifying scale, "
    "fast-cut AMV pacing — each frame a frozen peak-action moment"
)

# Genre-aware negative prompt components
_NEGATIVE_BASE = (
    "static, still, frozen, no motion, photo-realistic, 3D CGI, "
    "blurry, low quality, watermark, text, logo, ugly, deformed, "
    "extra limbs, bad anatomy, western cartoon, pixar"
)

_NEGATIVE_GENRE_EXTRAS: dict[str, str] = {
    "romance": "violence, gore, horror, dark themes, grim lighting",
    "horror": "bright cheerful colors, pastel tones, comedy",
    "comedy": "dark themes, violence, horror imagery",
    "sci-fi": "fantasy elements, medieval settings, magic",
    "fantasy": "modern technology, sci-fi machinery, futuristic",
    "thriller": "comedy, bright pastel colors, childish",
}

# Camera motion per clip position in the trailer — all biased toward action/impact
_CAMERA_MOTIONS = [
    "extreme low angle looking up at subject mid-swing, heroic scale",
    "whip-pan crash zoom into impact, speed ramp on contact",
    "handheld violent shake on impact, camera recoil from shockwave",
    "Dutch angle snap, environment tilting from force of movement",
    "tight over-shoulder tracking shot, subject lunging into foreground",
    "pull-back explosive reveal, subject bursting through foreground debris",
    "bird's eye tilt-down crash — subject landing with crater impact",
    "extreme close-up eye or hand at peak tension, micro tremor",
    "wide shot with full silhouette against light source, giant scale",
    "barrel roll orbit around subject at peak power charge",
]


def _camera_motion(clip_order: int) -> str:
    return _CAMERA_MOTIONS[clip_order % len(_CAMERA_MOTIONS)]


def _truncate_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + "..."


def _build_character_block(characters: list[dict], scene_prompt: str) -> str:
    """Return character description for characters mentioned in the scene.

    Prefers visual_description (richest), falls back to appearance, then description.
    Caps each character entry at 20 words, max 2 characters to stay within budget.
    """
    if not characters:
        return ""

    mentioned = []
    prompt_lower = scene_prompt.lower()
    for char in characters[:6]:  # consider up to 6 characters
        name = char.get("name", "")
        if not name or name.lower() not in prompt_lower:
            continue
        # Choose richest available description
        visual = (
            char.get("visual_description")
            or char.get("appearance")
            or (char.get("description", "").split(".")[0] if char.get("description") else "")
        )
        if visual:
            visual = _truncate_words(visual, 20)
            mentioned.append(f"{name} ({visual})")
        else:
            mentioned.append(name)

        if len(mentioned) >= 2:  # cap at 2 for word budget
            break

    if not mentioned:
        return ""
    return "Characters: " + "; ".join(mentioned) + ". "


def build_video_prompt(
    scene_prompt: str,
    clip_order: int = 0,
    clip_total: int = 0,
    characters: Optional[list[dict]] = None,
    mood: Optional[str] = None,
    genre: Optional[str] = None,
    themes: Optional[list[str]] = None,
    is_continuous: bool = False,
    prev_scene_prompt: Optional[str] = None,
    next_scene_prompt: Optional[str] = None,
    feedback: Optional[str] = None,
    style_seed: Optional[str] = None,
) -> str:
    """Build an optimised Kling video generation prompt.

    Order:
    1. Character block (visual descriptions of characters in this scene)
    2. Previous scene context (brief, for colour/mood continuity)
    3. Core scene prompt + user feedback refinement
    4. Camera motion
    5. Continuity hint toward next scene (continuous shots only)
    6. Mood / genre / themes atmosphere
    7. AMV style boilerplate

    Keeps final prompt under ~150 words.
    """
    parts: list[str] = []

    # 1. All character descriptions — consistent appearance across every clip
    if characters:
        char_descs = []
        for c in (characters or [])[:4]:
            name = c.get("name", "")
            if not name:
                continue
            visual = (
                c.get("visual_description")
                or c.get("appearance")
                or (c.get("description", "").split(".")[0] if c.get("description") else "")
            )
            if visual:
                char_descs.append(f"{name}: {_truncate_words(visual, 18)}")
            else:
                char_descs.append(name)
        if char_descs:
            parts.append("Characters — " + "; ".join(char_descs))

    # 2. Previous scene context — brief continuity hint (max 12 words)
    if prev_scene_prompt and not is_continuous:
        prev_hint = _truncate_words(prev_scene_prompt.strip(), 12)
        parts.append(f"Following: {prev_hint}")

    # 3. Core scene + feedback
    core = scene_prompt.strip()
    if feedback and feedback.strip():
        core = f"{core}. Refinement: {feedback.strip()}"
    parts.append(core)

    # 4. Camera motion
    if is_continuous:
        parts.append("smooth continuous motion flowing from previous shot, same scene evolving, no hard cut")
    else:
        parts.append(_camera_motion(clip_order))

    # 5. Next scene continuity hint (only for continuous shots — helps Kling frame the exit)
    if next_scene_prompt and is_continuous:
        next_hint = _truncate_words(next_scene_prompt.strip(), 10)
        parts.append(f"transitioning toward: {next_hint}")

    # 6. Mood / genre / themes atmosphere
    atmosphere: list[str] = []
    if mood:
        atmosphere.append(f"{mood} atmosphere")
    if genre and genre.lower() not in core.lower():
        atmosphere.append(f"{genre} aesthetic")
    if themes:
        # Take top 2 themes for brevity
        atmosphere.append(", ".join(themes[:2]))
    if atmosphere:
        parts.append(". ".join(atmosphere))

    # 7. Style seed — visual consistency anchor across all clips
    if style_seed:
        parts.append(style_seed)

    # 8. AMV style boilerplate
    parts.append(_AMV_STYLE)

    return ". ".join(p.rstrip(". ") for p in parts if p)


def build_negative_prompt(genre: Optional[str] = None) -> str:
    base = _NEGATIVE_BASE
    if genre:
        extra = _NEGATIVE_GENRE_EXTRAS.get(genre.lower().strip(), "")
        if extra:
            base = f"{base}, {extra}"
    return base


def build_image_prompt(
    scene_prompt: str,
    characters: Optional[list[dict]] = None,
    mood: Optional[str] = None,
    style_seed: Optional[str] = None,
    clip_order: int = 0,
    clip_total: int = 0,
    prev_scene_prompt: Optional[str] = None,
) -> str:
    """Build a Gemini/Imagen image generation prompt.

    Always includes all character descriptions (not just mentioned ones) for
    visual consistency across the sequence. style_seed anchors the palette and
    art style identically for every clip so Imagen outputs cohesive frames.
    """
    parts = []

    # Style seed FIRST — Gemini weights earlier tokens most heavily.
    # Locking in art style, palette, and character look before any scene content
    # is the key to visual consistency across all clips.
    if style_seed:
        parts.append(style_seed)
    else:
        # Fallback base style when no seed provided
        parts.append(
            "ART STYLE: hand-drawn manga illustration, bold black ink outlines, "
            "dramatic chiaroscuro shading, flat cel-shading, no photorealism, no 3D CGI"
        )

    # Narrative position gives Imagen pacing context
    if clip_total > 0:
        parts.append(f"Scene {clip_order + 1} of {clip_total}")

    # Always describe ALL characters so appearance stays consistent across clips
    if characters:
        char_descs = []
        for c in characters:
            name = c.get("name", "")
            if not name:
                continue
            visual = (
                c.get("visual_description")
                or c.get("appearance")
                or (c.get("description", "").split(".")[0] if c.get("description") else "")
            )
            if visual:
                char_descs.append(f"{name}: {_truncate_words(visual, 20)}")
            else:
                char_descs.append(name)
        if char_descs:
            parts.append("Characters — " + "; ".join(char_descs))

    # Previous scene context — brief continuity hint for visual consistency
    if prev_scene_prompt:
        prev_hint = _truncate_words(prev_scene_prompt.strip(), 15)
        parts.append(f"Continuing from: {prev_hint}")

    # Core scene
    parts.append(scene_prompt.strip())

    # Mood
    if mood:
        parts.append(f"{mood} mood")

    # Action motion layer — ensures generated image conveys movement for video AI
    parts.append(_IMAGE_ACTION_STYLE)

    return ". ".join(p.rstrip(". ") for p in parts if p)
