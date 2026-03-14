from unittest.mock import patch, AsyncMock


def test_plan_no_analysis(client):
    """POST /ai/plan-trailer without analysis returns 400."""
    response = client.post(
        "/ai/plan-trailer",
        json={"project_id": "proj-1"},
    )
    assert response.status_code == 400
    assert "No analysis" in response.json()["detail"]


def test_plan_success(client, sample_analysis):
    """POST /ai/plan-trailer returns clips with required fields."""
    fake_plan = {
        "clips": [
            {
                "id": "clip-1",
                "order": 0,
                "type": "text_overlay",
                "duration_ms": 3000,
                "prompt": "Dark background with title text",
                "text": "The Kingdom Falls",
                "transition_type": "fade",
                "gen_status": "pending",
            },
            {
                "id": "clip-2",
                "order": 1,
                "type": "image",
                "duration_ms": 4000,
                "prompt": "Wide aerial shot of a fantasy kingdom at dawn",
                "text": None,
                "transition_type": "dissolve",
                "gen_status": "pending",
            },
        ],
        "trailer_style": "fantasy",
        "total_duration_ms": 7000,
        "music_mood": "epic",
    }

    with patch(
        "app.services.trailer_planner.generate_json",
        new_callable=AsyncMock,
        return_value=fake_plan,
    ):
        response = client.post(
            "/ai/plan-trailer",
            json={
                "project_id": "proj-1",
                "analysis": sample_analysis,
                "style": "fantasy",
                "pacing": "balanced",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "clips" in data
    assert len(data["clips"]) > 0

    for clip in data["clips"]:
        assert "id" in clip
        assert "order" in clip
        assert "prompt" in clip
        assert "duration_ms" in clip


def test_plan_with_fast_pacing(client, sample_analysis):
    """POST /ai/plan-trailer with fast pacing works."""
    fake_plan = {
        "clips": [
            {
                "id": "c1",
                "order": 0,
                "type": "image",
                "duration_ms": 2000,
                "prompt": "Quick establishing shot",
            }
        ],
        "trailer_style": "fantasy",
        "music_mood": "intense",
    }

    with patch(
        "app.services.trailer_planner.generate_json",
        new_callable=AsyncMock,
        return_value=fake_plan,
    ):
        response = client.post(
            "/ai/plan-trailer",
            json={
                "project_id": "proj-1",
                "analysis": sample_analysis,
                "pacing": "fast",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "clips" in data
    assert "total_duration_ms" in data


def test_plan_with_slow_pacing(client, sample_analysis):
    """POST /ai/plan-trailer with slow pacing works."""
    fake_plan = {
        "clips": [
            {
                "id": "c1",
                "order": 0,
                "type": "image",
                "duration_ms": 5000,
                "prompt": "Slow atmospheric shot",
            }
        ],
        "trailer_style": "literary",
        "music_mood": "mysterious",
    }

    with patch(
        "app.services.trailer_planner.generate_json",
        new_callable=AsyncMock,
        return_value=fake_plan,
    ):
        response = client.post(
            "/ai/plan-trailer",
            json={
                "project_id": "proj-1",
                "analysis": sample_analysis,
                "pacing": "slow",
            },
        )

    assert response.status_code == 200


def test_plan_error_from_gemini(client, sample_analysis):
    """POST /ai/plan-trailer returns 500 when Gemini fails."""
    with patch(
        "app.services.trailer_planner.generate_json",
        new_callable=AsyncMock,
        return_value={"error": "Rate limited"},
    ):
        response = client.post(
            "/ai/plan-trailer",
            json={
                "project_id": "proj-1",
                "analysis": sample_analysis,
            },
        )

    assert response.status_code == 500


def test_plan_clips_get_defaults(client, sample_analysis):
    """POST /ai/plan-trailer fills in missing clip fields with defaults."""
    fake_plan = {
        "clips": [
            {
                "prompt": "A scene with no defaults",
            }
        ],
        "trailer_style": "fantasy",
    }

    with patch(
        "app.services.trailer_planner.generate_json",
        new_callable=AsyncMock,
        return_value=fake_plan,
    ):
        response = client.post(
            "/ai/plan-trailer",
            json={
                "project_id": "proj-1",
                "analysis": sample_analysis,
            },
        )

    assert response.status_code == 200
    clip = response.json()["clips"][0]
    assert "id" in clip and clip["id"]
    assert clip["order"] == 0
    assert clip["gen_status"] == "pending"
    assert clip["type"] == "image"
    assert clip["duration_ms"] == 3000
    assert clip["transition_type"] == "dissolve"
    assert "position" in clip
