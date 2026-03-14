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

_AMV_STYLE = (
    "anime AMV style, sakuga-quality fluid motion, "
    "dynamic speed lines radiating from action, "
    "cel-shaded with bold ink outlines, "
    "vibrant saturated colors, dramatic chiaroscuro lighting, "
    "manga impact frames, motion smear on fast movement, "
    "cinematic depth of field, volumetric atmosphere"
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

# Camera motion per clip position in the trailer
_CAMERA_MOTIONS = [
    "slow dramatic push-in, camera easing toward subject",
    "sweeping panoramic arc, camera orbiting slowly",
    "handheld energy, slight camera shake, dynamic",
    "fast zoom-in impact cut, speed ramp",
    "pull-back reveal, subject emerging from foreground",
    "low angle upward tilt, heroic framing",
    "tracking shot following subject, parallax background",
    "extreme close-up with micro shake, intense",
    "bird's eye tilt-down, overhead drama",
    "Dutch angle roll, disorienting tension",
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

    # 1. Character context (max 2 chars × 20 words each)
    char_block = _build_character_block(characters or [], scene_prompt)
    if char_block:
        parts.append(char_block)

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

    # 7. AMV style boilerplate
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
) -> str:
    """Build a Gemini/Imagen image generation prompt.

    Always includes all character descriptions (not just mentioned ones) for
    visual consistency across the sequence. style_seed anchors the palette and
    art style identically for every clip so Imagen outputs cohesive frames.
    """
    parts = []

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
            # Prefer visual_description, then appearance, then first sentence of description
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

    # Core scene
    parts.append(scene_prompt.strip())

    # Mood
    if mood:
        parts.append(f"{mood} mood")

    # Style seed — consistent visual anchor across all clips in the sequence
    if style_seed:
        parts.append(style_seed)

    # Base art style
    parts.append(
        "manga illustration style, bold ink lines, dramatic chiaroscuro shading, "
        "cinematic composition, consistent color palette, high detail, professional quality"
    )
    return ". ".join(p.rstrip(". ") for p in parts if p)
