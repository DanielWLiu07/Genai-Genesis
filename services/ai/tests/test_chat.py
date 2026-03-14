from unittest.mock import patch, MagicMock


def _make_mock_text_response(text):
    """Create a mock Gemini response with text only."""
    part = MagicMock()
    part.function_call = None
    part.text = text
    response = MagicMock()
    response.parts = [part]
    return response


def _make_mock_model(response):
    """Create a mock Gemini model that returns a given response from chat."""
    model = MagicMock()
    chat_session = MagicMock()
    chat_session.send_message.return_value = response
    model.start_chat.return_value = chat_session
    return model


def test_chat_basic_response(client, sample_timeline):
    """POST /ai/chat returns role and content fields."""
    mock_response = _make_mock_text_response("I can help you edit your trailer!")
    mock_model = _make_mock_model(mock_response)

    with patch("app.routers.chat.get_model", return_value=mock_model), \
         patch("app.routers.chat.get_gemini_tools", return_value=MagicMock()):
        response = client.post(
            "/ai/chat",
            json={
                "project_id": "proj-1",
                "message": "Hello, help me with my trailer",
                "timeline": sample_timeline,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "role" in data
    assert data["role"] == "assistant"
    assert "content" in data
    assert len(data["content"]) > 0
    assert "tool_calls" in data


def test_chat_with_tool_calls(client, sample_timeline):
    """POST /ai/chat with tool calls in response."""
    # Create a function call part - use a real dict for args so _convert_proto_value works
    fc_part = MagicMock()
    fc_part.text = None
    fc_call = MagicMock()
    fc_call.name = "add_clip"
    # Use a real dict so .items() returns real values (not MagicMocks)
    real_args = {"prompt": "A dramatic scene", "duration_ms": 3000}
    fc_call.args = real_args
    fc_part.function_call = fc_call

    response1 = MagicMock()
    response1.parts = [fc_part]

    # Followup response after sending function results
    followup = MagicMock()
    followup.text = "I added a new dramatic scene to your trailer."

    model = MagicMock()
    chat_session = MagicMock()
    chat_session.send_message.side_effect = [response1, followup]
    model.start_chat.return_value = chat_session

    with patch("app.routers.chat.get_model", return_value=model), \
         patch("app.routers.chat.get_gemini_tools", return_value=MagicMock()):
        response = client.post(
            "/ai/chat",
            json={
                "project_id": "proj-1",
                "message": "Add a dramatic scene",
                "timeline": sample_timeline,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "assistant"
    assert len(data["tool_calls"]) > 0
    assert data["tool_calls"][0]["tool_name"] == "add_clip"
    assert "content" in data


def test_chat_with_empty_timeline(client):
    """POST /ai/chat with empty timeline still works."""
    mock_response = _make_mock_text_response("Your timeline is empty. Let me help you create one!")
    mock_model = _make_mock_model(mock_response)

    with patch("app.routers.chat.get_model", return_value=mock_model), \
         patch("app.routers.chat.get_gemini_tools", return_value=MagicMock()):
        response = client.post(
            "/ai/chat",
            json={
                "project_id": "proj-1",
                "message": "What should I do?",
                "timeline": None,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "assistant"
    assert "content" in data


def test_chat_with_no_timeline(client):
    """POST /ai/chat without timeline field works."""
    mock_response = _make_mock_text_response("Let's start by creating a timeline.")
    mock_model = _make_mock_model(mock_response)

    with patch("app.routers.chat.get_model", return_value=mock_model), \
         patch("app.routers.chat.get_gemini_tools", return_value=MagicMock()):
        response = client.post(
            "/ai/chat",
            json={
                "project_id": "proj-1",
                "message": "Help me create a trailer",
            },
        )

    assert response.status_code == 200


def test_chat_gemini_not_configured(client):
    """POST /ai/chat when neither Railtracks nor Gemini is configured returns error gracefully."""
    with patch("app.routers.chat.get_model", side_effect=RuntimeError("GEMINI_API_KEY not set in .env")), \
         patch("app.routers.chat.get_gemini_tools", return_value=MagicMock()), \
         patch("app.routers.chat._RAILTRACKS_CHAT", False):
        response = client.post(
            "/ai/chat",
            json={
                "project_id": "proj-1",
                "message": "Hello",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "GEMINI_API_KEY" in data["content"]
    assert data["tool_calls"] == []


def test_chat_with_history(client, sample_timeline):
    """POST /ai/chat with conversation history."""
    mock_response = _make_mock_text_response("Based on our earlier conversation, I'll adjust the pacing.")
    mock_model = _make_mock_model(mock_response)

    with patch("app.routers.chat._RAILTRACKS_CHAT", False), \
         patch("app.routers.chat.get_model", return_value=mock_model), \
         patch("app.routers.chat.get_gemini_tools", return_value=MagicMock()):
        response = client.post(
            "/ai/chat",
            json={
                "project_id": "proj-1",
                "message": "Make it faster",
                "timeline": sample_timeline,
                "history": [
                    {"role": "user", "content": "Create a trailer"},
                    {"role": "assistant", "content": "I created a 3-clip trailer."},
                ],
            },
        )

    assert response.status_code == 200
    # Verify history was passed to the model
    mock_model.start_chat.assert_called_once()
    call_kwargs = mock_model.start_chat.call_args
    history = call_kwargs[1]["history"] if "history" in (call_kwargs[1] or {}) else call_kwargs.kwargs.get("history", [])
    assert len(history) == 2
