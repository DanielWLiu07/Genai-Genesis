from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from app.services.gemini import get_model
from app.services.tools import get_gemini_tools
import json

router = APIRouter(prefix="/ai", tags=["chat"])

class ChatRequest(BaseModel):
    project_id: str
    message: str
    timeline: Optional[dict] = None
    analysis: Optional[dict] = None
    history: List[dict] = []

COPILOT_SYSTEM = """You are FrameFlow's AI copilot - a cinematic trailer editor assistant.

You help users edit their book trailer timeline through natural language commands.
You have access to tools that modify the trailer timeline.

Current timeline state will be provided. Use it to understand what clips exist, their order, and properties.

When the user asks to modify the trailer:
1. Understand their intent
2. Call the appropriate tool(s)
3. Explain what you did

Be concise and creative. Think like a film editor.
Suggest improvements proactively when appropriate."""

@router.post("/chat")
async def chat(data: ChatRequest):
    model = get_model()
    if model is None:
        return {
            "role": "assistant",
            "content": "Gemini API key not configured. Set GEMINI_API_KEY in .env",
            "tool_calls": []
        }

    # Build context
    context = f"Current timeline:\n{json.dumps(data.timeline, indent=2)}\n\n" if data.timeline else ""

    # Build conversation history
    messages = []
    for msg in data.history[-10:]:  # Last 10 messages
        messages.append({"role": msg.get("role", "user"), "parts": [msg.get("content", "")]})
    messages.append({"role": "user", "parts": [f"{context}User request: {data.message}"]})

    try:
        chat_session = model.start_chat(history=messages[:-1])
        response = chat_session.send_message(
            messages[-1]["parts"][0],
            # tools=get_gemini_tools(),  # Uncomment when Gemini tool calling is configured
        )

        tool_calls = []
        content = response.text

        # Parse function calls from response if present
        if hasattr(response, 'candidates') and response.candidates:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'function_call') and part.function_call:
                    fc = part.function_call
                    tool_calls.append({
                        "tool_name": fc.name,
                        "arguments": dict(fc.args) if fc.args else {}
                    })

        return {
            "role": "assistant",
            "content": content,
            "tool_calls": tool_calls
        }
    except Exception as e:
        return {
            "role": "assistant",
            "content": f"Error: {str(e)}",
            "tool_calls": []
        }
