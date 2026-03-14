from app.services.gemini import generate_json
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
      "visual_description": "detailed cinematic shot description - include camera angle, lighting, color palette, atmosphere, and composition. Example: 'Close-up of a young woman's face illuminated by candlelight, tears reflecting golden light, dark medieval chamber background, chiaroscuro lighting, shallow depth of field'",
      "scene_type": "one of: introduction, character_reveal, tension_build, conflict, mystery, action, climax, emotional_pause, ending_hook",
      "importance": 8
    }
  ]
}

CRITICAL RULES:
- Extract 8-12 key scenes that would make visually striking trailer moments
- Order scenes to tell a compelling story arc (not necessarily chronological)
- Visual descriptions must be CINEMATIC - describe camera angles, lighting, depth of field, color grading
- For manga/comics, describe the art style and panel composition
- importance is 1-10 (10 = absolutely essential for trailer)
- Every scene needs a strong visual_description suitable for AI image generation
- Think like a Hollywood trailer editor selecting the most impactful moments"""


async def analyze_story(text: str) -> dict:
    """Analyze story text and extract narrative structure for trailer creation."""
    # Truncate very long texts but keep enough for good analysis
    max_chars = 15000
    if len(text) > max_chars:
        # Take beginning, middle section, and end for best coverage
        chunk = max_chars // 3
        text = (
            text[:chunk]
            + "\n\n[...middle section...]\n\n"
            + text[len(text) // 2 - chunk // 2 : len(text) // 2 + chunk // 2]
            + "\n\n[...later section...]\n\n"
            + text[-chunk:]
        )

    prompt = f"""Analyze the following story text and extract its narrative structure for creating a cinematic book trailer.

STORY TEXT:
---
{text}
---

Analyze this story thoroughly. Identify the most visually compelling and emotionally impactful moments for a trailer."""

    result = await generate_json(prompt, SYSTEM_PROMPT)

    # Validate required fields
    if "error" not in result:
        if "key_scenes" not in result:
            result["key_scenes"] = []
        if "characters" not in result:
            result["characters"] = []
        # Ensure importance field exists
        for scene in result.get("key_scenes", []):
            if "importance" not in scene:
                scene["importance"] = 5

    return result
