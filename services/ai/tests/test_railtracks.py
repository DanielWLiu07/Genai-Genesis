"""
Comprehensive audit tests for the Railtracks integration in MangaMate AI service.

Tests cover:
- Module imports
- ContextVar patterns
- rt.agent_node API usage (bug: llm_model= vs llm=)
- Fallback behaviour when Railtracks fails
- /ai/chat and /ai/pipeline FastAPI endpoints
"""
import asyncio
import sys
import os
from contextvars import ContextVar
from typing import Optional
from unittest.mock import patch, MagicMock, AsyncMock

import pytest


# ---------------------------------------------------------------------------
# 1. Verify railtracks is importable and exposes the expected API surface
# ---------------------------------------------------------------------------

class TestRailtracksAPI:
    """Verify the actual railtracks 1.3.1 API surface."""

    def test_import_railtracks(self):
        import railtracks as rt
        assert rt is not None

    def test_version(self):
        import railtracks as rt
        assert hasattr(rt, "__version__")
        assert rt.__version__ == "1.3.1"

    def test_function_node_exists(self):
        import railtracks as rt
        assert callable(rt.function_node)

    def test_agent_node_exists(self):
        import railtracks as rt
        assert callable(rt.agent_node)

    def test_call_exists(self):
        import railtracks as rt
        assert callable(rt.call)

    def test_session_exists(self):
        import railtracks as rt
        assert rt.Session is not None

    def test_gemini_llm_importable(self):
        from railtracks.llm import GeminiLLM, SystemMessage
        assert GeminiLLM is not None
        assert SystemMessage is not None

    def test_agent_node_correct_param_name_is_llm(self):
        """
        BUG CONFIRMATION: The codebase uses llm_model= but the real API uses llm=.
        This test documents the CORRECT signature.
        """
        import railtracks as rt
        import inspect
        sig = inspect.signature(rt.agent_node)
        params = list(sig.parameters.keys())
        assert "llm" in params, f"Expected 'llm' in agent_node params, got: {params}"
        assert "llm_model" not in params, (
            "agent_node has no 'llm_model' parameter — code uses wrong kwarg name!"
        )

    def test_agent_node_rejects_llm_model_kwarg(self):
        """Confirm agent_node raises TypeError for llm_model=."""
        import railtracks as rt
        from railtracks.llm import GeminiLLM, SystemMessage
        with pytest.raises(TypeError, match="unexpected keyword argument 'llm_model'"):
            rt.agent_node(
                name="bad_agent",
                tool_nodes=set(),
                llm_model=GeminiLLM("gemini-2.5-flash"),  # WRONG kwarg
                system_message=SystemMessage("test"),
                max_tool_calls=5,
            )

    def test_agent_node_accepts_llm_kwarg(self):
        """Confirm agent_node works with correct llm= kwarg."""
        import railtracks as rt
        from railtracks.llm import GeminiLLM, SystemMessage
        agent = rt.agent_node(
            name="good_agent",
            tool_nodes=set(),
            llm=GeminiLLM("gemini-2.5-flash"),  # CORRECT kwarg
            system_message=SystemMessage("test"),
            max_tool_calls=5,
        )
        assert agent is not None

    def test_function_node_decorator(self):
        """function_node can decorate an async function."""
        import railtracks as rt

        @rt.function_node
        async def my_tool(x: str) -> str:
            """A test tool."""
            return x

        # After decoration, the function is still callable
        assert callable(my_tool)

    def test_session_context_manager(self):
        """rt.Session() works as a context manager."""
        import railtracks as rt
        with rt.Session() as sess:
            assert sess is not None

    def test_response_has_text_property(self):
        """StringResponse (returned by ToolCallLLM) has .text property."""
        from railtracks.built_nodes.concrete.response import StringResponse
        import inspect
        # Verify StringResponse has a .text property without instantiating
        # (MessageHistory constructor signature varies across versions)
        assert hasattr(StringResponse, "text") or "text" in dir(StringResponse)
        # Check the source confirms it returns content as text
        src = inspect.getsource(StringResponse)
        assert "def text" in src or "@property" in src


