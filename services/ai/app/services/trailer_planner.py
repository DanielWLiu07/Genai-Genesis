from app.services.gemini import generate_json
from app.services.style_presets import get_preset, auto_detect_preset
import uuid
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an elite cinematic trailer editor and AMV director AI. Your job is to create FAST-PACED, MUSIC-SYNCED book trailer timelines that feel like high-budget Hollywood teasers or anime AMVs.

TRAILER STRUCTURE (tight, punchy):
- HOOK (0-2s): Single text_overlay — title or killer tagline. Immediate impact.
- WORLD (2-8s): 3-4 rapid establishing shots. Set the scene fast.
- CHARACTER (8-14s): 3-4 rapid close-ups/action shots of key characters. Make them iconic.
- ESCALATION (14-28s): 6-8 rapid-fire action/tension cuts. Each shot more intense than the last. This is the heart.
- CLIMAX (28-34s): 2-3 most dramatic frames. Slow slightly for impact — emotional peak.
- TITLE OUT (34-38s): text_overlay with title + tagline. Fade to black.

You MUST return a JSON object with this structure:

{
  "clips": [
    {
      "id": "unique-uuid-string",
      "order": 0,
      "type": "image",
      "duration_ms": 1500,
      "prompt": "Extremely detailed cinematic visual prompt. REQUIRED fields: subject + action, camera angle (extreme close-up/low angle/bird's eye/Dutch angle/tracking), lighting (dramatic chiaroscuro/rim light/lens flare/volumetric), color palette, atmosphere, motion blur or speed lines if action. Each prompt must describe a SINGLE dynamic moment frozen in time — not a static scene. Example: 'Extreme low-angle shot of a cloaked warrior silhouetted against a burning city skyline, camera tilting up dramatically, embers floating, deep crimson and black palette, manga speed lines radiating outward, cel-shaded anime style, cinematic aspect ratio'",
      "text": "Short impactful overlay text or null",
      "text_style": {"font_size": 48, "color": "#ffffff", "position": "center", "animation": "fade_in"},
      "transition_type": "cut",
      "shot_type": "cut",
      "scene_group": 1,
      "gen_status": "pending",
      "position": {"x": 0, "y": 100}
    }
  ],
  "trailer_style": "cinematic|anime|noir|fantasy|horror|romantic",
  "total_duration_ms": 38000,
  "music_mood": "epic|dark|romantic|mysterious|intense|whimsical"
}

RULES:
- Generate 16-22 clips for a 30-40 second trailer
- If BPM is provided, ALL duration_ms values MUST be exact multiples of the beat interval so cuts land on the beat
- DURATION TABLE (choose per scene — default fast, go slower only when the moment earns it):
    * Flash impact cut (single punch/explosion/impact freeze-frame): 500–800ms
    * Action cut (sword swing, chase, leap, power charge): 800–1200ms
    * Intense action sequence (battle scene, full motion): 1200–1800ms
    * Establishing/world shot (location reveal, wide pan): 2000–2500ms
    * Emotional beat (reaction, realization, grief): 2000–3000ms
    * Climax peak frame (most dramatic moment): 2500–3500ms
    * Text overlay (title card, tagline): 1500–2500ms
    * Opening hook text: 1000–1500ms
- BIAS: 70%+ of clips should be action cuts (800–1800ms). Only slow down for earned emotional/climax moments.
- Use "cut" transition for 90%+ of clips — hard cuts ARE the energy. "dissolve" only at the very end.
- Every visual prompt MUST describe dynamic ACTION or intense EMOTION — no static landscapes, no "stands looking at"
- Characters must be doing something: running, fighting, reaching out, falling, screaming, embracing
- Camera angles must be dramatic: Dutch angle, extreme close-up, low angle hero shot, crash zoom, tracking shot
- For manga/anime: MANDATORY speed lines, impact frames, cel-shading, heavy black ink outlines, sakuga motion smear on every action clip
- text_style.animation: fade_in for titles, typewriter for taglines, slide_up for action text
- The trailer must build RELENTLESSLY — each section more intense than the last

