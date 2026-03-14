"""Tests for AI proxy endpoints. Uses mocked httpx to avoid hitting real AI service."""
from unittest.mock import AsyncMock, patch, MagicMock
import httpx


def _mock_response(status_code=200, json_data=None):
    """Create a mock httpx.Response."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    return resp


def test_analyze_forwards_book_text(client):
    """POST /api/v1/projects/{id}/analyze forwards book_text to AI service."""
    mock_analysis = {"themes": ["ambition"], "characters": [{"name": "Jay Gatsby"}]}
    mock_resp = _mock_response(200, mock_analysis)

    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_resp)
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = instance

        resp = client.post(
            "/api/v1/projects/proj-1/analyze",
            json={"book_text": "Once upon a time..."},
        )
        assert resp.status_code == 200
        assert resp.json() == mock_analysis

        # Verify the call was made to the AI service
        instance.post.assert_called_once()
        call_args = instance.post.call_args
        assert "/ai/analyze" in call_args[0][0]
        assert call_args[1]["json"]["book_text"] == "Once upon a time..."


def test_analyze_missing_book_text(client):
    """POST /api/v1/projects/{id}/analyze with no book_text returns 400."""
    resp = client.post("/api/v1/projects/proj-1/analyze", json={})
    assert resp.status_code == 400
    assert "No book text" in resp.json()["detail"]


def test_plan_trailer_forwards_analysis(client):
    """POST /api/v1/projects/{id}/plan-trailer forwards analysis to AI service."""
    mock_plan = {"clips": [{"id": "c1", "prompt": "sunset"}], "total_duration_ms": 3000}
    mock_resp = _mock_response(200, mock_plan)

    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_resp)
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = instance

        resp = client.post(
            "/api/v1/projects/proj-1/plan-trailer",
            json={"analysis": {"themes": ["love"]}},
        )
        assert resp.status_code == 200
        assert resp.json() == mock_plan

        instance.post.assert_called_once()
        call_args = instance.post.call_args
        assert "/ai/plan-trailer" in call_args[0][0]


def test_plan_trailer_missing_analysis(client):
    """POST /api/v1/projects/{id}/plan-trailer with no analysis returns 400."""
    resp = client.post("/api/v1/projects/proj-1/plan-trailer", json={})
    assert resp.status_code == 400
    assert "No analysis" in resp.json()["detail"]


def test_chat_forwards_message(client):
    """POST /api/v1/projects/{id}/chat forwards message, timeline, history."""
    mock_chat_resp = {
        "role": "assistant",
        "content": "I suggest adding a dramatic opening.",
        "tool_calls": [],
    }
    mock_resp = _mock_response(200, mock_chat_resp)

    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_resp)
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = instance

        resp = client.post(
            "/api/v1/projects/proj-1/chat",
            json={
                "message": "Make it more dramatic",
                "timeline": {"clips": []},
                "history": [{"role": "user", "content": "Hello"}],
            },
        )
        assert resp.status_code == 200
        assert resp.json() == mock_chat_resp

        instance.post.assert_called_once()
        call_args = instance.post.call_args
        assert "/ai/chat" in call_args[0][0]
        payload = call_args[1]["json"]
        assert payload["message"] == "Make it more dramatic"
        assert payload["timeline"] == {"clips": []}
        assert len(payload["history"]) == 1


def test_chat_ai_service_unreachable(client):
    """POST /api/v1/projects/{id}/chat returns fallback when AI service is down."""
    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = instance

        resp = client.post(
            "/api/v1/projects/proj-1/chat",
            json={"message": "Hello"},
        )
        # Chat endpoint returns a fallback response instead of raising
        assert resp.status_code == 200
        data = resp.json()
        assert "not available" in data["content"]
        assert data["tool_calls"] == []


def test_analyze_ai_service_unreachable(client):
    """POST /api/v1/projects/{id}/analyze returns fallback dict when AI service is down."""
    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value = instance

        resp = client.post(
            "/api/v1/projects/proj-1/analyze",
            json={"book_text": "Some text"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ai_service_unavailable"
        assert "port 8001" in data["message"]