# ---------------------------------------------------------------------------
# 2. Test the ContextVar pattern used by run_copilot and run_pipeline
# ---------------------------------------------------------------------------

class TestContextVarPattern:
    """Test the asyncio-safe per-request ContextVar pattern."""

    def test_contextvar_default_is_none(self):
        ctx: ContextVar[Optional[list]] = ContextVar("test_ctx", default=None)
        assert ctx.get() is None

    def test_contextvar_set_and_reset(self):
        ctx: ContextVar[Optional[list]] = ContextVar("test_ctx2", default=None)
        data = []
        token = ctx.set(data)
        assert ctx.get() is data
        ctx.reset(token)
        assert ctx.get() is None

    def test_contextvar_isolation_across_tasks(self):
        """Verify that two concurrent async tasks have independent ContextVar state."""
        ctx: ContextVar[Optional[list]] = ContextVar("test_ctx3", default=None)

        results = {}

        async def task_a():
            a_list = ["a"]
            token = ctx.set(a_list)
            await asyncio.sleep(0)  # yield to let task_b run
            results["a"] = ctx.get()
            ctx.reset(token)

        async def task_b():
            b_list = ["b"]
            token = ctx.set(b_list)
            await asyncio.sleep(0)
            results["b"] = ctx.get()
            ctx.reset(token)

        async def runner():
            await asyncio.gather(task_a(), task_b())

        asyncio.run(runner())
        assert results["a"] == ["a"]
        assert results["b"] == ["b"]

    def test_contextvar_reset_on_exception(self):
        """ContextVar is reset even if an exception is raised."""
        ctx: ContextVar[Optional[list]] = ContextVar("test_ctx4", default=None)
        data = []
        token = ctx.set(data)
        try:
            raise ValueError("test error")
        except ValueError:
            pass
        finally:
            ctx.reset(token)
        assert ctx.get() is None

    def test_record_function_appends_to_ctx(self):
        """_record in copilot.py appends to the ContextVar list."""
        from contextvars import ContextVar
        _ctx: ContextVar[Optional[list]] = ContextVar("_test_record", default=None)

        def _record(tool_name, **kwargs):
            calls = _ctx.get()
            if calls is not None:
                calls.append({"tool_name": tool_name, "arguments": {k: v for k, v in kwargs.items() if v is not None}})

        calls = []
        token = _ctx.set(calls)
        _record("add_clip", prompt="test", duration_ms=3000)
        _record("set_bpm", bpm=120)
        _ctx.reset(token)

        assert len(calls) == 2
        assert calls[0]["tool_name"] == "add_clip"
        assert calls[0]["arguments"]["prompt"] == "test"
        assert calls[1]["tool_name"] == "set_bpm"


# ---------------------------------------------------------------------------
# 3. Test agent module imports and fallback behaviour
# ---------------------------------------------------------------------------

