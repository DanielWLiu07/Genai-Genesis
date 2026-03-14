"""Tests for project CRUD endpoints."""


def test_create_project(client, sample_project):
    """POST /api/v1/projects creates a project and returns correct fields."""
    resp = client.post("/api/v1/projects", json=sample_project)
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["title"] == sample_project["title"]
    assert data["author"] == sample_project["author"]
    assert data["status"] == "uploading"
    assert "created_at" in data
    assert "updated_at" in data


def test_create_project_missing_title(client):
    """POST /api/v1/projects with missing title returns 422."""
    resp = client.post("/api/v1/projects", json={})
    assert resp.status_code == 422


def test_list_projects_returns_list(client):
    """GET /api/v1/projects returns an empty list in mock mode."""
    resp = client.get("/api/v1/projects")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_project_not_found(client):
    """GET /api/v1/projects/{id} with invalid ID returns 404 in mock mode."""
    resp = client.get("/api/v1/projects/nonexistent-id")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Project not found"


def test_update_project_no_db(client):
    """PATCH /api/v1/projects/{id} returns 404 when project doesn't exist in memory."""
    resp = client.patch(
        "/api/v1/projects/some-id",
        json={"title": "Updated Title"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Project not found"


def test_delete_project(client):
    """DELETE /api/v1/projects/{id} returns success in mock mode."""
    resp = client.delete("/api/v1/projects/some-id")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": True}
