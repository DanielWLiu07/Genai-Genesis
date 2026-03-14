export interface Character {
  name: string;
  description: string;
  visual_description: string;
}

export interface Scene {
  title: string;
  description: string;
  quote?: string;
  mood: string;
  visual_description: string;
  scene_type: 'introduction' | 'character_reveal' | 'tension_build' | 'conflict' | 'climax' | 'emotional_pause' | 'ending_hook';
}

export interface BookAnalysis {
  summary: string;
  themes: string[];
  genre: string;
  mood: string;
  target_audience: string;
  characters: Character[];
  key_scenes: Scene[];
}

export interface Project {
  id: string;
  title: string;
  author: string;
  description: string;
  book_file_url?: string;
  cover_image_url?: string;
  status: 'uploading' | 'analyzing' | 'planning' | 'editing' | 'rendering' | 'done';
  analysis?: BookAnalysis;
  created_at: string;
  updated_at: string;
}
