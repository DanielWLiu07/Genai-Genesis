"""Tests for the /render/compose and /render/music/suggest endpoints."""
from unittest.mock import AsyncMock, patch


def test_compose_returns_job_id(client, sample_timeline):
    """Test that compose endpoint returns a job_id and queued status."""
    response = client.post("/render/compose", json={
        "project_id": "proj-001",
        "timeline": sample_timeline,
        "title": "My Book Trailer",
        "author": "Test Author",
    })

    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "queued"
    assert data["progress"] == 0
    assert "message" in data


def test_compose_without_timeline(client):
    """Test compose with no timeline still returns a job."""
    response = client.post("/render/compose", json={
        "project_id": "proj-002",
    })

    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "queued"


def test_compose_response_structure(client, sample_timeline):
    """Verify compose response has all required fields."""
    response = client.post("/render/compose", json={
        "project_id": "proj-001",
        "timeline": sample_timeline,
    })

    data = response.json()
    assert "job_id" in data
    assert "status" in data
    assert "progress" in data
    assert "message" in data


def test_get_job_status_not_found(client):
    """Test getting status of a nonexistent job."""
    response = client.get("/render/jobs/nonexistent-id")
    assert response.status_code == 200
    data = response.json()
    assert data["error"] == "Job not found"


def test_get_job_status_after_compose(client, sample_timeline):
    """Test that a created job can be retrieved by its ID."""
    compose_response = client.post("/render/compose", json={
        "project_id": "proj-001",
        "timeline": sample_timeline,
    })
    job_id = compose_response.json()["job_id"]

    response = client.get(f"/render/jobs/{job_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == job_id
    assert data["project_id"] == "proj-001"


def test_music_suggest_endpoint(client):
    """Test the music suggestion endpoint."""
    response = client.post("/render/music/suggest", json={
        "mood": "epic",
        "genre": "",
        "duration_ms": 60000,
    })

    assert response.status_code == 200
    data = response.json()
    assert "tracks" in data
    assert isinstance(data["tracks"], list)
    assert len(data["tracks"]) > 0


def test_music_suggest_with_genre(client):
    """Test music suggestion filtered by genre."""
    response = client.post("/render/music/suggest", json={
        "mood": "",
        "genre": "piano",
        "duration_ms": 0,
    })

    assert response.status_code == 200
    data = response.json()
    assert "tracks" in data
    assert len(data["tracks"]) > 0
    # The first result should match the genre filter
    assert data["tracks"][0]["genre"] == "piano"


def test_music_suggest_empty_filters(client):
    """Test music suggestion with no filters returns results."""
    response = client.post("/render/music/suggest", json={
        "mood": "",
        "genre": "",
        "duration_ms": 0,
    })

    assert response.status_code == 200
    data = response.json()
    assert "tracks" in data
    assert len(data["tracks"]) <= 3
