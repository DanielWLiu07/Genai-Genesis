from app.services.tools import TOOL_DEFINITIONS, get_gemini_tools, _convert_property


EXPECTED_TOOL_NAMES = [
    "add_clip",
    "remove_clip",
    "update_clip",
    "reorder_clips",
    "set_transition",
    "regenerate_clip",
]


def test_tool_definitions_has_all_tools():
    """All expected tools are defined in TOOL_DEFINITIONS."""
    defined_names = [t["name"] for t in TOOL_DEFINITIONS]
    for expected in EXPECTED_TOOL_NAMES:
        assert expected in defined_names, f"Missing tool: {expected}"


def test_tool_definitions_valid_structure():
    """Each tool definition has name, description, parameters."""
    for tool in TOOL_DEFINITIONS:
        assert "name" in tool
        assert "description" in tool
        assert "parameters" in tool
        assert "type" in tool["parameters"]
        assert tool["parameters"]["type"] == "object"
        assert "properties" in tool["parameters"]
        assert "required" in tool["parameters"]
        # Required fields must exist in properties
        for req in tool["parameters"]["required"]:
            assert req in tool["parameters"]["properties"], (
                f"Tool '{tool['name']}' requires '{req}' but it's not in properties"
            )


def test_tool_definitions_count():
    """There are exactly 6 tools defined."""
    assert len(TOOL_DEFINITIONS) == 6


def test_add_clip_required_fields():
    """add_clip requires prompt and duration_ms."""
    add_clip = next(t for t in TOOL_DEFINITIONS if t["name"] == "add_clip")
    assert "prompt" in add_clip["parameters"]["required"]
    assert "duration_ms" in add_clip["parameters"]["required"]


def test_remove_clip_required_fields():
    """remove_clip requires clip_id."""
    remove_clip = next(t for t in TOOL_DEFINITIONS if t["name"] == "remove_clip")
    assert "clip_id" in remove_clip["parameters"]["required"]


def test_reorder_clips_has_array_param():
    """reorder_clips has clip_ids as an array parameter."""
    reorder = next(t for t in TOOL_DEFINITIONS if t["name"] == "reorder_clips")
    clip_ids_prop = reorder["parameters"]["properties"]["clip_ids"]
    assert clip_ids_prop["type"] == "array"
    assert "items" in clip_ids_prop


def test_set_transition_has_enum():
    """set_transition has transition_type with enum values."""
    set_trans = next(t for t in TOOL_DEFINITIONS if t["name"] == "set_transition")
    trans_prop = set_trans["parameters"]["properties"]["transition_type"]
    assert "enum" in trans_prop
    assert "fade" in trans_prop["enum"]
    assert "dissolve" in trans_prop["enum"]
    assert "cut" in trans_prop["enum"]


def test_get_gemini_tools_returns_tool_proto():
    """get_gemini_tools() returns a Gemini Tool proto object."""
    import google.generativeai as genai

    tools = get_gemini_tools()
    assert isinstance(tools, genai.protos.Tool)
    assert len(tools.function_declarations) == len(TOOL_DEFINITIONS)


def test_get_gemini_tools_declaration_names():
    """get_gemini_tools() declarations match TOOL_DEFINITIONS names."""
    tools = get_gemini_tools()
    declaration_names = [fd.name for fd in tools.function_declarations]
    for expected in EXPECTED_TOOL_NAMES:
        assert expected in declaration_names
