"""Style presets for trailer generation.

Each preset modifies how the AI generates visual prompts and structures the trailer.
Users can select a preset or the system auto-detects from genre.
"""

PRESETS = {
    "cinematic": {
        "name": "Cinematic",
        "description": "Classic Hollywood trailer style with dramatic lighting and sweeping shots",
        "visual_style": "photorealistic cinematic, dramatic lighting, anamorphic lens flare, film grain, color graded, 4K",
        "pacing": "balanced",
        "transitions": ["dissolve", "fade", "cut"],
        "music_mood": "epic",
        "text_style": {
            "font_size": 42,
            "color": "#ffffff",
            "position": "bottom",
            "animation": "fade_in",
        },
    },
    "manga": {
        "name": "Manga / Anime",
        "description": "Japanese manga and anime inspired visual style",
        "visual_style": "anime art style, cel shading, vibrant colors, dynamic composition, manga panel aesthetic, detailed linework, Studio Ghibli meets Makoto Shinkai",
        "pacing": "fast",
        "transitions": ["cut", "wipe", "dissolve"],
        "music_mood": "intense",
        "text_style": {
            "font_size": 36,
            "color": "#ffffff",
            "position": "center",
            "animation": "slide_up",
        },
    },
    "noir": {
        "name": "Noir / Mystery",
        "description": "Dark, moody noir style with high contrast and shadows",
        "visual_style": "film noir, high contrast black and white with selective color, venetian blind shadows, wet streets reflecting neon, cigarette smoke, gritty texture",
        "pacing": "slow",
        "transitions": ["dissolve", "fade"],
        "music_mood": "dark",
        "text_style": {
            "font_size": 36,
            "color": "#ff4444",
            "position": "bottom",
            "animation": "typewriter",
        },
    },
    "horror": {
        "name": "Horror",
        "description": "Unsettling horror trailer with jump-scare pacing",
        "visual_style": "horror cinematography, desaturated with sickly green tint, dutch angles, flickering light, deep shadows, fog and mist, found footage grain",
        "pacing": "slow",  # slow build with sudden fast cuts
        "transitions": ["cut", "fade"],
        "music_mood": "scary",
        "text_style": {
            "font_size": 48,
            "color": "#cc0000",
            "position": "center",
            "animation": "fade_in",
        },
    },
    "romance": {
        "name": "Romance",
        "description": "Warm, dreamy romance trailer with soft lighting",
        "visual_style": "romantic cinematography, warm golden hour lighting, soft focus bokeh, lens flare, pastel color palette, intimate framing, shallow depth of field",
        "pacing": "slow",
        "transitions": ["dissolve", "fade"],
        "music_mood": "romantic",
        "text_style": {
            "font_size": 36,
            "color": "#ffddee",
            "position": "bottom",
            "animation": "fade_in",
        },
    },
    "fantasy": {
        "name": "Epic Fantasy",
        "description": "Grand fantasy epic with sweeping landscapes and magical elements",
        "visual_style": "epic fantasy, sweeping aerial landscapes, magical particle effects, ethereal glow, rich saturated colors, medieval architecture, volumetric lighting, Lord of the Rings meets Game of Thrones cinematography",
        "pacing": "balanced",
        "transitions": ["dissolve", "wipe", "fade"],
        "music_mood": "epic",
        "text_style": {
            "font_size": 44,
            "color": "#ffd700",
            "position": "center",
            "animation": "fade_in",
        },
    },
    "scifi": {
        "name": "Sci-Fi",
        "description": "Futuristic sci-fi with neon lighting and tech aesthetics",
        "visual_style": "science fiction, neon accent lighting, holographic displays, clean geometric architecture, deep space vistas, cyberpunk cityscapes, Blade Runner meets Interstellar cinematography",
        "pacing": "balanced",
        "transitions": ["cut", "dissolve", "wipe"],
        "music_mood": "intense",
        "text_style": {
            "font_size": 38,
            "color": "#00ffff",
            "position": "bottom",
            "animation": "typewriter",
        },
    },
    "comic": {
        "name": "Comic Book",
        "description": "Bold comic book style with pop art influences",
        "visual_style": "comic book art style, bold outlines, halftone dots, pop art colors, dynamic action poses, speech bubbles, Ben-Day dots, Marvel/DC comic panel aesthetic",
        "pacing": "fast",
        "transitions": ["cut", "wipe"],
        "music_mood": "intense",
        "text_style": {
            "font_size": 40,
            "color": "#ffff00",
            "position": "center",
            "animation": "slide_up",
        },
    },
    "literary": {
        "name": "Literary Fiction",
        "description": "Subtle, artistic style for literary and contemporary fiction",
        "visual_style": "art house cinematography, natural lighting, muted earth tones, contemplative framing, negative space, documentary-style handheld, A24 film aesthetic",
        "pacing": "slow",
        "transitions": ["dissolve", "fade"],
        "music_mood": "mysterious",
        "text_style": {
            "font_size": 32,
            "color": "#e0d5c0",
            "position": "bottom",
            "animation": "fade_in",
        },
    },
    "childrens": {
        "name": "Children's Book",
        "description": "Colorful, whimsical style for children's stories",
        "visual_style": "children's book illustration, watercolor texture, bright cheerful colors, whimsical characters, storybook framing, Pixar meets Studio Ghibli, soft rounded shapes",
        "pacing": "balanced",
        "transitions": ["dissolve", "wipe"],
        "music_mood": "whimsical",
        "text_style": {
            "font_size": 44,
            "color": "#ffffff",
            "position": "bottom",
            "animation": "slide_up",
        },
    },
}


def get_preset(style: str) -> dict:
    """Get a style preset by name. Returns cinematic as default."""
    return PRESETS.get(style, PRESETS["cinematic"])


def get_all_presets() -> dict:
    """Get all available presets with names and descriptions."""
    return {
        key: {"name": p["name"], "description": p["description"]}
        for key, p in PRESETS.items()
    }


def auto_detect_preset(genre: str, style: str = "book") -> str:
    """Auto-detect the best preset based on genre and content style."""
    genre_lower = genre.lower() if genre else ""

    if style in ("manga", "anime"):
        return "manga"
    if style == "comic":
        return "comic"

    genre_map = {
        "horror": "horror",
        "thriller": "noir",
        "mystery": "noir",
        "crime": "noir",
        "romance": "romance",
        "love": "romance",
        "fantasy": "fantasy",
        "sci-fi": "scifi",
        "science fiction": "scifi",
        "cyberpunk": "scifi",
        "children": "childrens",
        "picture book": "childrens",
        "literary": "literary",
        "contemporary": "literary",
    }

    for keyword, preset in genre_map.items():
        if keyword in genre_lower:
            return preset

    return "cinematic"
