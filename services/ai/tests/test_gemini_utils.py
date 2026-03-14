import pytest
from app.services.gemini import parse_json_response


def test_parse_valid_json():
    """parse_json_response parses valid JSON directly."""
    result = parse_json_response('{"key": "value", "count": 42}')
    assert result == {"key": "value", "count": 42}


def test_parse_json_with_whitespace():
    """parse_json_response handles leading/trailing whitespace."""
    result = parse_json_response('  \n  {"name": "test"}  \n  ')
    assert result == {"name": "test"}


def test_parse_json_in_markdown_fences():
    """parse_json_response extracts JSON from markdown code fences."""
    text = '```json\n{"scenes": [1, 2, 3]}\n```'
    result = parse_json_response(text)
    assert result == {"scenes": [1, 2, 3]}


def test_parse_json_in_plain_markdown_fences():
    """parse_json_response handles fences without json language tag."""
    text = '```\n{"data": true}\n```'
    result = parse_json_response(text)
    assert result == {"data": True}


def test_parse_json_embedded_in_text():
    """parse_json_response extracts JSON object from surrounding text."""
    text = 'Here is the analysis:\n{"summary": "A story", "themes": ["love"]}\nEnd of analysis.'
    result = parse_json_response(text)
    assert result["summary"] == "A story"
    assert result["themes"] == ["love"]


def test_parse_invalid_json_raises():
    """parse_json_response raises ValueError for unparseable content."""
    with pytest.raises(ValueError, match="Could not parse JSON"):
        parse_json_response("This is not JSON at all and has no braces")


def test_parse_json_nested_object():
    """parse_json_response handles nested JSON objects."""
    text = '{"clips": [{"id": "1", "duration_ms": 3000}], "total": 3000}'
    result = parse_json_response(text)
    assert len(result["clips"]) == 1
    assert result["clips"][0]["id"] == "1"


def test_parse_json_in_markdown_with_extra_text():
    """parse_json_response handles markdown fences with surrounding text."""
    text = (
        "Here is the result:\n"
        "```json\n"
        '{"score": 8, "suggestions": []}\n'
        "```\n"
        "Hope that helps!"
    )
    result = parse_json_response(text)
    assert result["score"] == 8
    assert result["suggestions"] == []


def test_parse_empty_json_object():
    """parse_json_response handles empty JSON object."""
    result = parse_json_response("{}")
    assert result == {}


def test_parse_json_array_as_top_level():
    """parse_json_response can parse a top-level JSON array via direct json.loads."""
    result = parse_json_response("[1, 2, 3]")
    assert result == [1, 2, 3]
