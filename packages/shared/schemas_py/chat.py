from pydantic import BaseModel
from typing import Optional, List, Any

class ToolCall(BaseModel):
    tool_name: str
    arguments: dict = {}
    result: Optional[Any] = None

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant" | "tool_result"
    content: str
    tool_calls: Optional[List[ToolCall]] = None
    timestamp: Optional[str] = None
