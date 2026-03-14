"""Tests for timeline CRUD endpoints."""


def test_get_timeline_default(client):
    """GET /api/v1/projects/{id}/timeline returns default timeline in mock mode."""
    resp = client.get("/api/v1/projects/proj-1/timeline")
    assert resp.status_code == 200
    data = resp.json()
    assert data["clips"] == []
    assert data["music_track"] is None
    assert data["total_duration_ms"] == 0
    assert data["settings"]["resolution"] == "1080p"
    assert data["settings"]["aspect_ratio"] == "16:9"
    assert data["settings"]["fps"] == 24


def test_put_timeline(client, sample_timeline):
    """PUT /api/v1/projects/{id}/timeline upserts timeline and returns it."""
    resp = client.put("/api/v1/projects/proj-1/timeline", json=sample_timeline)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["clips"]) == 1
    assert data["clips"][0]["id"] == "clip-001"
    assert data["total_duration_ms"] == 3000


def test_add_clip(client, sample_clip):
    """POST /api/v1/projects/{id}/clips adds a clip and returns the updated timeline."""
    resp = client.post("/api/v1/projects/proj-1/clips", json=sample_clip)
    assert resp.status_code == 200
    data = resp.json()
    # In-memory mode returns the full timeline dict from upsert_timeline_mem
    assert "clips" in data
    assert len(data["clips"]) == 1
    assert data["clips"][0]["id"] == "clip-001"
    assert data["clips"][0]["type"] == "image"
    assert data["clips"][0]["duration_ms"] == 3000


def test_delete_clip(client):
    """DELETE /api/v1/projects/{id}/clips/{clip_id} returns success."""
    resp = client.delete("/api/v1/projects/proj-1/clips/clip-001")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": True}


def test_reorder_clips(client):
    """POST /api/v1/projects/{id}/clips/reorder returns success."""
    resp = client.post(
        "/api/v1/projects/proj-1/clips/reorder",
        json=["clip-002", "clip-001"],
    )
    assert resp.status_code == 200
    assert resp.json() == {"reordered": True}
