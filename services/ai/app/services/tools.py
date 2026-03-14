"""Tool definitions for the chatbot copilot. These map to timeline mutations."""

TOOL_DEFINITIONS = [
    {
        "name": "add_clip",
        "description": "Add a new clip to the trailer timeline",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Visual prompt for the clip"},
                "duration_ms": {"type": "integer", "description": "Duration in milliseconds"},
                "type": {"type": "string", "enum": ["image", "video", "text_overlay"]},
                "text": {"type": "string", "description": "Optional text overlay"},
                "order": {"type": "integer", "description": "Position in timeline (0-indexed)"},
            },
            "required": ["prompt", "duration_ms"]
        }
    },
    {
        "name": "remove_clip",
        "description": "Remove a clip from the timeline by its ID",
        "parameters": {
            "type": "object",
            "properties": {
                "clip_id": {"type": "string", "description": "ID of the clip to remove"}
            },
            "required": ["clip_id"]
        }
    },
    {
        "name": "update_clip",
        "description": "Update properties of an existing clip",
        "parameters": {
            "type": "object",
            "properties": {
                "clip_id": {"type": "string", "description": "ID of the clip to update"},
                "prompt": {"type": "string", "description": "New visual prompt"},
                "duration_ms": {"type": "integer", "description": "New duration in ms"},
                "text": {"type": "string", "description": "New overlay text"},
                "transition_type": {"type": "string", "enum": ["fade", "dissolve", "wipe", "cut"]},
            },
            "required": ["clip_id"]
        }
    },
    {
        "name": "update_scene_duration",
        "description": "Change the duration of a scene",
        "parameters": {
            "type": "object",
            "properties": {
                "scene_id": {"type": "string", "description": "ID of the scene"},
                "duration_sec": {"type": "number", "description": "New duration in seconds"},
            },
            "required": ["scene_id", "duration_sec"]
        }
    },
    {
        "name": "reorder_clips",
        "description": "Reorder clips in the timeline",
        "parameters": {
            "type": "object",
            "properties": {
                "clip_ids": {"type": "array", "items": {"type": "string"}, "description": "Ordered list of clip IDs"}
            },
            "required": ["clip_ids"]
        }
    },
    {
        "name": "set_transition",
        "description": "Set the transition type between two clips",
        "parameters": {
            "type": "object",
            "properties": {
                "after_clip_id": {"type": "string", "description": "ID of the clip to set transition after"},
                "transition_type": {"type": "string", "enum": ["fade", "dissolve", "wipe", "cut"]},
            },
            "required": ["after_clip_id", "transition_type"]
        }
    },
    {
        "name": "regenerate_clip",
        "description": "Regenerate the visual for a clip with a new or modified prompt",
        "parameters": {
            "type": "object",
            "properties": {
                "clip_id": {"type": "string", "description": "ID of the clip to regenerate"},
                "new_prompt": {"type": "string", "description": "Optional new prompt (uses existing if not provided)"},
            },
            "required": ["clip_id"]
        }
    },
]

# Convert to Gemini function declarations format
def get_gemini_tools():
    return [
        {
            "function_declarations": [
                {
                    "name": tool["name"],
                    "description": tool["description"],
                    "parameters": tool["parameters"],
                }
                for tool in TOOL_DEFINITIONS
            ]
        }
    ]
