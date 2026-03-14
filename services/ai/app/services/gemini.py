import google.generativeai as genai
from google.generativeai.types import GenerationConfig
from google.api_core.exceptions import ResourceExhausted
from app.config import get_settings
import json
import re
import asyncio
import logging

logger = logging.getLogger(__name__)

_configured = False


def _ensure_configured():
    global _configured
    if not _configured:
        settings = get_settings()
        if settings.gemini_api_key:
            genai.configure(api_key=settings.gemini_api_key)
            _configured = True
        else:
            raise RuntimeError("GEMINI_API_KEY not set in .env")


def get_model(system_instruction: str = "", tools=None):
    """Get a Gemini model instance for free-text generation."""
    _ensure_configured()

    kwargs = {
        "model_name": "gemini-2.5-flash",
        "generation_config": GenerationConfig(
            temperature=0.7,
            max_output_tokens=8192,
        ),
    }
    if system_instruction:
        kwargs["system_instruction"] = system_instruction
    if tools:
        kwargs["tools"] = tools

    return genai.GenerativeModel(**kwargs)


def get_json_model(system_instruction: str = ""):
    """Get a model configured for JSON output.

    Uses gemini-2.5-flash with a raised token limit to avoid truncation.
    _extract_text handles thinking-model responses where response.text may
    include internal thought tokens before the actual JSON.
    """
    _ensure_configured()
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=system_instruction,
        generation_config=GenerationConfig(
            temperature=0.4,
            max_output_tokens=16384,
            response_mime_type="application/json",
        ),
    )


def parse_json_response(text: str) -> dict:
    """Robustly parse JSON from Gemini response, handling markdown fences."""
    cleaned = text.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r"```(?:json)?\s*\n?(.*?)```", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from response: {cleaned[:200]}...")


def _extract_text(response) -> str:
    """Extract text from a Gemini response, handling thinking models."""
    try:
        text = response.text
        if text and text.strip():
            return text
    except Exception:
        pass

    # Fallback: grab the last non-empty text part (skips thought tokens)
    try:
        for candidate in response.candidates:
            for part in reversed(candidate.content.parts):
                t = getattr(part, "text", None)
                if t and t.strip():
                    return t
    except Exception:
        pass

    raise ValueError("Gemini returned an empty response (possibly blocked or over budget)")


async def generate_json(prompt: str, system_instruction: str = "", retries: int = 2) -> dict:
    """Generate a JSON response from Gemini with retry logic and rate limit handling."""
    model = get_json_model(system_instruction)

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = model.generate_content(prompt)
            text = _extract_text(response)
            return parse_json_response(text)
        except ResourceExhausted as e:
            last_error = e
            wait = min(2 ** attempt * 5, 30)
            logger.warning(f"Rate limited, waiting {wait}s before retry {attempt + 1}")
            await asyncio.sleep(wait)
        except Exception as e:
            last_error = e
            logger.warning(f"Gemini JSON generation attempt {attempt + 1} failed: {e}")
            if attempt < retries:
                await asyncio.sleep(1)
                continue

    return {"error": f"Failed after {retries + 1} attempts: {str(last_error)}"}


async def generate_text(prompt: str, system_instruction: str = "") -> str:
    """Generate a plain text response from Gemini."""
    model = get_model(system_instruction)
    try:
        response = model.generate_content(prompt)
        return response.text
    except ResourceExhausted:
        await asyncio.sleep(5)
        response = model.generate_content(prompt)
        return response.text
