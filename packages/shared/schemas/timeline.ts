export interface TextStyle {
  font_size: number;
  color: string;
  position: 'top' | 'center' | 'bottom';
  animation?: 'fade_in' | 'typewriter' | 'slide_up';
}

export interface Clip {
  id: string;
  order: number;
  type: 'image' | 'video' | 'text_overlay' | 'transition';
  duration_ms: number;
  prompt: string;
  generated_media_url?: string;
  thumbnail_url?: string;
  text?: string;
  text_style?: TextStyle;
  transition_type?: 'fade' | 'dissolve' | 'wipe' | 'cut';
  gen_status: 'pending' | 'generating' | 'done' | 'error';
  gen_error?: string;
  position: { x: number; y: number };
}

export interface MusicTrack {
  url: string;
  name: string;
  duration_ms: number;
  volume: number;
}

export interface TimelineSettings {
  resolution: '720p' | '1080p';
  aspect_ratio: '16:9' | '9:16' | '1:1';
  fps: 24 | 30;
}

export interface Timeline {
  project_id?: string;
  clips: Clip[];
  music_track?: MusicTrack;
  total_duration_ms: number;
  settings: TimelineSettings;
}
