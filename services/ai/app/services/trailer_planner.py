from app.services.gemini import generate_json
from app.services.style_presets import get_preset, auto_detect_preset
import uuid
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a cinematic trailer planner and film editor AI. Your job is to transform a book analysis into a compelling trailer timeline.

You understand trailer structure deeply:
- HOOK (0-3s): A striking visual or text that grabs attention immediately
- SETUP (3-12s): Introduce the world, protagonist, and stakes
- BUILD (12-25s): Escalating tension, key conflicts, mysteries revealed
- CLIMAX (25-35s): The most intense, dramatic moment
- HOOK OUT (35-45s): Cliffhanger or emotional punch + title card

You MUST return a JSON object with this structure:

{
  "clips": [
    {
      "id": "unique-uuid-string",
      "order": 0,
      "type": "image",
      "duration_ms": 3000,
      "prompt": "Extremely detailed cinematic visual prompt for AI image/video generation. Include: subject, action, camera angle (wide/medium/close-up/aerial), lighting (golden hour/dramatic/neon/moonlit), color palette (warm/cool/desaturated), atmosphere (foggy/rain/dust particles), style (photorealistic/painterly/anime/noir). Example: 'Aerial establishing shot of a dark Gothic castle perched on sea cliffs at twilight, crashing waves below, storm clouds gathering, lightning in the distance, cinematic color grading with deep blues and amber highlights, 4K photorealistic'",
      "text": "Short impactful overlay text or null",
      "text_style": {
        "font_size": 36,
        "color": "#ffffff",
        "position": "bottom",
        "animation": "fade_in"
      },
      "transition_type": "dissolve",
      "gen_status": "pending",
      "position": {"x": 0, "y": 100}
    }
  ],
  "trailer_style": "cinematic|anime|noir|fantasy|horror|romantic",
  "total_duration_ms": 45000,
  "music_mood": "epic|dark|romantic|mysterious|intense|whimsical"
}

RULES:
- Generate 8-12 clips for a 30-60 second trailer
- First clip should be a text_overlay with the book title or a striking tagline
- Last clip should be a text_overlay with the book title and "Coming Soon" or a call to action
- Vary clip durations: text overlays 2-3s, establishing shots 3-4s, action moments 2-3s, emotional moments 3-5s
- Use a mix of transition types: dissolve for mood shifts, cut for action, fade for endings
- Each visual prompt MUST be 2-3 sentences with specific cinematic details
- Think about PACING: fast cuts for action, longer holds for emotion
- For manga/anime style books, use anime-style visual prompts
- text_style.animation can be: fade_in, typewriter, slide_up, or null"""


STYLE_MODIFIERS = {
    "horror": "Use dark, desaturated colors. Heavy shadows. Unsettling angles. Flickering light sources. Fog and mist.",
    "romance": "Warm golden tones. Soft focus. Intimate framing. Lens flares. Dreamy atmosphere.",
    "thriller": "High contrast. Dutch angles. Cool blue-grey palette. Sharp shadows. Urban nightscapes.",
    "fantasy": "Rich saturated colors. Ethereal lighting. Sweeping landscapes. Magical particle effects.",
    "scifi": "Neon accent lighting. Clean geometric compositions. Holographic elements. Deep space vistas.",
    "manga": "Anime art style. Bold linework. Dynamic speed lines for action. Cherry blossoms. Dramatic lighting.",
    "literary": "Painterly aesthetic. Muted earth tones. Classical composition. Natural lighting. Contemplative framing.",
}


async def plan_trailer(analysis: dict, style: str = None, pacing: str = "balanced") -> dict:
    """Generate a trailer timeline from story analysis."""
    genre = analysis.get("genre", "")
    content_style = analysis.get("style", "book")

    # Resolve style preset
    if not style:
        style = auto_detect_preset(genre, content_style)
    preset = get_preset(style)

    style_hint = f"""
STYLE PRESET: {preset['name']}
VISUAL STYLE: All visual prompts must include this style suffix: "{preset['visual_style']}"
PREFERRED TRANSITIONS: {', '.join(preset['transitions'])}
DEFAULT TEXT STYLE: font_size={preset['text_style']['font_size']}, color="{preset['text_style']['color']}", position="{preset['text_style']['position']}", animation="{preset['text_style']['animation']}"
MUSIC MOOD: {preset.get('music_mood', 'epic')}"""

    pacing_hint = ""
    if pacing == "fast" or preset.get("pacing") == "fast":
        pacing_hint = "\nPACING: Fast-paced trailer. Shorter clips (2-3s each). Quick cuts. High energy."
    elif pacing == "slow" or preset.get("pacing") == "slow":
        pacing_hint = "\nPACING: Slow, atmospheric trailer. Longer holds (4-6s). Dissolve transitions. Contemplative."

    prompt = f"""Create a cinematic book trailer timeline for this story:

BOOK ANALYSIS:
{_format_analysis(analysis)}
{style_hint}
{pacing_hint}

Generate a compelling trailer timeline that captures the essence of this story.
The trailer should make someone want to read this book immediately."""

    result = await generate_json(prompt, SYSTEM_PROMPT)

    if "error" not in result:
        # Ensure all clips have proper IDs, order, and positions
        for i, clip in enumerate(result.get("clips", [])):
            if not clip.get("id"):
                clip["id"] = str(uuid.uuid4())
            clip["order"] = i
            clip["position"] = {"x": i * 280, "y": 100}
            if "gen_status" not in clip:
                clip["gen_status"] = "pending"
            if "type" not in clip:
                clip["type"] = "image"
            if "duration_ms" not in clip:
                clip["duration_ms"] = 3000
            if "transition_type" not in clip:
                clip["transition_type"] = preset["transitions"][0] if preset["transitions"] else "dissolve"
            # Apply preset text_style to text overlays that don't have one
            if clip.get("type") == "text_overlay" and not clip.get("text_style"):
                clip["text_style"] = preset["text_style"]

        # Calculate total duration
        total = sum(c.get("duration_ms", 3000) for c in result.get("clips", []))
        result["total_duration_ms"] = total
        result["style"] = style
        result["music_mood"] = preset.get("music_mood", "epic")

    return result


def _format_analysis(analysis: dict) -> str:
    """Format analysis dict into a readable prompt section."""
    parts = []
    parts.append(f"Title/Summary: {analysis.get('summary', 'Unknown')}")
    parts.append(f"Genre: {analysis.get('genre', 'Unknown')}")
    parts.append(f"Mood: {analysis.get('mood', 'Unknown')}")
    parts.append(f"Style: {analysis.get('style', 'book')}")
    parts.append(f"Themes: {', '.join(analysis.get('themes', []))}")

    if analysis.get("characters"):
        parts.append("\nKey Characters:")
        for char in analysis["characters"][:5]:
            parts.append(f"  - {char.get('name', '?')}: {char.get('description', '')}")
            parts.append(f"    Visual: {char.get('visual_description', '')}")

    if analysis.get("key_scenes"):
        parts.append("\nKey Scenes (in order of importance):")
        scenes = sorted(analysis["key_scenes"], key=lambda s: s.get("importance", 5), reverse=True)
        for scene in scenes[:10]:
            parts.append(f"  [{scene.get('scene_type', 'scene')}] {scene.get('title', '?')}")
            parts.append(f"    {scene.get('description', '')}")
            parts.append(f"    Visual: {scene.get('visual_description', '')}")
            if scene.get("quote"):
                parts.append(f"    Quote: \"{scene['quote']}\"")

    return "\n".join(parts)
