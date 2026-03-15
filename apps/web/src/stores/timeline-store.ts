import { create } from 'zustand';
import type { TransitionType } from '@/lib/transitions';

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
  transition_type?: TransitionType;
  shot_type?: 'continuous' | 'cut';   // continuous = same scene flowing; cut = new scene
  scene_group?: number;               // clips sharing a group are one continuous sequence
  gen_status: 'pending' | 'generating' | 'done' | 'error';
  gen_error?: string;
  position: { x: number; y: number };
}

export type EffectType =
  | 'flash_white' | 'flash_black'    // frame flash
  | 'zoom_burst' | 'zoom_out'        // zoom in / zoom out
  | 'shake' | 'heavy_shake'          // camera shake (light / heavy)
  | 'echo' | 'time_echo' | 'freeze'  // temporal effects
  | 'speed_ramp'                      // slow → fast ramp
  | 'chromatic' | 'rgb_shift_v'      // RGB aberration (H / V)
  | 'panel_split' | 'cross_cut'      // manga panel / X-slash
  | 'reverse'                         // brief reverse playback
  | 'glitch'                          // digital glitch artifact
  | 'strobe' | 'flicker'             // strobe / flicker
  | 'vignette'                        // dark corner vignette
  | 'black_white'                     // instant B&W desaturate
  | 'invert'                          // color inversion
  | 'red_flash'                       // blood-red flash
  | 'blur_out'                        // dreamy soft blur
  | 'film_grain'                      // cinematic grain
  | 'letterbox'                       // cinematic black bars
  | 'neon'                            // neon violet glow
  | 'sepia'                           // warm sepia wash
  | 'overexpose'                      // blinding overexposure
  | 'pixelate'                        // digital pixelation
  | 'contrast_punch'                  // extreme contrast
  | 'manga_ink'                       // high-contrast manga ink
  | 'flash'          // configurable color flash
  | 'shake_h'        // horizontal shake
  | 'shake_v'        // vertical shake
  | 'zoom_pulse'     // pulsing zoom
  | 'whip_pan'       // motion blur pan
  | 'stutter'        // frame stutter
  | 'duotone'        // dual-tone grade
  | 'lut_warm'       // warm cinematic grade
  | 'lut_cold'       // cold/teal grade
  | 'cyberpunk'      // teal/magenta split
  | 'horror'         // horror look
  | 'bleach_bypass'  // bleach bypass film
  | 'color_shift'    // hue rotation
  | 'posterize'      // posterize
  | 'split_tone'     // split tone
  | 'scanlines'      // CRT scanlines
  | 'vhs'            // VHS effect
  | 'halftone'       // halftone dots
  | 'impact_lines'   // speed lines
  | 'glow_bloom'     // bloom glow
  | 'tv_noise'       // TV static
  | 'radial_blur'    // radial blur
  | 'tilt_shift'     // tilt shift
  | 'mirror_h'       // horizontal mirror
  | 'rain'           // rain overlay
  | 'mirror_v'       // vertical mirror
  | 'double_vision'  // ghost duplicate frame offset
  | 'shake_rotate'   // rotational camera shake
  | 'heartbeat'      // rhythmic pulse zoom
  | 'rgb_wobble'     // wobbling chromatic shift
  | 'screen_tear'    // horizontal screen tear / VHS tracking
  | 'negative'       // color negative invert
  | 'solarize'       // partial solarize
  | 'lens_distort'   // barrel/fisheye distortion
  | 'dream_glow'     // ethereal dream glow
  | 'color_burn'     // intense color burn/dodge
  | 'white_out'      // gradual white-out fade
  | 'dither'         // dithering / banding
  | 'aura'           // glowing edge aura
  | 'zoom_snap'      // instant hard zoom snap
  | 'panel_v'        // vertical manga panel split
  | 'rgb_split_d'    // diagonal RGB split
  | 'ink_drip'       // ink drip/splash overlay
  | 'speed_cut';     // rapid cut-to-black + return

export interface Effect {
  id: string;
  type: EffectType;
  timestamp_ms: number;    // when this effect fires (global timeline time)
  duration_ms: number;     // how long it lasts
  intensity: number;       // 0-1
  params?: Record<string, number>;  // effect-specific fine-grained params
}

export interface BeatMap {
  bpm: number;
  offset_ms: number;
  beats: number[];             // all beat timestamps in ms
  beat_strengths?: number[];   // 0-1 strength per beat (parallel to beats[])
  downbeats?: number[];        // bar starts (every 4th beat) in ms
  energy_peaks?: number[];     // energy spike timestamps in ms — HIGH PRIORITY sync points
  energy_curve?: number[];     // 0-1 energy value per 100ms — full energy envelope
  section_boundaries?: number[]; // structural section changes in ms — major transition points
  crashes?: number[];          // crash/open-hihat timestamps in ms — HEAVIEST impact moments
  kicks?: number[];            // kick drum timestamps in ms
  snares?: number[];           // snare/clap timestamps in ms
  hihats?: number[];           // closed hihat timestamps in ms
  horns?: number[];            // horn/brass/synth stab timestamps in ms
  onsets?: number[];           // all percussion onset timestamps in ms
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
    // Ensure all clips have valid positions and orders; strip title/end cards permanently
    const STRIP_IDS = new Set(['title_card', 'end_card']);
    const TITLE_CARD_TERMS = [
      'title card', 'title screen', 'title slide', 'title page', 'title treatment',
      'title reveal', 'title sequence', 'opening title', 'title shot',
      'book title', 'movie title', 'film title', 'outro card', 'intro card',
      'end card', 'coming soon', 'the end', 'credits',
      'glowing text', 'floating text', 'text appears', 'text reads',
      'logo reveal', 'brand reveal',
      'title text', 'text on screen', 'text on black', 'text overlay',
      'words appear', 'words on screen', 'text fades', 'text floats',
      'chapter title', 'opening card', 'closing card',
      'black screen with', 'fade to black with', 'text displayed',
    ];
    const isTitleCard = (c: any) => {
      const prompt = (c.prompt || '').toLowerCase();
      return TITLE_CARD_TERMS.some((t) => prompt.includes(t));
    };
    const rawClips = (timeline.clips || []).filter(
      (c: any) => !STRIP_IDS.has(c.id) && c.type !== 'text_overlay' && !isTitleCard(c)
    );
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
      effects: timeline.effects || [],
      beatMap: timeline.beat_map || timeline.beatMap || null,
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
