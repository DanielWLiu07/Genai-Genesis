import google.generativeai as genai
from app.config import get_settings

_model = None

def get_model():
    global _model
    if _model is None:
        settings = get_settings()
        if settings.gemini_api_key:
            genai.configure(api_key=settings.gemini_api_key)
            _model = genai.GenerativeModel("gemini-1.5-flash")
    return _model

async def generate(prompt: str, system_instruction: str = "") -> str:
    model = get_model()
    if model is None:
        return '{"error": "Gemini API key not configured"}'

    response = model.generate_content(
        [system_instruction, prompt] if system_instruction else prompt
    )
    return response.text
