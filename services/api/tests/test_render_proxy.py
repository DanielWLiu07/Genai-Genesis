"""Tests for render proxy endpoints. Uses mocked httpx to avoid hitting real render service."""
from unittest.mock import AsyncMock, patch, MagicMock
import httpx


def _mock_response(status_code=200, json_data=None):
    """Create a mock httpx.Response."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    return resp


def test_generate_clip_forwards_to_render(client):
    """POST /api/v1/projects/{id}/generate-clip forwards request to render service."""
    mock_result = {"job_id": "job-001", "status": "queued"}
    mock_resp = _mock_response(200, mock_result)

    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_resp)
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = instance

        resp = client.post(
            "/api/v1/projects/proj-1/generate-clip",
            json={
                "clip_id": "clip-001",
                "prompt": "A dark forest at night",
                "type": "image",
            },
        )
        assert resp.status_code == 200
        assert resp.json() == mock_result

        instance.post.assert_called_once()
        call_args = instance.post.call_args
        assert "/render/generate" in call_args[0][0]
        payload = call_args[1]["json"]
        assert payload["clip_id"] == "clip-001"
        assert payload["prompt"] == "A dark forest at night"
        assert payload["aspect_ratio"] == "16:9"


def test_render_trailer_forwards_to_render(client):
    """POST /api/v1/projects/{id}/render forwards to render service."""
    mock_result = {"status": "composing", "output_url": "http://example.com/trailer.mp4"}
    mock_resp = _mock_response(200, mock_result)

    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_resp)
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = instance

        resp = client.post("/api/v1/projects/proj-1/render")
        assert resp.status_code == 200
        data = resp.json()
        # The endpoint returns {**result, "job_id": job_id}
        assert data["status"] == "composing"
        assert "job_id" in data

        instance.post.assert_called_once()
        call_args = instance.post.call_args
        assert "/render/compose" in call_args[0][0]
        payload = call_args[1]["json"]
        assert payload["project_id"] == "proj-1"


def test_generate_clip_render_unreachable(client):
    """POST /api/v1/projects/{id}/generate-clip returns fallback dict when render service is down."""
    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = instance

        resp = client.post(
            "/api/v1/projects/proj-1/generate-clip",
            json={
                "clip_id": "clip-001",
                "prompt": "A forest",
                "type": "image",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "render_service_unavailable"
        assert "port 8002" in data["message"]


def test_render_trailer_render_unreachable(client):
    """POST /api/v1/projects/{id}/render returns fallback dict when render service is down."""
    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = instance

        resp = client.post("/api/v1/projects/proj-1/render")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "render_service_unavailable"
        assert "port 8002" in data["message"]
