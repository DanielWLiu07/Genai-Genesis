"""Build rich generation prompts combining scene context, characters, and AMV/manga style.

Strategy:
- Characters in scene → inject physical description + reference image URLs
- Scene prompt → expand with cinematic camera motion
- Style layer → AMV/manga motion keywords tuned for Kling
- Negative prompt → prevent static/blurry/realistic output
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

_NEGATIVE = (
    "static, still, frozen, no motion, photo-realistic, 3D CGI, "
    "blurry, low quality, watermark, text, logo, ugly, deformed, "
    "extra limbs, bad anatomy, western cartoon, pixar"
)

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


def _build_character_block(characters: list[dict], scene_prompt: str) -> str:
    """Return character description string for characters mentioned in the scene."""
    if not characters:
        return ""

    mentioned = []
    prompt_lower = scene_prompt.lower()
    for char in characters:
        name = char.get("name", "")
        if name and name.lower() in prompt_lower:
            parts = [name]
            if char.get("appearance"):
                parts.append(char["appearance"])
            elif char.get("description"):
                # Extract physical traits only (first sentence)
                desc = char["description"].split(".")[0]
                parts.append(desc)
            if char.get("age"):
                parts.append(f"age {char['age']}")
            mentioned.append(", ".join(parts))

    if not mentioned:
        return ""
    return "Characters: " + "; ".join(mentioned) + ". "


def build_video_prompt(
    scene_prompt: str,
    clip_order: int = 0,
    characters: Optional[list[dict]] = None,
    mood: Optional[str] = None,
    genre: Optional[str] = None,
    is_continuous: bool = False,
) -> str:
    """Build an optimised Kling video generation prompt.

    Continuous shots focus on motion from the existing start frame.
    Cut shots describe the full new scene.
    Keeps final prompt under ~120 words (Kling sweet-spot).
    """
    parts = []

    # 1. Character context
    char_block = _build_character_block(characters or [], scene_prompt)
    if char_block:
        parts.append(char_block)

    # 2. Core scene
    core = scene_prompt.strip()
    parts.append(core)

    # 3. Camera motion — continuous shots get fluid/flowing motion, cuts get dramatic
    if is_continuous:
        parts.append("smooth continuous camera motion flowing from previous shot, same scene evolving, no cut")
    else:
        parts.append(_camera_motion(clip_order))

    # 4. Mood/genre
    if mood:
        parts.append(f"{mood} atmosphere")
    if genre and genre.lower() not in core.lower():
        parts.append(f"{genre} genre aesthetic")

    # 5. AMV style
    parts.append(_AMV_STYLE)

    return ". ".join(p.rstrip(". ") for p in parts if p)


def build_negative_prompt() -> str:
    return _NEGATIVE


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
            appearance = c.get("appearance") or (c.get("description", "").split(".")[0] if c.get("description") else "")
            char_descs.append(f"{name}: {appearance}" if appearance else name)
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
