"""Tests for health and root endpoints."""


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "FrameFlow Render"
    assert data["status"] == "running"
    assert "version" in data


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "ffmpeg" in data
    assert isinstance(data["ffmpeg"], bool)