class TestAgentModuleImports:
    """Test that agent modules degrade gracefully when Railtracks init fails."""

    def test_copilot_module_importable(self):
        """app.agents.copilot is importable without crash."""
        from app.agents import copilot
        assert hasattr(copilot, "run_copilot")

    def test_pipeline_module_importable(self):
        """app.agents.pipeline is importable without crash."""
        from app.agents import pipeline
        assert hasattr(pipeline, "run_pipeline")

    def test_run_copilot_is_async(self):
        """run_copilot is a coroutine function."""
        from app.agents.copilot import run_copilot
        assert asyncio.iscoroutinefunction(run_copilot)

    def test_run_pipeline_is_async(self):
        """run_pipeline is a coroutine function."""
        from app.agents.pipeline import run_pipeline
        assert asyncio.iscoroutinefunction(run_pipeline)

    def test_copilot_agent_is_initialised(self):
        """CopilotAgent is not None — llm= kwarg is correct."""
        from app.agents.copilot import CopilotAgent, _RAILTRACKS_AVAILABLE
        assert _RAILTRACKS_AVAILABLE is True
        assert CopilotAgent is not None

    def test_pipeline_agent_is_initialised(self):
        """TrailerPipelineAgent is not None — llm= kwarg is correct."""
        from app.agents.pipeline import TrailerPipelineAgent, _RAILTRACKS_AVAILABLE
        assert _RAILTRACKS_AVAILABLE is True
        assert TrailerPipelineAgent is not None

    def test_run_copilot_raises_when_agent_forced_none(self):
        """run_copilot raises RuntimeError when CopilotAgent is manually set to None."""
        import app.agents.copilot as copilot_mod

        original = copilot_mod.CopilotAgent
        copilot_mod.CopilotAgent = None
        try:
            async def _run():
                with pytest.raises(RuntimeError, match="Railtracks not available"):
                    await copilot_mod.run_copilot("test prompt")
            asyncio.run(_run())
        finally:
            copilot_mod.CopilotAgent = original

    def test_run_pipeline_raises_when_agent_forced_none(self):
        """run_pipeline raises RuntimeError when TrailerPipelineAgent is manually set to None."""
        import app.agents.pipeline as pipeline_mod

        original = pipeline_mod.TrailerPipelineAgent
        pipeline_mod.TrailerPipelineAgent = None
        try:
            async def _run():
                with pytest.raises(RuntimeError, match="Railtracks pipeline not available"):
                    await pipeline_mod.run_pipeline("test book text")
            asyncio.run(_run())
        finally:
            pipeline_mod.TrailerPipelineAgent = original


# ---------------------------------------------------------------------------
# 4. Test the fallback behaviour in the routers
# ---------------------------------------------------------------------------