SHOT CONTINUITY (critical for AI video generation):
- shot_type: "continuous" means this clip flows directly from the previous one (same scene, camera moves, no cut). The AI will use the previous frame as a start frame.
- shot_type: "cut" means a new scene entirely — different location, time jump, or hard edit.
- scene_group: integer grouping clips that belong to the same continuous sequence. Clips in the same group share visual context. Start a new group number for each new scene/location.
- Example: establishing shot + two reaction shots of same character = same scene_group, shot_type="continuous" after first. A jump cut to a new location = new scene_group, shot_type="cut".
- text_overlay clips should have shot_type="cut" and their own scene_group."""


STYLE_MODIFIERS = {
    "horror": "Use dark, desaturated colors. Heavy shadows. Unsettling angles. Flickering light sources. Fog and mist.",
    "romance": "Warm golden tones. Soft focus. Intimate framing. Lens flares. Dreamy atmosphere.",
    "thriller": "High contrast. Dutch angles. Cool blue-grey palette. Sharp shadows. Urban nightscapes.",
    "fantasy": "Rich saturated colors. Ethereal lighting. Sweeping landscapes. Magical particle effects.",
    "scifi": "Neon accent lighting. Clean geometric compositions. Holographic elements. Deep space vistas.",
    "manga": "Anime art style. Bold linework. Dynamic speed lines for action. Cherry blossoms. Dramatic lighting.",
    "literary": "Painterly aesthetic. Muted earth tones. Classical composition. Natural lighting. Contemplative framing.",
}


def _beat_duration_ms(bpm: float, beats: int = 2) -> int:
    """Return duration in ms for N beats at given BPM, snapped to nearest 250ms."""
    raw = (60_000 / bpm) * beats
    return max(500, round(raw / 250) * 250)


async def plan_trailer(analysis: dict, style: str = None, pacing: str = "balanced", music_track: dict = None) -> dict:
    """Generate a trailer timeline from story analysis, optionally beat-synced to music."""
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

    # ── Music hint ────────────────────────────────────────────────────────────
    music_hint = ""
    beat_ms = None  # ms per beat
    if music_track:
        name = music_track.get("name", "")
        bpm = music_track.get("bpm")
        mood = music_track.get("mood") or music_track.get("genre", "")
        music_hint = f"\nMUSIC TRACK: \"{name}\""
        if mood:
            music_hint += f" — mood: {mood}"
        if bpm:
            beat_ms = int(60_000 / bpm)
            two_beat = _beat_duration_ms(bpm, 2)
            four_beat = _beat_duration_ms(bpm, 4)
            music_hint += (
                f"\nBPM: {bpm:.0f} → 1 beat = {beat_ms}ms | 2 beats = {two_beat}ms | 4 beats = {four_beat}ms"
                f"\nBEAT SYNC: Set duration_ms to multiples of the beat length so cuts land on the beat. "
                f"Fast action clips = 2 beats ({two_beat}ms). Establishing shots = 4 beats ({four_beat}ms). "
                f"Text overlays = 4 beats ({four_beat}ms). Every cut MUST land on a beat."
            )
        music_hint += "\nThe entire trailer must feel perfectly synced to this track — energy, pacing, and cuts driven by the music."

    pacing_hint = ""
    if pacing == "fast" or preset.get("pacing") == "fast":
        pacing_hint = "\nPACING: Ultra fast-paced manga AMV. Rapid-fire cuts 800–1200ms each. 18-22 clips. Flash cuts for impacts (500–800ms). Only slow at emotional peak and title out."
    elif pacing == "slow" or preset.get("pacing") == "slow":
        pacing_hint = "\nPACING: Atmospheric trailer. Longer holds 2000–3000ms. Dissolve transitions. 12-14 clips."
    else:
        pacing_hint = "\nPACING: Fast-paced manga AMV trailer. Action cuts 800–1500ms dominate (70%+ of clips). Flash cuts (500–800ms) for impact moments. Only slow down for earned emotional/climax beats. 16-20 clips."

    prompt = f"""Create a cinematic, FAST-PACED book trailer timeline for this story.

BOOK ANALYSIS:
{_format_analysis(analysis)}
{style_hint}
{music_hint}
{pacing_hint}

DIRECTOR'S BRIEF:
This trailer must feel like a high-energy AMV / Hollywood blockbuster teaser — not a slideshow.
Every scene should be action-packed or emotionally charged. No slow, boring holds.
Think rapid cuts between: character close-ups → sweeping landscape → action moment → emotional beat → title card.
The energy should BUILD relentlessly toward a climax, then land on the title with impact.
Make someone's heart race watching this. Every single frame must earn its place."""

    result = await generate_json(prompt, SYSTEM_PROMPT)

    if "error" not in result:
        # Post-process: ensure all clips have required fields
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
                # Default to 2-beat duration if we have BPM, else 1000ms (action default)
                clip["duration_ms"] = _beat_duration_ms(music_track["bpm"], 2) if (music_track and music_track.get("bpm")) else 1000
            if not clip.get("prompt"):
                clip["prompt"] = ""
            if "transition_type" not in clip:
                clip["transition_type"] = "cut"  # default to hard cut for fast pacing
            if "shot_type" not in clip:
                clip["shot_type"] = "cut"
            if "scene_group" not in clip:
                clip["scene_group"] = i
            if clip.get("type") == "text_overlay":
                clip["shot_type"] = "cut"
            if clip.get("type") == "text_overlay" and not clip.get("text_style"):
                clip["text_style"] = preset["text_style"]

        total = sum(c.get("duration_ms", 1500) for c in result.get("clips", []))
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
