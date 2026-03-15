from app.services.gemini import generate_json
from app.services.style_presets import get_preset, auto_detect_preset
import uuid
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an elite cinematic trailer editor and AMV director AI. Your job is to create FAST-PACED, MUSIC-SYNCED book trailer timelines that feel like high-budget Hollywood teasers or anime AMVs.

TRAILER STRUCTURE (tight, punchy — ALL visual shots, no text slides):
- HOOK (0-4s): 2-3 rapid impact shots that immediately grab attention. Start in the action.
- WORLD (4-10s): 3-4 rapid establishing shots. Set the scene fast.
- CHARACTER (10-16s): 3-4 rapid close-ups/action shots of key characters. Make them iconic.
- ESCALATION (16-30s): 6-8 rapid-fire action/tension cuts. Each shot more intense than the last. This is the heart.
- CLIMAX (30-38s): 2-3 most dramatic frames. Slow slightly for impact — emotional peak. End on a powerful final image.

You MUST return a JSON object with this structure:

{
  "clips": [
    {
      "id": "unique-uuid-string",
      "order": 0,
      "type": "image",
      "duration_ms": 1500,
      "prompt": "Extremely detailed cinematic visual prompt describing a SINGLE peak-action moment. MANDATORY: (1) ACTION VERB FIRST — what is physically happening: 'warrior mid-downward slash', 'body fully inverted mid-flip', 'fist connecting at moment of impact', 'character stumbling backward from shockwave'. (2) MOTION TRAJECTORY — direction, arc, velocity: 'lunging forward left-to-right', 'falling backward arms outstretched', 'spinning clockwise'. (3) PEAK BODY POSITION — where limbs are at frozen moment: 'sword arm fully extended', 'legs at maximum split', 'both hands gripping collar at eye level'. (4) CAMERA ANGLE amplifying motion: extreme low angle / crash zoom / Dutch angle / whip-pan. (5) Environmental reaction: speed lines, shockwave rings, debris, dust cloud, sparks. (6) Lighting + color palette + art style. Example: 'Extreme low-angle crash-zoom — warrior mid-downward slash, sword arm fully extended at moment of impact, body weight fully committed forward, opponent recoiling mid-air from force, speed lines radiating from blade tip, debris cloud erupting, deep crimson and black palette, bold manga ink lines, cel-shaded'",
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
- BIAS: 70%+ of clips should be action cuts (800–1800ms). Only slow down for earned emotional/climax moments.
- Use "cut" transition for 90%+ of clips — hard cuts ARE the energy. "dissolve" only at the very end.
- Every visual prompt MUST describe dynamic ACTION or intense EMOTION — NEVER "stands looking at", "walks toward", "sits by"
- ALWAYS describe the PEAK MOMENT of motion: body at full extension, apex of leap, instant of impact — so video AI knows what to animate from and toward
- Characters must have explicit movement: mid-swing, mid-leap, mid-fall, reaching out at arm's length, stumbling backward, spinning in place
- Describe MOTION TRAJECTORY: left-to-right lunge, downward slash, backward recoil, upward burst — gives video AI direction to animate
- Camera angles must be dramatic: Dutch angle, extreme close-up, low angle hero shot, crash zoom, tracking shot
- For manga/anime: MANDATORY speed lines radiating from impact, motion blur streaks on limbs, sakuga smear frames, shockwave distortion rings, debris/dust from force
- The trailer must build RELENTLESSLY — each section more intense than the last
- NEVER use type="text_overlay" — ALL clips must be type="image" or type="video" with visual scene prompts. No title slides, no text intros, no outro cards.

SHOT CONTINUITY (critical for AI video generation):
- shot_type: "continuous" means this clip flows directly from the previous one (same scene, camera moves, no cut). The AI will use the previous frame as a start frame.
- shot_type: "cut" means a new scene entirely — different location, time jump, or hard edit.
- scene_group: integer grouping clips that belong to the same continuous sequence. Clips in the same group share visual context. Start a new group number for each new scene/location.
- Example: establishing shot + two reaction shots of same character = same scene_group, shot_type="continuous" after first. A jump cut to a new location = new scene_group, shot_type="cut"."""


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
        pacing_hint = "\nPACING: Ultra fast-paced manga AMV. Rapid-fire cuts 800–1200ms each. 18-22 clips. Flash cuts for impacts (500–800ms). Only slow at emotional peak and climax."
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
Think rapid cuts between: character close-ups → sweeping landscape → action moment → emotional beat → climax shot.
The energy should BUILD relentlessly toward a climax, then end on the most powerful visual frame.
NO title cards, NO text slides, NO "The End", NO book title screens — ONLY raw visual shots.
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

        # Strip any text_overlay clips AND prompt-based title/outro cards
        _STRIP_TERMS = {
            'title card', 'title screen', 'title slide', 'title page', 'title treatment',
            'title reveal', 'title sequence', 'opening title', 'title shot',
            'book title', 'movie title', 'film title', 'outro card', 'intro card',
            'end card', 'coming soon', 'the end', 'credits',
            'glowing text', 'floating text', 'text appears', 'text reads',
            'logo reveal', 'brand reveal',
            'title text', 'text on screen', 'text on black', 'text overlay',
            'words appear', 'words on screen', 'text fades', 'text floats',
            'chapter title', 'opening card', 'closing card',
            'black screen with', 'fade to black with', 'text displayed',
        }
        def _is_bad(c: dict) -> bool:
            if c.get("type") == "text_overlay":
                return True
            prompt = (c.get("prompt") or "").lower()
            return any(term in prompt for term in _STRIP_TERMS)
        result["clips"] = [c for c in result.get("clips", []) if not _is_bad(c)]
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
