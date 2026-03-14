"""Tests for file upload endpoint."""
import io


def test_upload_text_file(client):
    """POST /api/v1/projects/{id}/upload uploads a text file and returns book_text."""
    file_content = b"Call me Ishmael. Some years ago..."
    resp = client.post(
        "/api/v1/projects/proj-1/upload",
        files={"file": ("moby_dick.txt", io.BytesIO(file_content), "text/plain")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["file_name"] == "moby_dick.txt"
    assert data["size"] == len(file_content)
    assert "book_text" in data
    assert data["book_text"] == file_content.decode("utf-8")
    assert "text_preview" in data


def test_upload_no_file(client):
    """POST /api/v1/projects/{id}/upload with no file returns 422."""
    resp = client.post("/api/v1/projects/proj-1/upload")
    assert resp.status_code == 422
