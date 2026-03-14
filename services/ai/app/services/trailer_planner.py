from app.services.gemini import generate
import json
import uuid

SYSTEM_PROMPT = """You are a cinematic trailer planner. Given a book analysis, create a trailer timeline.

A good book trailer:
- Opens with a hook (mysterious or dramatic shot)
- Introduces the protagonist
- Builds tension through key conflicts
- Hits a climax moment
- Ends with a hook/cliffhanger
- Is 30-60 seconds total

Return a JSON object with this structure:
{
  "clips": [
    {
      "id": "unique-id",
      "order": 0,
      "type": "image",
      "duration_ms": 3000,
      "prompt": "detailed cinematic visual prompt for AI image generation",
      "text": "optional overlay text (short, impactful)",
      "text_style": {"font_size": 32, "color": "#ffffff", "position": "bottom", "animation": "fade_in"},
      "transition_type": "dissolve",
      "gen_status": "pending",
      "position": {"x": 0, "y": 100}
    }
  ]
}

Generate 8-12 clips. Each prompt should be detailed and cinematic (describe camera angle, lighting, mood, style).
Return ONLY valid JSON, no markdown."""

async def plan_trailer(analysis: dict) -> dict:
    result = await generate(
        f"Create a cinematic trailer timeline for this book:\n\n{json.dumps(analysis, indent=2)}",
        SYSTEM_PROMPT
    )
    try:
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        data = json.loads(cleaned)
        # Ensure IDs and positions
        for i, clip in enumerate(data.get("clips", [])):
            if not clip.get("id"):
                clip["id"] = str(uuid.uuid4())
            clip["order"] = i
            clip["position"] = {"x": i * 280, "y": 100}
        return data
    except json.JSONDecodeError:
        return {"error": "Failed to parse trailer plan", "raw": result}
