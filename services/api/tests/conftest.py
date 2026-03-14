import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.config import get_settings
from app import state as app_state


@pytest.fixture(autouse=True)
def mock_supabase():
    """Patch get_supabase everywhere it's imported to return None (mock mode)."""
    with patch("app.db.get_supabase", return_value=None), \
         patch("app.routers.projects.get_supabase", return_value=None), \
         patch("app.routers.timeline.get_supabase", return_value=None), \
         patch("app.routers.upload.get_supabase", return_value=None), \
         patch("app.routers.ai.get_supabase", return_value=None), \
         patch("app.routers.render.get_supabase", return_value=None):
        yield


@pytest.fixture(autouse=True)
def clear_in_memory_state():
    """Clear in-memory state between tests so they don't leak."""
    app_state._projects.clear()
    app_state._timelines.clear()
    app_state._book_texts.clear()
    yield
    app_state._projects.clear()
    app_state._timelines.clear()
    app_state._book_texts.clear()


@pytest.fixture(autouse=True)
def mock_ws_manager():
    """Mock WebSocket manager broadcast to avoid issues in tests."""
    with patch("app.routers.render.manager") as mock_mgr:
        mock_mgr.broadcast = AsyncMock()
        yield mock_mgr


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Clear the lru_cache on get_settings so env overrides take effect."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_project():
    return {
        "title": "The Great Gatsby",
        "description": "A novel about the Jazz Age",
        "author": "F. Scott Fitzgerald",
    }


@pytest.fixture
def sample_clip():
    return {
        "id": "clip-001",
        "order": 0,
        "type": "image",
        "duration_ms": 3000,
        "prompt": "A mansion on the shore at sunset",
        "text": "In my younger and more vulnerable years...",
        "position": {"x": 0, "y": 100},
    }


@pytest.fixture
def sample_timeline(sample_clip):
    return {
        "clips": [sample_clip],
        "music_track": None,
        "total_duration_ms": 3000,
        "settings": {"resolution": "1080p", "aspect_ratio": "16:9", "fps": 24},
    }