class TestChatRouterFallback:
    """Test that /ai/chat falls back to direct Gemini when Railtracks is unavailable."""

    def test_railtracks_chat_flag_is_true(self):
        """_RAILTRACKS_CHAT is True (the import succeeded, even though CopilotAgent is None)."""
        from app.routers import chat as chat_mod
        # The import of run_copilot itself succeeds; _RAILTRACKS_CHAT=True
        # But calling run_copilot() raises RuntimeError which triggers fallback
        assert chat_mod._RAILTRACKS_CHAT is True

    def test_chat_falls_back_when_run_copilot_raises(self, client):
        """
        When run_copilot raises RuntimeError (because CopilotAgent is None),
        /ai/chat falls back to direct Gemini.
        """
        mock_response = MagicMock()
        part = MagicMock()
        part.function_call = None
        part.text = "Fallback Gemini response"
        mock_response.parts = [part]

        mock_model = MagicMock()
        mock_session = MagicMock()
        mock_session.send_message.return_value = mock_response
        mock_model.start_chat.return_value = mock_session

        with patch("app.routers.chat.get_model", return_value=mock_model), \
             patch("app.routers.chat.get_gemini_tools", return_value=MagicMock()):
            response = client.post(
                "/ai/chat",
                json={
                    "project_id": "test-123",
                    "message": "Add a dramatic scene",
                    "timeline": {"clips": []},
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "assistant"
        assert "content" in data
        assert "tool_calls" in data

    def test_chat_fallback_content_is_from_gemini(self, client):
        """Fallback response content comes from direct Gemini call when Railtracks disabled."""
        expected_text = "Here is what I suggest for your trailer."

        mock_response = MagicMock()
        part = MagicMock()
        part.function_call = None
        part.text = expected_text
        mock_response.parts = [part]

        mock_model = MagicMock()
        mock_session = MagicMock()
        mock_session.send_message.return_value = mock_response
        mock_model.start_chat.return_value = mock_session

        with patch("app.routers.chat._RAILTRACKS_CHAT", False), \
             patch("app.routers.chat.get_model", return_value=mock_model), \
             patch("app.routers.chat.get_gemini_tools", return_value=MagicMock()):
            response = client.post(
                "/ai/chat",
                json={"project_id": "p1", "message": "Help me"},
            )

        assert response.status_code == 200
        assert response.json()["content"] == expected_text


class TestPipelineRouterFallback:
    """Test /ai/pipeline endpoint with Railtracks unavailable → fallback path."""

    def test_pipeline_short_book_text_rejected(self, client):
        """POST /ai/pipeline with very short book_text returns 400."""
        response = client.post(
            "/ai/pipeline",
            json={"project_id": "p1", "book_text": "short"},
        )
        assert response.status_code == 400
        assert "book_text" in response.json()["detail"]

    def test_pipeline_falls_back_when_railtracks_unavailable(self, client):
        """
        When _RAILTRACKS_PIPELINE is False, pipeline endpoint falls back to
        sequential direct calls: analyze_story → plan_trailer → get_suggestions.
        """
        fake_analysis = {
            "summary": "A hero saves the world",
            "themes": ["courage"],
            "genre": "fantasy",
            "mood": "epic",
            "style": "book",
            "characters": [{"name": "Hero", "role": "protagonist", "description": "brave"}],
            "key_scenes": [{"title": "Battle", "description": "Big fight", "scene_type": "climax", "importance": 9, "visual_description": "Epic wide shot"}],
        }
        fake_plan = {
            "clips": [
                {"id": "c1", "order": 0, "type": "image", "duration_ms": 3000, "prompt": "Epic opening"},
                {"id": "c2", "order": 1, "type": "text_overlay", "duration_ms": 2000, "prompt": "", "text": "Coming Soon"},
            ],
            "trailer_style": "fantasy",
            "total_duration_ms": 5000,
            "music_mood": "epic",
        }
        fake_quality = {
            "score": 7,
            "overall": "Good trailer with room for improvement.",
            "suggestions": [{"type": "pacing", "priority": "medium", "description": "Add more clips"}],
        }

        with patch("app.routers.plan._RAILTRACKS_PIPELINE", False), \
             patch("app.services.story_analyzer.generate_json", new_callable=AsyncMock, return_value=fake_analysis), \
             patch("app.services.trailer_planner.generate_json", new_callable=AsyncMock, return_value=fake_plan), \
             patch("app.services.suggestions.generate_json", new_callable=AsyncMock, return_value=fake_quality):
            response = client.post(
                "/ai/pipeline",
                json={
                    "project_id": "p1",
                    "book_text": "Once upon a time in a kingdom far away a hero arose to battle the dark forces that threatened all life.",
                    "style": "fantasy",
                    "pacing": "balanced",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "analysis" in data
        assert "plan" in data
        assert "quality" in data
        assert data["powered_by"] == "fallback"

    def test_pipeline_fallback_has_correct_structure(self, client):
        """Fallback pipeline response has expected keys."""
        fake_analysis = {
            "summary": "Test story",
            "themes": ["adventure"],
            "genre": "fantasy",
            "mood": "epic",
            "style": "book",
            "characters": [],
            "key_scenes": [],
        }
        fake_plan = {
            "clips": [{"id": "c1", "order": 0, "type": "image", "duration_ms": 3000, "prompt": "test"}],
            "trailer_style": "fantasy",
        }
        fake_quality = {"score": 5, "overall": "OK", "suggestions": []}

        with patch("app.routers.plan._RAILTRACKS_PIPELINE", False), \
             patch("app.services.story_analyzer.generate_json", new_callable=AsyncMock, return_value=fake_analysis), \
             patch("app.services.trailer_planner.generate_json", new_callable=AsyncMock, return_value=fake_plan), \
             patch("app.services.suggestions.generate_json", new_callable=AsyncMock, return_value=fake_quality):
            response = client.post(
                "/ai/pipeline",
                json={
                    "project_id": "p1",
                    "book_text": "A sufficiently long story text that exceeds the minimum requirement for processing.",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert set(data.keys()) >= {"analysis", "plan", "quality", "powered_by"}
        assert data["powered_by"] == "fallback"
        assert isinstance(data["plan"]["clips"], list)
        assert len(data["plan"]["clips"]) > 0

    def test_pipeline_railtracks_path_when_agent_works(self, client):
        """
        When run_pipeline returns a valid result (mock), the endpoint returns
        powered_by=railtracks.
        """
        fake_result = {
            "analysis": {"summary": "A story", "genre": "fantasy", "mood": "epic",
                         "characters": [], "key_scenes": [], "themes": []},
            "plan": {"clips": [{"id": "c1", "order": 0, "type": "image", "duration_ms": 3000, "prompt": "x"}],
                     "total_duration_ms": 3000, "trailer_style": "fantasy"},
            "quality": {"score": 8, "overall": "Great", "suggestions": []},
            "agent_summary": '{"status": "complete"}',
        }
        with patch("app.routers.plan._RAILTRACKS_PIPELINE", True), \
             patch("app.routers.plan._rt_run_pipeline", new_callable=AsyncMock, return_value=fake_result):
            response = client.post(
                "/ai/pipeline",
                json={
                    "project_id": "p1",
                    "book_text": "A long story about heroes and villains and their epic adventures in the realm.",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["powered_by"] == "railtracks"
        assert data["analysis"]["genre"] == "fantasy"
        assert len(data["plan"]["clips"]) == 1

    def test_pipeline_railtracks_falls_back_on_exception(self, client):
        """When run_pipeline raises, pipeline endpoint falls back to direct calls."""
        fake_analysis = {
            "summary": "Test", "themes": [], "genre": "fantasy", "mood": "epic",
            "style": "book", "characters": [], "key_scenes": [],
        }
        fake_plan = {
            "clips": [{"id": "c1", "order": 0, "type": "image", "duration_ms": 3000, "prompt": "x"}],
            "trailer_style": "fantasy",
        }
        fake_quality = {"score": 6, "overall": "OK", "suggestions": []}

        with patch("app.routers.plan._RAILTRACKS_PIPELINE", True), \
             patch("app.routers.plan._rt_run_pipeline", new_callable=AsyncMock,
                   side_effect=RuntimeError("Railtracks pipeline crashed")), \
             patch("app.services.story_analyzer.generate_json", new_callable=AsyncMock, return_value=fake_analysis), \
             patch("app.services.trailer_planner.generate_json", new_callable=AsyncMock, return_value=fake_plan), \
             patch("app.services.suggestions.generate_json", new_callable=AsyncMock, return_value=fake_quality):
            response = client.post(
                "/ai/pipeline",
                json={
                    "project_id": "p1",
                    "book_text": "Once in a land far away there lived a brave hero who would change the world.",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["powered_by"] == "fallback"


# ---------------------------------------------------------------------------
# 5. Test run_copilot ContextVar is properly isolated (mock railtracks)
# ---------------------------------------------------------------------------

class TestCopilotContextVarIsolation:
    """Test the ContextVar reset logic in run_copilot."""

    def test_copilot_ctx_reset_on_success(self):
        """After run_copilot completes, _copilot_ctx is reset to None."""
        import app.agents.copilot as copilot_mod

        original_avail = copilot_mod._RAILTRACKS_AVAILABLE
        original_agent = copilot_mod.CopilotAgent

        mock_response = MagicMock()
        mock_response.text = "Done!"

        class FakeSession:
            def __enter__(self): return self
            def __exit__(self, *args): return False

        async def _run():
            copilot_mod._RAILTRACKS_AVAILABLE = True
            copilot_mod.CopilotAgent = object()
            try:
                # Patch railtracks.interaction._call.call (what rt.call resolves to)
                # AND patch railtracks._session.Session
                with patch("railtracks.Session", return_value=FakeSession()), \
                     patch("railtracks.call", new_callable=AsyncMock, return_value=mock_response):
                    result_text, tool_calls = await copilot_mod.run_copilot("test prompt")
                    assert result_text == "Done!"
                    assert isinstance(tool_calls, list)
            finally:
                copilot_mod._RAILTRACKS_AVAILABLE = original_avail
                copilot_mod.CopilotAgent = original_agent

        asyncio.run(_run())
        assert copilot_mod._copilot_ctx.get() is None

    def test_copilot_ctx_reset_on_exception(self):
        """Even when rt.call raises, _copilot_ctx is reset."""
        import app.agents.copilot as copilot_mod

        original_avail = copilot_mod._RAILTRACKS_AVAILABLE
        original_agent = copilot_mod.CopilotAgent

        class FakeSession:
            def __enter__(self): return self
            def __exit__(self, *args): return False

        async def _run():
            copilot_mod._RAILTRACKS_AVAILABLE = True
            copilot_mod.CopilotAgent = object()
            try:
                with patch("railtracks.Session", return_value=FakeSession()), \
                     patch("railtracks.call", new_callable=AsyncMock,
                           side_effect=RuntimeError("LLM error")):
                    with pytest.raises(RuntimeError, match="LLM error"):
                        await copilot_mod.run_copilot("test prompt")
            finally:
                copilot_mod._RAILTRACKS_AVAILABLE = original_avail
                copilot_mod.CopilotAgent = original_agent

        asyncio.run(_run())
        assert copilot_mod._copilot_ctx.get() is None

    def test_copilot_ctx_set_during_execution(self):
        """_copilot_ctx is a list (not None) while run_copilot executes."""
        import app.agents.copilot as copilot_mod

        original_avail = copilot_mod._RAILTRACKS_AVAILABLE
        original_agent = copilot_mod.CopilotAgent

        ctx_value_during_call = []

        class FakeSession:
            def __enter__(self): return self
            def __exit__(self, *args): return False

        async def fake_call(agent, prompt):
            ctx_value_during_call.append(copilot_mod._copilot_ctx.get())
            mock_resp = MagicMock()
            mock_resp.text = "result"
            return mock_resp

        async def _run():
            copilot_mod._RAILTRACKS_AVAILABLE = True
            copilot_mod.CopilotAgent = object()
            try:
                with patch("railtracks.Session", return_value=FakeSession()), \
                     patch("railtracks.call", side_effect=fake_call):
                    await copilot_mod.run_copilot("test")
            finally:
                copilot_mod._RAILTRACKS_AVAILABLE = original_avail
                copilot_mod.CopilotAgent = original_agent

        asyncio.run(_run())
        assert len(ctx_value_during_call) == 1
        assert isinstance(ctx_value_during_call[0], list)
        assert copilot_mod._copilot_ctx.get() is None


# ---------------------------------------------------------------------------
# 6. Test run_pipeline ContextVar isolation (mock railtracks)
# ---------------------------------------------------------------------------

class TestPipelineContextVarIsolation:
    """Test the ContextVar reset logic in run_pipeline."""

    def test_pipeline_ctx_reset_on_success(self):
        """After run_pipeline completes, _pipeline_ctx is reset to None."""
        import app.agents.pipeline as pipeline_mod

        original_avail = pipeline_mod._RAILTRACKS_AVAILABLE
        original_agent = pipeline_mod.TrailerPipelineAgent

        mock_response = MagicMock()
        mock_response.text = '{"status": "complete"}'

        class FakeSession:
            def __enter__(self): return self
            def __exit__(self, *args): return False

        async def _run():
            pipeline_mod._RAILTRACKS_AVAILABLE = True
            pipeline_mod.TrailerPipelineAgent = object()
            try:
                with patch("railtracks.Session", return_value=FakeSession()), \
                     patch("railtracks.call", new_callable=AsyncMock, return_value=mock_response):
                    result = await pipeline_mod.run_pipeline("A long book text about adventure.")
                    assert "analysis" in result
                    assert "plan" in result
                    assert "quality" in result
                    assert "agent_summary" in result
            finally:
                pipeline_mod._RAILTRACKS_AVAILABLE = original_avail
                pipeline_mod.TrailerPipelineAgent = original_agent

        asyncio.run(_run())
        assert pipeline_mod._pipeline_ctx.get() is None

    def test_pipeline_ctx_reset_on_exception(self):
        """Even when rt.call raises, _pipeline_ctx is reset."""
        import app.agents.pipeline as pipeline_mod

        original_avail = pipeline_mod._RAILTRACKS_AVAILABLE
        original_agent = pipeline_mod.TrailerPipelineAgent

        class FakeSession:
            def __enter__(self): return self
            def __exit__(self, *args): return False

        async def _run():
            pipeline_mod._RAILTRACKS_AVAILABLE = True
            pipeline_mod.TrailerPipelineAgent = object()
            try:
                with patch("railtracks.Session", return_value=FakeSession()), \
                     patch("railtracks.call", new_callable=AsyncMock,
                           side_effect=RuntimeError("pipeline crash")):
                    with pytest.raises(RuntimeError, match="pipeline crash"):
                        await pipeline_mod.run_pipeline("A long book text about adventure.")
            finally:
                pipeline_mod._RAILTRACKS_AVAILABLE = original_avail
                pipeline_mod.TrailerPipelineAgent = original_agent

        asyncio.run(_run())
        assert pipeline_mod._pipeline_ctx.get() is None

    def test_pipeline_ctx_set_during_execution(self):
        """_pipeline_ctx is a dict (not None) while run_pipeline executes."""
        import app.agents.pipeline as pipeline_mod

        original_avail = pipeline_mod._RAILTRACKS_AVAILABLE
        original_agent = pipeline_mod.TrailerPipelineAgent

        ctx_value_during_call = []

        class FakeSession:
            def __enter__(self): return self
            def __exit__(self, *args): return False

        async def fake_call(agent, prompt):
            ctx_value_during_call.append(pipeline_mod._pipeline_ctx.get())
            mock_resp = MagicMock()
            mock_resp.text = '{"status": "complete"}'
            return mock_resp

        async def _run():
            pipeline_mod._RAILTRACKS_AVAILABLE = True
            pipeline_mod.TrailerPipelineAgent = object()
            try:
                with patch("railtracks.Session", return_value=FakeSession()), \
                     patch("railtracks.call", side_effect=fake_call):
                    await pipeline_mod.run_pipeline("A long story text.")
            finally:
                pipeline_mod._RAILTRACKS_AVAILABLE = original_avail
                pipeline_mod.TrailerPipelineAgent = original_agent

        asyncio.run(_run())
        assert len(ctx_value_during_call) == 1
        assert isinstance(ctx_value_during_call[0], dict)
        assert pipeline_mod._pipeline_ctx.get() is None


# ---------------------------------------------------------------------------
# 7. Test the specific bug: llm_model vs llm
# ---------------------------------------------------------------------------

class TestLlmModelBug:
    """
    Verify the llm_model= bug is FIXED: both agent files now use llm= (correct).
    """

    def test_copilot_uses_correct_kwarg_llm(self):
        """Confirm copilot.py uses llm= (not llm_model=) for rt.agent_node."""
        src_path = os.path.join(
            os.path.dirname(__file__), "..", "app", "agents", "copilot.py"
        )
        with open(src_path) as f:
            source = f.read()
        assert "llm=GeminiLLM" in source, "copilot.py should use llm= kwarg"
        assert "llm_model=GeminiLLM" not in source, "copilot.py must not use llm_model= kwarg"

    def test_pipeline_uses_correct_kwarg_llm(self):
        """Confirm pipeline.py uses llm= (not llm_model=) for rt.agent_node."""
        src_path = os.path.join(
            os.path.dirname(__file__), "..", "app", "agents", "pipeline.py"
        )
        with open(src_path) as f:
            source = f.read()
        assert "llm=GeminiLLM" in source, "pipeline.py should use llm= kwarg"
        assert "llm_model=GeminiLLM" not in source, "pipeline.py must not use llm_model= kwarg"

    def test_fix_would_make_agent_non_none(self):
        """If we use llm= instead of llm_model=, CopilotAgent would be created."""
        import railtracks as rt
        from railtracks.llm import GeminiLLM, SystemMessage

        @rt.function_node
        async def test_add_clip(prompt: str, duration_ms: int = 3000) -> str:
            """Add a clip."""
            return f"Added clip: {prompt}"

        # Using the CORRECT kwarg (llm=) should succeed
        agent = rt.agent_node(
            name="MangaMate Copilot Fixed",
            tool_nodes={test_add_clip},
            llm=GeminiLLM("gemini-2.5-flash"),  # CORRECT
            system_message=SystemMessage("You are an editor."),
            max_tool_calls=5,
        )
        assert agent is not None, "With llm= kwarg, agent_node should return a valid class"
