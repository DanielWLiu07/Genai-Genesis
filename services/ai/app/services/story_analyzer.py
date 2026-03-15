from app.services.gemini import generate_json
from typing import Optional, List
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a narrative analysis AI specializing in extracting cinematic potential from written stories, books, manga, and comics.

Your job is to analyze text and identify the key elements that would make a compelling book trailer or visual preview.

You MUST return a JSON object with this exact structure:

{
  "summary": "2-3 sentence compelling summary of the story",
  "themes": ["theme1", "theme2", "theme3"],
  "genre": "primary genre",
  "sub_genres": ["sub-genre1", "sub-genre2"],
  "mood": "overall emotional tone",
  "target_audience": "who would enjoy this",
  "style": "book|manga|comic|light_novel",
  "characters": [
    {
      "name": "character name",
      "role": "protagonist|antagonist|supporting",
      "description": "who they are and their arc",
      "visual_description": "detailed cinematic visual description for AI image generation - describe appearance, clothing, pose, lighting, and atmosphere"
    }
  ],
  "key_scenes": [
    {
      "title": "short scene title",
      "description": "what happens in this scene",
      "quote": "a notable line from the text if available, otherwise null",
      "mood": "emotional tone of this specific scene",
      "visual_description": "detailed cinematic shot description focused on ACTION and MOTION — describe WHAT IS HAPPENING with movement verbs: who is doing what, body at peak of action (mid-leap, arm fully extended at moment of strike, body inverted mid-fall), direction/trajectory of motion, and camera angle amplifying the movement. Include lighting and atmosphere. Example: 'Low-angle shot of a warrior mid-leap, body fully horizontal, sword arm extended at moment of downward slash, speed lines radiating from blade, enemy recoiling below, harsh rim lighting, dust cloud from impact'",
      "scene_type": "one of: introduction, character_reveal, tension_build, conflict, mystery, action, climax, emotional_pause, ending_hook",
      "importance": 8,
      "has_uploaded_image": false,
      "uploaded_image_url": null
    }
  ]
}

CRITICAL RULES:
- Extract 8-12 key scenes that would make visually striking trailer moments
- Order scenes to tell a compelling story arc (not necessarily chronological)
- Visual descriptions must be CINEMATIC, ACTION-FOCUSED, and EXTREMELY DETAILED:
  * ALWAYS start with WHAT IS HAPPENING — use action verbs: "warrior mid-leap", "hand slamming", "body recoiling from impact", "eyes snapping open", "cloak billowing as character spins"
  * Describe the PEAK MOMENT of motion: body at full extension, apex of jump, instant of impact, arm at maximum reach — this is what the AI must freeze and then animate
  * Motion trajectory: what direction things are moving, entry/exit vectors (lunging forward, falling backward, spinning clockwise)
  * Camera angle amplifying the action (extreme low angle on mid-swing hero, crash zoom into impact point, Dutch angle during fall)
  * Lighting and atmosphere (chiaroscuro, speed lines, shockwave rings, dust clouds, debris mid-air)
  * Color palette and art style (bold ink lines, high contrast B&W, cel-shading)
  * AVOID static descriptions like "stands looking at" or "sits by" — every scene must have implied or explicit motion
- For manga/comics, include: speed lines, impact frames, motion blur streaks, sakuga smear
- importance is 1-10 (10 = absolutely essential for trailer)
- Every visual_description must be detailed enough that a video AI can infer what happens next
- Think like a Hollywood trailer editor — capture the PEAK FRAME of each action beat"""

SCENE_IMAGE_INSTRUCTIONS = """
IMPORTANT - UPLOADED IMAGES:
The user has provided {image_count} reference image(s). When planning scenes:
- If an uploaded image matches a scene's content, set has_uploaded_image=true and uploaded_image_url to that image's URL
- For scenes without a matching uploaded image, set has_uploaded_image=false (these will be AI-generated using Nano Banana)
- STILL provide a detailed visual_description for every scene, even those with uploaded images (for regeneration/alternatives)
- It's fine to have some scenes use uploaded images and others be AI-generated
"""

CHARACTER_INSTRUCTIONS = """
IMPORTANT - CHARACTER INFORMATION:
The user has provided the following character descriptions. Use these to inform your analysis and ensure visual descriptions match:
{character_list}
- Incorporate these character details into scene visual_descriptions
- If characters appear in scenes, describe them consistently with the provided descriptions
"""


async def analyze_story(
    text: str,
    characters: Optional[List[dict]] = None,
    uploaded_image_urls: Optional[List[str]] = None,
) -> dict:
    """Analyze story text and extract narrative structure for trailer creation."""
    # Truncate very long texts but keep enough for good analysis
    max_chars = 15000
    if len(text) > max_chars:
        chunk = max_chars // 3
        text = (
            text[:chunk]
            + "\n\n[...middle section...]\n\n"
            + text[len(text) // 2 - chunk // 2 : len(text) // 2 + chunk // 2]
            + "\n\n[...later section...]\n\n"
            + text[-chunk:]
        )

    # Build extra context sections
    extra_context = ""

    if characters:
        char_list = "\n".join(
            f"- {c['name']}: {c.get('description', 'No description')}"
            for c in characters
        )
        extra_context += CHARACTER_INSTRUCTIONS.format(character_list=char_list)

    if uploaded_image_urls and len(uploaded_image_urls) > 0:
        extra_context += SCENE_IMAGE_INSTRUCTIONS.format(image_count=len(uploaded_image_urls))
        extra_context += "\nUploaded image URLs:\n"
        for i, url in enumerate(uploaded_image_urls):
            extra_context += f"  Image {i + 1}: {url}\n"

    if not uploaded_image_urls or len(uploaded_image_urls) == 0:
        extra_context += "\n\nNOTE: No reference images were provided. ALL scenes will need to be generated using AI image generation (Nano Banana). Make visual_descriptions extra detailed and specific for best generation results."

    prompt = f"""Analyze the following story text and extract its narrative structure for creating a cinematic book trailer.

STORY TEXT:
---
{text}
---
{extra_context}

Analyze this story thoroughly. Identify the most visually compelling and emotionally impactful moments for a trailer. Each scene's visual_description must be detailed enough to generate a high-quality image from it alone."""

    system = SYSTEM_PROMPT
    result = await generate_json(prompt, system)

    # Validate required fields
    if "error" not in result:
        if "key_scenes" not in result:
            result["key_scenes"] = []
        if "characters" not in result:
            result["characters"] = []
        for scene in result.get("key_scenes", []):
            if "importance" not in scene:
                scene["importance"] = 5
            if "has_uploaded_image" not in scene:
                scene["has_uploaded_image"] = False

    return result
