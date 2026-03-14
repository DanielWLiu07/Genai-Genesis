from app.services.gemini import generate_json
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a professional film trailer editor reviewing a book trailer timeline.
Analyze the timeline and provide actionable improvement suggestions.

Return a JSON object:
{
  "score": 7,
  "overall": "Brief overall assessment (1-2 sentences)",
  "suggestions": [
    {
      "type": "pacing|visual|structure|text|transition",
      "priority": "high|medium|low",
      "description": "What to improve and why",
      "action": "Specific action to take",
      "clip_id": "ID of relevant clip if applicable, or null"
    }
  ]
}

Score is 1-10 (10 = perfect trailer). Provide 3-6 suggestions sorted by priority.
Focus on: pacing issues, weak openings, missing climax, repetitive visuals, text overlay effectiveness."""


async def get_suggestions(timeline: dict, analysis: dict = None) -> dict:
    """Analyze a trailer timeline and suggest improvements."""
    clips = timeline.get("clips", [])
    if not clips:
        return {
            "score": 0,
            "overall": "Timeline is empty. Start by generating a trailer plan.",
            "suggestions": [],
        }

    total_ms = sum(c.get("duration_ms", 0) for c in clips)

    context = f"Timeline has {len(clips)} clips, {total_ms / 1000:.1f}s total.\n\n"
    for clip in sorted(clips, key=lambda c: c.get("order", 0)):
        context += (
            f"Clip {clip.get('order', '?')}: {clip.get('type', 'image')} | "
            f"{clip.get('duration_ms', 0) / 1000}s | "
            f"prompt: {clip.get('prompt', 'none')[:100]} | "
            f"text: {clip.get('text', 'none')} | "
            f"transition: {clip.get('transition_type', 'none')}\n"
        )

    if analysis:
        context += f"\nBook genre: {analysis.get('genre', '?')}, mood: {analysis.get('mood', '?')}"

    return await generate_json(
        f"Review this book trailer timeline and suggest improvements:\n\n{context}",
        SYSTEM_PROMPT,
    )
