"""Tool definitions for the chatbot copilot. These map to timeline mutations.

The chatbot calls these tools to modify the trailer timeline.
The frontend receives the tool_calls and applies them to the Zustand store.
"""

import google.generativeai as genai

TOOL_DEFINITIONS = [
    {
        "name": "add_clip",
        "description": "Add a new clip to the trailer timeline. Use this when the user wants to add a new scene, shot, or text overlay.",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Detailed cinematic visual prompt for image/video generation. Include camera angle, lighting, mood, and style details.",
                },
                "duration_ms": {
                    "type": "integer",
                    "description": "Duration in milliseconds (typically 2000-5000)",
                },
                "type": {
                    "type": "string",
                    "enum": ["image", "video", "text_overlay"],
                    "description": "Type of clip",
                },
                "text": {
                    "type": "string",
                    "description": "Optional text overlay to display on the clip",
                },
                "order": {
                    "type": "integer",
                    "description": "Position in timeline (0-indexed). If omitted, adds to end.",
                },
            },
            "required": ["prompt", "duration_ms"],
        },
    },
    {
        "name": "remove_clip",
        "description": "Remove a clip from the timeline by its ID. Use when the user wants to delete a scene.",
        "parameters": {
            "type": "object",
            "properties": {
                "clip_id": {
                    "type": "string",
                    "description": "The UUID of the clip to remove",
                },
            },
            "required": ["clip_id"],
        },
    },
    {
        "name": "update_clip",
        "description": "Update properties of an existing clip. Use for changing prompts, durations, text, or transitions on a specific clip.",
        "parameters": {
            "type": "object",
            "properties": {
                "clip_id": {
                    "type": "string",
                    "description": "The UUID of the clip to update",
                },
                "prompt": {
                    "type": "string",
                    "description": "New cinematic visual prompt",
                },
                "duration_ms": {
                    "type": "integer",
                    "description": "New duration in milliseconds",
                },
                "text": {
                    "type": "string",
                    "description": "New overlay text",
                },
                "transition_type": {
                    "type": "string",
                    "enum": ["fade", "dissolve", "wipe", "cut"],
                    "description": "Transition to next clip",
                },
            },
            "required": ["clip_id"],
        },
    },
    {
        "name": "reorder_clips",
        "description": "Reorder clips in the timeline. Provide the full list of clip IDs in the desired order.",
        "parameters": {
            "type": "object",
            "properties": {
                "clip_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Complete ordered list of clip IDs representing the new timeline order",
                },
            },
            "required": ["clip_ids"],
        },
    },
    {
        "name": "set_transition",
        "description": "Set the transition effect after a specific clip.",
        "parameters": {
            "type": "object",
            "properties": {
                "clip_id": {
                    "type": "string",
                    "description": "ID of the clip to set transition on",
                },
                "transition_type": {
                    "type": "string",
                    "enum": ["fade", "dissolve", "wipe", "cut"],
                    "description": "Type of transition effect",
                },
            },
            "required": ["clip_id", "transition_type"],
        },
    },
    {
        "name": "regenerate_clip",
        "description": "Mark a clip for visual regeneration, optionally with a new prompt. Use when the user wants to redo a scene's visuals.",
        "parameters": {
            "type": "object",
            "properties": {
                "clip_id": {
                    "type": "string",
                    "description": "ID of the clip to regenerate",
                },
                "new_prompt": {
                    "type": "string",
                    "description": "Optional new visual prompt. If omitted, regenerates with existing prompt.",
                },
            },
            "required": ["clip_id"],
        },
    },
    {
        "name": "set_music",
        "description": "Set the background music track for the trailer. Use when the user wants to change or add background music.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name/title of the music track",
                },
                "url": {
                    "type": "string",
                    "description": "URL of the music file",
                },
                "duration_ms": {
                    "type": "integer",
                    "description": "Duration of the music track in milliseconds",
                },
                "volume": {
                    "type": "number",
                    "description": "Volume level from 0.0 to 1.0 (default 0.8)",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_settings",
        "description": "Update the render settings for the trailer (resolution, aspect ratio, FPS).",
        "parameters": {
            "type": "object",
            "properties": {
                "resolution": {
                    "type": "string",
                    "enum": ["720p", "1080p", "4k"],
                    "description": "Video resolution",
                },
                "aspect_ratio": {
                    "type": "string",
                    "enum": ["16:9", "9:16", "1:1", "4:3"],
                    "description": "Video aspect ratio",
                },
                "fps": {
                    "type": "integer",
                    "description": "Frames per second (24, 30, or 60)",
                },
            },
        },
    },
    {
        "name": "update_scene_duration",
        "description": "Change the duration of a specific scene/clip. Use when the user wants to make a scene longer or shorter.",
        "parameters": {
            "type": "object",
            "properties": {
                "scene_id": {
                    "type": "string",
                    "description": "The UUID of the clip/scene to update",
                },
                "duration_sec": {
                    "type": "number",
                    "description": "New duration in seconds",
                },
            },
            "required": ["scene_id", "duration_sec"],
        },
    },
]


def get_gemini_tools():
    """Convert tool definitions to Gemini function declarations."""
    declarations = []
    for tool in TOOL_DEFINITIONS:
        declarations.append(
            genai.protos.FunctionDeclaration(
                name=tool["name"],
                description=tool["description"],
                parameters=genai.protos.Schema(
                    type=genai.protos.Type.OBJECT,
                    properties={
                        k: _convert_property(v)
                        for k, v in tool["parameters"]["properties"].items()
                    },
                    required=tool["parameters"].get("required", []),
                ),
            )
        )
    return genai.protos.Tool(function_declarations=declarations)


def _convert_property(prop: dict) -> genai.protos.Schema:
    """Convert a JSON Schema property to Gemini Schema."""
    type_map = {
        "string": genai.protos.Type.STRING,
        "integer": genai.protos.Type.INTEGER,
        "number": genai.protos.Type.NUMBER,
        "boolean": genai.protos.Type.BOOLEAN,
        "array": genai.protos.Type.ARRAY,
        "object": genai.protos.Type.OBJECT,
    }

    schema_type = type_map.get(prop.get("type", "string"), genai.protos.Type.STRING)

    kwargs = {
        "type": schema_type,
        "description": prop.get("description", ""),
    }

    if "enum" in prop:
        kwargs["enum"] = prop["enum"]

    if schema_type == genai.protos.Type.ARRAY and "items" in prop:
        kwargs["items"] = _convert_property(prop["items"])

    return genai.protos.Schema(**kwargs)
