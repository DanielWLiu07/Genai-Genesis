"""Tests for the /render/generate endpoint."""
from unittest.mock import AsyncMock, patch


def test_generate_image_no_api_key(client, sample_clip_data):
    """Test image generation when no Kling API key is configured (default)."""
    mock_result = {
        "status": "error",
        "message": "Kling API key not configured",
    }

    with patch("app.services.kling.generate_image", new_callable=AsyncMock, return_value=mock_result):
        response = client.post("/render/generate", json=sample_clip_data)

    assert response.status_code == 200
    data = response.json()
    assert data["clip_id"] == "clip-001"
    assert "status" in data
    assert "media_url" in data


def test_generate_video_no_api_key(client, sample_video_clip_data):
    """Test video generation when no Kling API key is configured."""
    mock_result = {
        "status": "error",
        "message": "Kling API key not configured",
    }

    with patch("app.services.kling.generate_video", new_callable=AsyncMock, return_value=mock_result):
        response = client.post("/render/generate", json=sample_video_clip_data)

    assert response.status_code == 200
    data = response.json()
    assert data["clip_id"] == "clip-002"
    assert "status" in data
    assert "media_url" in data


def test_generate_image_with_api_key(client, sample_clip_data):
    """Test image generation with API key configured triggers background task."""
    with patch("app.routers.generate.get_settings") as mock_settings:
        mock_settings.return_value.kling_api_key = "test-key"
        mock_settings.return_value.kling_api_secret = "test-secret"
        mock_settings.return_value.api_service_url = "http://localhost:8000"

        response = client.post("/render/generate", json=sample_clip_data)

    assert response.status_code == 200
    data = response.json()
    assert data["clip_id"] == "clip-001"
    assert data["status"] == "generating"
    assert data["message"] == "Generation started in background"


def test_generate_image_success(client, sample_clip_data):
    """Test successful image generation returns media_url."""
    mock_result = {
        "status": "done",
        "url": "https://example.com/generated.png",
        "thumbnail_url": "https://example.com/generated.png",
        "message": "Image generated successfully",
    }

    with patch("app.routers.generate.get_settings") as mock_settings, \
         patch("app.routers.generate.generate_image", new_callable=AsyncMock, return_value=mock_result):
        mock_settings.return_value.kling_api_key = ""
        response = client.post("/render/generate", json=sample_clip_data)

    assert response.status_code == 200
    data = response.json()
    assert data["clip_id"] == "clip-001"
    assert data["status"] == "done"
    assert data["media_url"] == "https://example.com/generated.png"


def test_generate_video_success(client, sample_video_clip_data):
    """Test successful video generation returns media_url."""
    mock_result = {
        "status": "done",
        "url": "https://example.com/generated.mp4",
        "thumbnail_url": "https://example.com/generated.mp4",
        "message": "Video generated successfully",
    }

    with patch("app.routers.generate.get_settings") as mock_settings, \
         patch("app.routers.generate.generate_video", new_callable=AsyncMock, return_value=mock_result):
        mock_settings.return_value.kling_api_key = ""
        response = client.post("/render/generate", json=sample_video_clip_data)

    assert response.status_code == 200
    data = response.json()
    assert data["clip_id"] == "clip-002"
    assert data["status"] == "done"
    assert data["media_url"] == "https://example.com/generated.mp4"


def test_generate_response_fields(client, sample_clip_data):
    """Verify response always contains clip_id, status, and media_url fields."""
    mock_result = {
        "status": "done",
        "url": "https://example.com/img.png",
        "thumbnail_url": "https://example.com/img.png",
        "message": "OK",
    }

    with patch("app.services.kling.generate_image", new_callable=AsyncMock, return_value=mock_result):
        response = client.post("/render/generate", json=sample_clip_data)

    data = response.json()
    assert "clip_id" in data
    assert "status" in data
    assert "media_url" in data
