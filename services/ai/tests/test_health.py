from unittest.mock import patch, MagicMock


def test_health_returns_status(client):
    """GET /health returns status and gemini_configured field."""
    mock_settings = MagicMock()
    mock_settings.gemini_api_key = "test-key"
    with patch("app.config.get_settings", return_value=mock_settings):
        response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "healthy"
    assert "gemini_configured" in data


def test_health_gemini_not_configured(client):
    """GET /health shows gemini_configured=False when no key set."""
    mock_settings = MagicMock()
    mock_settings.gemini_api_key = ""
    with patch("app.config.get_settings", return_value=mock_settings):
        response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["gemini_configured"] is False


def test_root_endpoint(client):
    """GET / returns service info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "FrameFlow AI"
    assert data["status"] == "running"
    assert "endpoints" in data
