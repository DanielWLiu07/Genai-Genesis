from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from app.services.gemini import get_model
from app.services.tools import get_gemini_tools
import google.generativeai as genai
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["chat"])


class ChatRequest(BaseModel):
    project_id: str
    message: str
    timeline: Optional[dict] = None
    analysis: Optional[dict] = None
    history: List[dict] = []


COPILOT_SYSTEM = """You are FrameFlow's AI copilot — a cinematic trailer editor assistant.

You help users edit their book trailer timeline through natural language. You think like a professional film trailer editor.

CAPABILITIES:
- Add new scenes/clips to the trailer
- Remove scenes that don't work
- Update clip prompts, durations, text overlays, and transitions
- Reorder the timeline for better pacing
- Regenerate visuals with improved prompts
- Suggest creative improvements

BEHAVIOR:
- When the user asks to modify the trailer, ALWAYS use the appropriate tool(s)
- Be concise — explain what you're doing in 1-2 sentences
- Think cinematically: pacing, visual contrast, emotional arcs
- If the user is vague ("make it better"), analyze the timeline and make specific improvements
- You can call multiple tools in one response for complex changes
- When referencing clips, use their IDs from the timeline state

PACING KNOWLEDGE:
- Hook: 2-3 seconds, striking visual
- Establishing shots: 3-4 seconds
- Action/conflict: 2-3 seconds with quick cuts
- Emotional moments: 4-5 seconds with dissolve transitions
- Text overlays: 2-3 seconds
- Total trailer: 30-60 seconds ideal

VISUAL PROMPT STYLE:
When creating or updating clip prompts, write detailed cinematic descriptions:
- Camera angle (wide, medium, close-up, aerial, low-angle, Dutch angle)
- Lighting (golden hour, dramatic sidelight, neon, moonlit, chiaroscuro)
- Color palette (warm amber, cool blue, desaturated, high contrast)
- Atmosphere (fog, rain, dust particles, lens flare, bokeh)
- Style (photorealistic, painterly, anime, noir, ethereal)"""


@router.post("/chat")
async def chat(data: ChatRequest):
    try:
        tools = get_gemini_tools()
        model = get_model(system_instruction=COPILOT_SYSTEM, tools=tools)
    except RuntimeError as e:
        return {
            "role": "assistant",
            "content": str(e),
            "tool_calls": [],
        }

    # Build timeline context
    timeline_context = _build_timeline_context(data.timeline)

    # Build Gemini chat history from our message history
    gemini_history = []
    for msg in data.history[-10:]:
        role = msg.get("role", "user")
        if role == "assistant":
            role = "model"
        elif role != "user":
            continue
        content = msg.get("content", "")
        if content:
            gemini_history.append({"role": role, "parts": [content]})

    # Start chat with history
    chat_session = model.start_chat(history=gemini_history)

    # Build the user message with context
    user_message = data.message
    if timeline_context:
        user_message = f"{timeline_context}\n\nUser request: {data.message}"

    try:
        response = chat_session.send_message(user_message)

        # Extract text and tool calls from response
        tool_calls = []
        text_parts = []

        for part in response.parts:
            if part.function_call:
                fc = part.function_call
                # Convert MapComposite args to regular dict
                args = {}
                for key, value in fc.args.items():
                    args[key] = _convert_proto_value(value)

                tool_calls.append({
                    "tool_name": fc.name,
                    "arguments": args,
                })
            elif part.text:
                text_parts.append(part.text)

        content = " ".join(text_parts) if text_parts else ""

        # If we got tool calls, send dummy tool responses back to get the model's explanation
        if tool_calls and not content:
            # Send function responses so model can explain what it did
            func_responses = []
            for tc in tool_calls:
                func_responses.append(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=tc["tool_name"],
                            response={"result": "success", "applied": True},
                        )
                    )
                )
            try:
                followup = chat_session.send_message(func_responses)
                content = followup.text
            except Exception:
                # Generate a default explanation
                actions = [f"{tc['tool_name']}()" for tc in tool_calls]
                content = f"Done! Applied: {', '.join(actions)}"

        return {
            "role": "assistant",
            "content": content,
            "tool_calls": tool_calls,
        }

    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        return {
            "role": "assistant",
            "content": f"Something went wrong: {str(e)}",
            "tool_calls": [],
        }


def _build_timeline_context(timeline: dict | None) -> str:
    """Build a concise timeline summary for the model's context."""
    if not timeline:
        return "The timeline is currently empty."

    clips = timeline.get("clips", [])
    if not clips:
        return "The timeline is currently empty."

    total_ms = sum(c.get("duration_ms", 0) for c in clips)
    total_sec = total_ms / 1000

    lines = [f"CURRENT TIMELINE ({len(clips)} clips, {total_sec:.1f}s total):"]
    for clip in sorted(clips, key=lambda c: c.get("order", 0)):
        duration = clip.get("duration_ms", 3000) / 1000
        clip_type = clip.get("type", "image")
        status = clip.get("gen_status", "pending")
        text = f' text="{clip.get("text")}"' if clip.get("text") else ""
        transition = f" → {clip.get('transition_type', 'cut')}" if clip.get("transition_type") else ""
        prompt_preview = (clip.get("prompt", "")[:80] + "...") if len(clip.get("prompt", "")) > 80 else clip.get("prompt", "")

        lines.append(
            f"  [{clip.get('order', '?')}] id={clip['id']} | {clip_type} | {duration}s | {status}{text}{transition}"
        )
        lines.append(f"      prompt: {prompt_preview}")

    return "\n".join(lines)


def _convert_proto_value(value):
    """Convert protobuf values to Python native types."""
    if hasattr(value, "items"):
        return {k: _convert_proto_value(v) for k, v in value.items()}
    if hasattr(value, "__iter__") and not isinstance(value, (str, bytes)):
        return [_convert_proto_value(v) for v in value]
    return value
