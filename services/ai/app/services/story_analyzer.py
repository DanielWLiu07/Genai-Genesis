from app.services.gemini import generate
import json

SYSTEM_PROMPT = """You are a narrative analysis AI. Analyze the given story text and extract structured information.

Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence summary",
  "themes": ["theme1", "theme2"],
  "genre": "genre",
  "mood": "overall mood",
  "target_audience": "audience description",
  "characters": [
    {"name": "...", "description": "...", "visual_description": "cinematic visual description for image generation"}
  ],
  "key_scenes": [
    {
      "title": "scene title",
      "description": "what happens",
      "quote": "notable quote from text if any",
      "mood": "scene mood",
      "visual_description": "cinematic visual description for image generation",
      "scene_type": "introduction|character_reveal|tension_build|conflict|climax|emotional_pause|ending_hook"
    }
  ]
}

Extract 6-10 key scenes that would make a compelling book trailer. Focus on visually striking moments.
Return ONLY valid JSON, no markdown."""

async def analyze_story(text: str) -> dict:
    result = await generate(f"Analyze this story:\n\n{text[:8000]}", SYSTEM_PROMPT)
    try:
        # Strip markdown code fences if present
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {"error": "Failed to parse analysis", "raw": result}
