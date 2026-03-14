import { create } from 'zustand';

export interface Clip {
  id: string;
  order: number;
  type: 'image' | 'video' | 'text_overlay' | 'transition';
  duration_ms: number;
  prompt: string;
  generated_media_url?: string;
  thumbnail_url?: string;
  text?: string;
  text_style?: { font_size: number; color: string; position: string; animation?: string };
  transition_type?: 'fade' | 'dissolve' | 'wipe' | 'cut';
  shot_type?: 'continuous' | 'cut';   // continuous = same scene flowing; cut = new scene
  scene_group?: number;               // clips sharing a group are one continuous sequence
  gen_status: 'pending' | 'generating' | 'done' | 'error';
  gen_error?: string;
  position: { x: number; y: number };
}

export type EffectType =
  | 'flash_white' | 'flash_black'    // frame flash
  | 'zoom_burst'                      // sudden zoom in/out
  | 'shake'                           // camera shake
  | 'echo'                            // ghost repeat of frame
  | 'speed_ramp'                      // slow → fast ramp
  | 'chromatic'                       // chromatic aberration RGB split
  | 'panel_split'                     // manga multi-panel split
  | 'reverse'                         // brief reverse playback
  | 'glitch'                          // digital glitch artifact
  | 'strobe';                         // rapid strobe flash

export interface Effect {
  id: string;
  type: EffectType;
  timestamp_ms: number;    // when this effect fires (global timeline time)
  duration_ms: number;     // how long it lasts
  intensity: number;       // 0-1
}

export interface BeatMap {
  bpm: number;
  offset_ms: number;
  beats: number[];         // beat timestamps in ms
}

interface TimelineState {
  projectId: string | null;
  clips: Clip[];
  musicTrack: { url: string; name: string; duration_ms: number; volume: number } | null;
  settings: { resolution: string; aspect_ratio: string; fps: number };
  effects: Effect[];
  beatMap: BeatMap | null;

  // Actions
  setProjectId: (id: string) => void;
  setClips: (clips: Clip[]) => void;
  addClip: (clip: Omit<Clip, 'id' | 'order' | 'position'>) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  reorderClips: (clipIds: string[]) => void;
  setMusicTrack: (track: TimelineState['musicTrack']) => void;
  updateSettings: (settings: Partial<TimelineState['settings']>) => void;
  loadTimeline: (timeline: any) => void;
  addEffect: (effect: Effect) => void;
  removeEffect: (effectId: string) => void;
  updateEffect: (effectId: string, updates: Partial<Effect>) => void;
  setBeatMap: (beatMap: BeatMap | null) => void;
  setEffects: (effects: Effect[]) => void;
  clearEffects: () => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  projectId: null,
  clips: [],
  musicTrack: null,
  settings: { resolution: '1080p', aspect_ratio: '16:9', fps: 24 },
  effects: [],
  beatMap: null,

  setProjectId: (id) => set({ projectId: id }),

  setClips: (clips) => set({ clips }),

  addClip: (clipData) => set((state) => {
    const id = crypto.randomUUID();
    const order = state.clips.length;
    const clip: Clip = {
      ...clipData,
      id,
      order,
      position: { x: order * 280, y: 100 },
      gen_status: clipData.gen_status || 'pending',
    };
    return { clips: [...state.clips, clip] };
  }),

  removeClip: (clipId) => set((state) => ({
    clips: state.clips
      .filter((c) => c.id !== clipId)
      .map((c, i) => ({ ...c, order: i, position: { x: i * 280, y: 100 } })),
  })),

  updateClip: (clipId, updates) => set((state) => ({
    clips: state.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
  })),

  reorderClips: (clipIds) => set((state) => {
    const clipMap = new Map(state.clips.map((c) => [c.id, c]));
    const reordered = clipIds
      .map((id, i) => {
        const clip = clipMap.get(id);
        if (!clip) return null;
        return { ...clip, order: i, position: { x: i * 280, y: 100 } };
      })
      .filter(Boolean) as Clip[];
    return { clips: reordered };
  }),

  setMusicTrack: (track) => set({ musicTrack: track }),

  updateSettings: (settings) => set((state) => ({
    settings: { ...state.settings, ...settings },
  })),

  loadTimeline: (timeline) => {
    // Ensure all clips have valid positions and orders
    const rawClips = timeline.clips || [];
    const clips = rawClips.map((c: any, i: number) => ({
      ...c,
      prompt: c.prompt ?? '',
      order: c.order ?? i,
      position: c.position && c.position.x !== undefined
        ? c.position
        : { x: (c.order ?? i) * 280, y: 100 },
      gen_status: c.gen_status || 'pending',
    }));
    return set({
      clips,
      musicTrack: timeline.music_track || null,
      settings: timeline.settings || { resolution: '1080p', aspect_ratio: '16:9', fps: 24 },
    });
  },

  addEffect: (effect) => set((state) => ({
    effects: [...state.effects, effect],
  })),

  removeEffect: (effectId) => set((state) => ({
    effects: state.effects.filter((e) => e.id !== effectId),
  })),

  updateEffect: (effectId, updates) => set((state) => ({
    effects: state.effects.map((e) => (e.id === effectId ? { ...e, ...updates } : e)),
  })),

  setBeatMap: (beatMap) => set({ beatMap }),

  setEffects: (effects) => set({ effects }),

  clearEffects: () => set({ effects: [] }),
}));
