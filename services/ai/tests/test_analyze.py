from unittest.mock import patch, AsyncMock
import pytest


def test_analyze_too_short_text(client):
    """POST /ai/analyze with text < 50 chars returns 400."""
    response = client.post(
        "/ai/analyze",
        json={"project_id": "proj-1", "book_text": "Too short"},
    )
    assert response.status_code == 400
    assert "too short" in response.json()["detail"].lower()


def test_analyze_empty_text(client):
    """POST /ai/analyze with empty text returns 400."""
    response = client.post(
        "/ai/analyze",
        json={"project_id": "proj-1", "book_text": ""},
    )
    assert response.status_code == 400


def test_analyze_success(client, sample_story_text, sample_analysis):
    """POST /ai/analyze with valid text returns analysis with characters, themes, key_scenes."""
    with patch(
        "app.services.story_analyzer.generate_json",
        new_callable=AsyncMock,
        return_value=sample_analysis,
    ):
        response = client.post(
            "/ai/analyze",
            json={"project_id": "proj-1", "book_text": sample_story_text},
        )

    assert response.status_code == 200
    data = response.json()
    assert "characters" in data
    assert "themes" in data
    assert "key_scenes" in data
    assert len(data["characters"]) > 0
    assert len(data["key_scenes"]) > 0


def test_analyze_returns_error_from_gemini(client, sample_story_text):
    """POST /ai/analyze returns 500 when Gemini returns error."""
    with patch(
        "app.services.story_analyzer.generate_json",
        new_callable=AsyncMock,
        return_value={"error": "Gemini API failed"},
    ):
        response = client.post(
            "/ai/analyze",
            json={"project_id": "proj-1", "book_text": sample_story_text},
        )

    assert response.status_code == 500
    assert "Gemini API failed" in response.json()["detail"]


def test_analyze_ensures_required_fields(client, sample_story_text):
    """POST /ai/analyze ensures key_scenes and characters exist even if Gemini omits them."""
    incomplete_analysis = {
        "summary": "A story about things",
        "themes": ["adventure"],
        "genre": "fantasy",
    }
    with patch(
        "app.services.story_analyzer.generate_json",
        new_callable=AsyncMock,
        return_value=incomplete_analysis,
    ):
        response = client.post(
            "/ai/analyze",
            json={"project_id": "proj-1", "book_text": sample_story_text},
        )

    assert response.status_code == 200
    data = response.json()
    assert "key_scenes" in data
    assert "characters" in data
    assert isinstance(data["key_scenes"], list)
    assert isinstance(data["characters"], list)
