import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def sample_clip_data():
    """Sample clip data for generation requests."""
    return {
        "clip_id": "clip-001",
        "prompt": "A dark forest at night with moonlight filtering through the trees",
        "type": "image",
        "aspect_ratio": "16:9",
        "duration_ms": 3000,
        "negative_prompt": "",
    }


@pytest.fixture
def sample_video_clip_data():
    """Sample video clip data for generation requests."""
    return {
        "clip_id": "clip-002",
        "prompt": "A hero walking through a misty valley",
        "type": "video",
        "aspect_ratio": "16:9",
        "duration_ms": 5000,
        "negative_prompt": "blurry",
    }


@pytest.fixture
def sample_timeline():
    """Sample timeline for composition requests."""
    return {
        "clips": [
            {
                "id": "clip-001",
                "order": 0,
                "type": "image",
                "duration_ms": 3000,
                "prompt": "A dark forest",
                "generated_media_url": "https://example.com/image1.png",
                "gen_status": "done",
                "transition_type": "fade",
                "text": "",
                "position": {"x": 0, "y": 0},
            },
            {
                "id": "clip-002",
                "order": 1,
                "type": "image",
                "duration_ms": 4000,
                "prompt": "A castle in the distance",
                "generated_media_url": "https://example.com/image2.png",
                "gen_status": "done",
                "transition_type": "dissolve",
                "text": "Chapter One",
                "position": {"x": 0, "y": 0},
            },
        ],
        "settings": {
            "resolution": "1080p",
            "aspect_ratio": "16:9",
            "fps": 24,
        },
        "music_track": None,
    }
