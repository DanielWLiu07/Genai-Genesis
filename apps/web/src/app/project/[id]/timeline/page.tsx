'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useParams, useSearchParams } from 'next/navigation';
import { TransitionLink as Link } from '@/components/PageTransition';
import {
  ArrowLeft, Zap, Play, Pause, Download, Loader2, Trash2, ZoomIn, ZoomOut, Music, MessageSquare,
} from 'lucide-react';
import { useTimelineStore, type Clip, type Effect, type EffectType, type BeatMap } from '@/stores/timeline-store';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { ChatPanel, cancelClipGeneration } from '@/components/chat/ChatPanel';

// ─── Beat sync ──────────────────────────────────────────────────────────────

const INTENSITY_LEVELS = [
  { key: 'chill',    label: 'Chill',    threshold: 0.25, beatStep: 4 },
  { key: 'balanced', label: 'Balanced', threshold: 0.45, beatStep: 2 },
  { key: 'intense',  label: 'Intense',  threshold: 0.65, beatStep: 1 },
  { key: 'all-out',  label: 'All-Out',  threshold: 0.0,  beatStep: 1 },
] as const;

function computeBeatSync(audioAnalysis: any, clipCount: number, intensityKey: string): number[] {
  const level = INTENSITY_LEVELS.find(l => l.key === intensityKey) ?? INTENSITY_LEVELS[1];
  const beats: number[] = audioAnalysis.beat_timestamps || [];
  const energyCurve: number[] = audioAnalysis.energy_curve || [];
  const duration: number = audioAnalysis.duration_s || 30;
  if (beats.length < 2) {
    const dur = Math.round((duration * 1000) / clipCount);
    return Array(clipCount).fill(dur);
  }
  const scoredBeats = beats.map((t) => ({ t, energy: energyCurve[Math.min(Math.floor(t), energyCurve.length - 1)] ?? 0 }));
  let filtered = scoredBeats.filter(b => b.energy >= level.threshold).filter((_, i) => i % level.beatStep === 0);
  if (filtered.length < clipCount) {
    filtered = [...scoredBeats].sort((a, b) => b.energy - a.energy).slice(0, Math.max(clipCount + 1, scoredBeats.length)).sort((a, b) => a.t - b.t);
  }
  const cutPoints: number[] = [0];
  for (let i = 0; i < clipCount - 1; i++) {
    const idx = Math.min(Math.round(i * filtered.length / (clipCount - 1)), filtered.length - 1);
    cutPoints.push(Math.round((filtered[idx]?.t ?? (duration * (i + 1) / clipCount)) * 1000));
  }
  cutPoints.push(Math.round(duration * 1000));
  return Array.from({ length: clipCount }, (_, i) => Math.max(400, cutPoints[i + 1] - cutPoints[i]));
}

// ─── Effect metadata ────────────────────────────────────────────────────────

const EFFECT_META: Record<EffectType, { label: string; color: string; desc: string }> = {
  flash_white:    { label: 'FLASH',     color: '#ffffff', desc: 'Sudden frame flash — high impact hit (color choosable)' },
  flash_black:    { label: 'FLASH B',   color: '#333333', desc: 'Sudden black frame cut — dramatic pause' },
  zoom_burst:     { label: 'ZOOM IN',   color: '#fbbf24', desc: 'Rapid zoom-in burst for emphasis' },
  zoom_out:       { label: 'ZOOM OUT',  color: '#fcd34d', desc: 'Dramatic zoom out reveal — aftermath moment' },
  shake:          { label: 'SHAKE',     color: '#f97316', desc: 'Camera shake — violence or impact' },
  heavy_shake:    { label: 'EARTHQUAKE',color: '#ef4444', desc: 'Extreme earthquake shake — explosion / boss hit' },
  echo:           { label: 'ECHO',      color: '#60a5fa', desc: 'Ghost repeat of the current frame' },
  time_echo:      { label: 'T-ECHO',    color: '#a5f3fc', desc: 'Temporal ghost trail — speed afterimage' },
  freeze:         { label: 'FREEZE',    color: '#bfdbfe', desc: 'Freeze-frame stutter — bullet-time moment' },
  speed_ramp:     { label: 'RAMP',      color: '#4ade80', desc: 'Slow → fast speed ramp for tension' },
  chromatic:      { label: 'CHROMA H',  color: '#f472b6', desc: 'Horizontal RGB split chromatic aberration' },
  rgb_shift_v:    { label: 'CHROMA V',  color: '#818cf8', desc: 'Vertical RGB shift — dimensional glitch' },
  panel_split:    { label: 'PANELS',    color: '#a855f7', desc: 'Manga multi-panel split overlay' },
  cross_cut:      { label: 'X-SLASH',   color: '#f1f5f9', desc: 'Manga X-slash lines — action strike hit' },
  reverse:        { label: 'REVERSE',   color: '#ef4444', desc: 'Brief reverse playback rewind' },
  glitch:         { label: 'GLITCH',    color: '#22d3ee', desc: 'Digital glitch artifact corruption' },
  strobe:         { label: 'STROBE',    color: '#e2e8f0', desc: 'Rapid strobe flash sequence' },
  flicker:        { label: 'FLICKER',   color: '#fde68a', desc: 'Rapid brightness flicker — unstable reality' },
  vignette:       { label: 'VIGNETTE',  color: '#6b21a8', desc: 'Dark corner pulse — cinematic dread' },
  black_white:    { label: 'B&W',       color: '#94a3b8', desc: 'Instant desaturate — memory / flashback' },
  invert:         { label: 'INVERT',    color: '#67e8f9', desc: 'Color inversion — surreal psychedelic hit' },
  red_flash:      { label: 'FLASH',     color: '#dc2626', desc: 'Colored frame flash — violence, danger, or impact' },
  blur_out:       { label: 'BLUR',      color: '#7dd3fc', desc: 'Dreamy soft blur — memory or transition' },
  film_grain:     { label: 'GRAIN',     color: '#92400e', desc: 'Film grain texture — cinematic grit' },
  letterbox:      { label: 'CINEMA',    color: '#0f172a', desc: 'Cinematic black bars slam in — epic reveal' },
  neon:           { label: 'NEON',      color: '#c084fc', desc: 'Neon violet glow — supernatural power' },
  sepia:          { label: 'SEPIA',     color: '#d97706', desc: 'Warm sepia wash — nostalgia / past' },
  overexpose:     { label: 'OVEREXP',   color: '#fef9c3', desc: 'Blinding overexposure — climactic moment' },
  pixelate:       { label: 'PIXEL',     color: '#34d399', desc: 'Digital pixelation — data / digital world' },
  contrast_punch: { label: 'CONTRAST',  color: '#fb923c', desc: 'Extreme contrast punch — manga ink style' },
  manga_ink:      { label: 'MANGA INK', color: '#e2e8f0', desc: 'Hyper-contrast B&W — pure manga look' },
  flash:         { label: 'FLASH',      color: '#ffffff', desc: 'Configurable color flash — set any hue via params' },
  shake_h:       { label: 'SHAKE H',    color: '#f97316', desc: 'Horizontal camera shake — side impact hit' },
  shake_v:       { label: 'SHAKE V',    color: '#fb923c', desc: 'Vertical camera shake — ground impact' },
  zoom_pulse:    { label: 'PULSE',      color: '#fbbf24', desc: 'Rhythmic zoom pulse — beat-sync emphasis' },
  whip_pan:      { label: 'WHIP',       color: '#fcd34d', desc: 'Motion blur whip pan — fast action sweep' },
  stutter:       { label: 'STUTTER',    color: '#a5f3fc', desc: 'Frame stutter — erratic digital hiccup' },
  duotone:       { label: 'DUOTONE',    color: '#c084fc', desc: 'Dual-color tonal grade — stylized film look' },
  lut_warm:      { label: 'WARM',       color: '#f59e0b', desc: 'Warm cinematic grade — golden orange tones' },
  lut_cold:      { label: 'COLD',       color: '#60a5fa', desc: 'Cold/teal grade — icy blue tones' },
  cyberpunk:     { label: 'CYBERPUNK',  color: '#00ffcc', desc: 'Teal/magenta cyberpunk split grade' },
  horror:        { label: 'HORROR',     color: '#991b1b', desc: 'Red vignette + grain — dread and fear' },
  bleach_bypass: { label: 'BLEACH',     color: '#e5e7eb', desc: 'Bleach bypass film — gritty desaturated' },
  color_shift:   { label: 'HUE SHIFT',  color: '#a78bfa', desc: 'Full hue rotation — dreamlike color warp' },
  posterize:     { label: 'POSTER',     color: '#34d399', desc: 'Posterize — limited palette pop art' },
  split_tone:    { label: 'SPLIT TONE', color: '#fb7185', desc: 'Shadow/highlight color split grading' },
  scanlines:     { label: 'SCANLINES',  color: '#4b5563', desc: 'CRT scanlines — retro monitor look' },
  vhs:           { label: 'VHS',        color: '#6b7280', desc: 'VHS tape noise + tracking — retro degraded' },
  halftone:      { label: 'HALFTONE',   color: '#d1d5db', desc: 'Manga halftone dots — printed ink pattern' },
  impact_lines:  { label: 'SPD LINES',  color: '#f9fafb', desc: 'Manga speed lines radiating from center' },
  glow_bloom:    { label: 'BLOOM',      color: '#fde68a', desc: 'Soft bloom glow — overlit ethereal warmth' },
  tv_noise:      { label: 'STATIC',     color: '#9ca3af', desc: 'TV static noise — signal loss distortion' },
  radial_blur:   { label: 'RADIAL',     color: '#7dd3fc', desc: 'Radial zoom blur from center — explosive' },
  tilt_shift:    { label: 'TILT-SHIFT', color: '#86efac', desc: 'Tilt-shift miniature — selective focus blur' },
  mirror_h:      { label: 'MIRROR H',   color: '#a3e635', desc: 'Horizontal mirror — symmetrical illusion' },
  rain:          { label: 'RAIN',       color: '#93c5fd', desc: 'Rain streaks overlay — melancholic mood' },
  mirror_v:      { label: 'MIRROR V',   color: '#86efac', desc: 'Vertical mirror — top/bottom symmetry' },
  double_vision: { label: 'DBL VISION', color: '#a78bfa', desc: 'Ghost duplicate frame offset — dazed blur' },
  shake_rotate:  { label: 'ROT SHAKE',  color: '#fb923c', desc: 'Rotational camera shake — disorientation' },
  heartbeat:     { label: 'HEARTBEAT',  color: '#f43f5e', desc: 'Rhythmic pulse zoom — tense heartbeat sync' },
  rgb_wobble:    { label: 'RGB WOBBLE', color: '#e879f9', desc: 'Wobbling chromatic oscillation — psychedelic' },
  screen_tear:   { label: 'TEAR',       color: '#64748b', desc: 'Horizontal screen tear — VHS tracking loss' },
  negative:      { label: 'NEGATIVE',   color: '#e2e8f0', desc: 'Film negative — inverted color tones' },
  solarize:      { label: 'SOLARIZE',   color: '#fbbf24', desc: 'Partial solarize — dark-room overexposure' },
  lens_distort:  { label: 'FISHEYE',    color: '#34d399', desc: 'Barrel/fisheye lens distortion' },
  dream_glow:    { label: 'DREAM',      color: '#f9a8d4', desc: 'Ethereal dream glow — soft romantic haze' },
  color_burn:    { label: 'BURN',       color: '#b45309', desc: 'Intense color burn/dodge — punchy contrast' },
  white_out:     { label: 'WHITE OUT',  color: '#f8fafc', desc: 'Gradual white-out fade — climax / death' },
  dither:        { label: 'DITHER',     color: '#78716c', desc: 'Dithering / banding — retro limited palette' },
  aura:          { label: 'AURA',       color: '#d946ef', desc: 'Glowing edge aura — supernatural power surge' },
  zoom_snap:     { label: 'SNAP ZOOM',  color: '#facc15', desc: 'Instant hard zoom snap — sudden reveal' },
  panel_v:       { label: 'PANELS V',   color: '#c084fc', desc: 'Vertical manga panel split — multi-scene' },
  rgb_split_d:   { label: 'CHROMA D',   color: '#c7d2fe', desc: 'Diagonal RGB split — warped dimension' },
  ink_drip:      { label: 'INK DRIP',   color: '#1e1b4b', desc: 'Ink drip/splash overlay — manga impact' },
  speed_cut:     { label: 'SPEED CUT',  color: '#dc2626', desc: 'Rapid cut-to-black + return — staccato edit' },
};

// flash_black shares the flash_white display label when used as palette alias
EFFECT_META.flash_black = EFFECT_META.flash_white;

const EFFECT_TYPES: EffectType[] = [
  // ─ Flash / Light ─────────────────────
  'flash', 'overexpose', 'strobe', 'flicker', 'glow_bloom',
  // ─ Zoom / Move ───────────────────────
  'zoom_burst', 'zoom_out', 'zoom_pulse', 'whip_pan',
  // ─ Shake / Camera ────────────────────
  'shake', 'heavy_shake', 'shake_h', 'shake_v', 'speed_ramp', 'reverse',
  // ─ Temporal / Stutter ────────────────
  'echo', 'time_echo', 'freeze', 'stutter',
  // ─ Chromatic / Glitch ────────────────
  'chromatic', 'rgb_shift_v', 'glitch', 'vhs', 'tv_noise',
  // ─ Color Grade ───────────────────────
  'lut_warm', 'lut_cold', 'cyberpunk', 'duotone', 'split_tone',
  'color_shift', 'neon', 'sepia', 'black_white', 'invert',
  // ─ Film / Texture ────────────────────
  'bleach_bypass', 'horror', 'film_grain', 'scanlines', 'halftone',
  'contrast_punch', 'manga_ink', 'posterize',
  // ─ Distortion ────────────────────────
  'blur_out', 'radial_blur', 'tilt_shift', 'pixelate',
  // ─ Manga / Overlay ───────────────────
  'panel_split', 'panel_v', 'cross_cut', 'letterbox', 'vignette', 'impact_lines', 'ink_drip', 'rain',
  // ─ Mirror / Distortion ───────────────
  'mirror_h', 'mirror_v', 'lens_distort', 'rgb_split_d',
  // ─ Pulse / Rhythm ────────────────────
  'heartbeat', 'zoom_snap', 'speed_cut', 'double_vision',
  // ─ Atmospheric ───────────────────────
  'dream_glow', 'aura', 'white_out', 'screen_tear',
  // ─ Retro / Degraded ──────────────────
  'negative', 'solarize', 'dither', 'color_burn',
  // ─ Motion ────────────────────────────
  'shake_rotate', 'rgb_wobble',
];

// ─── Per-effect parameter schemas ─────────────────────────────────────────

interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
  desc?: string;
  type?: 'slider' | 'color_hex';
}

const EFFECT_PARAM_DEFS: Partial<Record<EffectType, ParamDef[]>> = {
  zoom_burst: [
    { key: 'scale',    label: 'Scale',    min: 1.05, max: 3.0,  step: 0.05, default: 1.4, desc: 'Zoom factor (1.4 = 40% zoom in)' },
    { key: 'center_x', label: 'Pivot X',  min: 0,    max: 100,  step: 5,    default: 50,  unit: '%', desc: 'Horizontal zoom pivot' },
    { key: 'center_y', label: 'Pivot Y',  min: 0,    max: 100,  step: 5,    default: 50,  unit: '%', desc: 'Vertical zoom pivot' },
  ],
  zoom_out: [
    { key: 'scale',    label: 'Scale',    min: 0.3,  max: 0.95, step: 0.05, default: 0.78, desc: 'Zoom out factor (0.78 = 22% out)' },
    { key: 'center_x', label: 'Pivot X',  min: 0,    max: 100,  step: 5,    default: 50,  unit: '%' },
    { key: 'center_y', label: 'Pivot Y',  min: 0,    max: 100,  step: 5,    default: 50,  unit: '%' },
  ],
  shake: [
    { key: 'radius',   label: 'Radius',   min: 1,    max: 25,   step: 1,    default: 6,   unit: 'px', desc: 'Shake displacement' },
  ],
  heavy_shake: [
    { key: 'radius',   label: 'Radius',   min: 5,    max: 50,   step: 1,    default: 18,  unit: 'px' },
  ],
  chromatic: [
    { key: 'shift',    label: 'Shift',    min: 1,    max: 40,   step: 1,    default: 6,   unit: 'px', desc: 'Horizontal RGB offset' },
  ],
  rgb_shift_v: [
    { key: 'shift',    label: 'Shift',    min: 1,    max: 40,   step: 1,    default: 8,   unit: 'px', desc: 'Vertical RGB offset' },
  ],
  blur_out: [
    { key: 'sigma',    label: 'Blur',     min: 1,    max: 40,   step: 1,    default: 12,  desc: 'Blur radius (higher = dreamier)' },
  ],
  speed_ramp: [
    { key: 'sigma',    label: 'Motion Blur', min: 0.5, max: 8,  step: 0.5,  default: 2,   desc: 'Motion blur strength' },
  ],
  vignette: [
    { key: 'angle',    label: 'Size',     min: 2,    max: 12,   step: 1,    default: 4,   desc: 'PI/N — lower = larger/darker vignette' },
  ],
  letterbox: [
    { key: 'bar_size', label: 'Bar Size', min: 2,    max: 30,   step: 1,    default: 12,  unit: '%', desc: 'Bar height as % of frame height' },
  ],
  panel_split: [
    { key: 'count',     label: 'Panels',  min: 2,    max: 8,    step: 1,    default: 2,   desc: 'Number of manga panels' },
    { key: 'thickness', label: 'Border',  min: 1,    max: 20,   step: 1,    default: 5,   unit: 'px', desc: 'Panel border thickness' },
  ],
  cross_cut: [
    { key: 'thickness', label: 'Thickness', min: 1,  max: 25,   step: 1,    default: 4,   unit: 'px', desc: 'Slash line width' },
  ],
  pixelate: [
    { key: 'size',     label: 'Pixel Size', min: 2,  max: 64,   step: 2,    default: 12,  unit: 'px', desc: 'Mosaic block size' },
  ],
  film_grain: [
    { key: 'amount',   label: 'Amount',   min: 2,    max: 80,   step: 2,    default: 15,  desc: 'Grain/noise intensity' },
  ],
  flicker: [
    { key: 'amount',   label: 'Intensity', min: 5,   max: 120,  step: 5,    default: 35,  desc: 'Flicker brightness variance' },
  ],
  echo: [
    { key: 'frames',   label: 'Frames',   min: 2,    max: 12,   step: 1,    default: 4,   desc: 'Number of echo frames' },
    { key: 'decay',    label: 'Decay',    min: 0.05, max: 0.8,  step: 0.05, default: 0.3, desc: 'Weight fade per frame' },
  ],
  time_echo: [
    { key: 'frames',   label: 'Frames',   min: 2,    max: 12,   step: 1,    default: 5,   desc: 'Ghost trail frames' },
    { key: 'decay',    label: 'Decay',    min: 0.05, max: 0.8,  step: 0.05, default: 0.35 },
  ],
  freeze: [
    { key: 'frames',   label: 'Frames',   min: 4,    max: 20,   step: 1,    default: 8,   desc: 'Freeze duration in frames' },
  ],
  neon: [
    { key: 'hue_shift', label: 'Hue',    min: 0,    max: 360,  step: 10,   default: 280,  unit: '°', desc: 'Hue rotation angle' },
    { key: 'glow',      label: 'Glow',   min: 1,    max: 10,   step: 0.5,  default: 5,    desc: 'Saturation/glow boost' },
  ],
  glitch: [
    { key: 'hue_shift', label: 'Hue',    min: 0,    max: 360,  step: 10,   default: 90,   unit: '°' },
    { key: 'glow',      label: 'Saturation', min: 1, max: 10,  step: 0.5,  default: 3 },
  ],
  flash_white: [
    { key: 'brightness', label: 'Brightness', min: 0.3, max: 3.0, step: 0.1, default: 1.5, desc: 'Flash brightness boost' },
    { key: 'saturation', label: 'Saturation', min: 0,   max: 1.0, step: 0.05, default: 0.1 },
  ],
  flash_black: [
    { key: 'brightness', label: 'Darkness', min: -1.0, max: -0.1, step: 0.05, default: -0.7 },
  ],
  strobe: [
    { key: 'brightness', label: 'Brightness', min: 0.5, max: 3.0, step: 0.1, default: 1.3 },
  ],
  overexpose: [
    { key: 'brightness', label: 'Brightness', min: 0.1, max: 1.0, step: 0.05, default: 0.5 },
    { key: 'contrast',   label: 'Contrast',   min: 0.1, max: 1.0, step: 0.05, default: 0.55 },
  ],
  red_flash: [
    { key: 'glow',     label: 'Red Boost', min: 1.0, max: 3.5, step: 0.1, default: 1.8, desc: 'Red channel multiplier' },
  ],
  black_white: [
    { key: 'contrast', label: 'Contrast', min: 0.5, max: 3.0, step: 0.1, default: 1.4 },
  ],
  manga_ink: [
    { key: 'contrast',   label: 'Contrast',   min: 1,    max: 10,   step: 0.5,  default: 5,   desc: 'Ink contrast (higher = more B&W)' },
    { key: 'brightness', label: 'Brightness', min: -0.8, max: 0,    step: 0.05, default: -0.4 },
  ],
  contrast_punch: [
    { key: 'contrast',   label: 'Contrast',   min: 1,    max: 6,    step: 0.1,  default: 3 },
    { key: 'brightness', label: 'Brightness', min: -0.6, max: 0,    step: 0.05, default: -0.25 },
    { key: 'saturation', label: 'Saturation', min: 0,    max: 1,    step: 0.05, default: 0.4 },
  ],
  reverse: [
    { key: 'contrast',   label: 'Contrast',   min: 1,    max: 4,    step: 0.1,  default: 2 },
    { key: 'glow',       label: 'Saturation', min: 1,    max: 4,    step: 0.1,  default: 2 },
  ],
  flash: [
    { key: 'color', label: 'Color', min: 0, max: 16777215, step: 1, default: 16777215, type: 'color_hex', desc: 'Flash color (white=16777215, black=0, red=16711680)' },
    { key: 'brightness', label: 'Brightness', min: -1.0, max: 3.0, step: 0.1, default: 1.5 },
    { key: 'saturation', label: 'Saturation', min: 0, max: 2.0, step: 0.05, default: 0.1 },
  ],
  shake_h: [
    { key: 'radius', label: 'Amplitude', min: 1, max: 40, step: 1, default: 8, unit: 'px', desc: 'Horizontal shake amplitude' },
  ],
  shake_v: [
    { key: 'radius', label: 'Amplitude', min: 1, max: 40, step: 1, default: 8, unit: 'px', desc: 'Vertical shake amplitude' },
  ],
  zoom_pulse: [
    { key: 'scale', label: 'Scale', min: 1.02, max: 2.0, step: 0.02, default: 1.15, desc: 'Pulse zoom factor' },
  ],
  whip_pan: [
    { key: 'sigma', label: 'Blur', min: 1, max: 40, step: 1, default: 14, desc: 'Motion blur intensity' },
    { key: 'angle', label: 'Direction', min: 0, max: 360, step: 15, default: 0, unit: '°', desc: '0=horizontal, 90=vertical' },
  ],
  stutter: [
    { key: 'frames', label: 'Steps', min: 2, max: 8, step: 1, default: 3, desc: 'Stutter frame count' },
  ],
  duotone: [
    { key: 'hue_shift', label: 'Hue', min: 0, max: 360, step: 10, default: 200, unit: '°' },
    { key: 'glow', label: 'Saturation', min: 1, max: 6, step: 0.5, default: 3 },
  ],
  lut_warm: [
    { key: 'brightness', label: 'Temperature', min: 0.01, max: 1.0, step: 0.05, default: 0.4, desc: 'Warm orange/amber tint strength' },
  ],
  lut_cold: [
    { key: 'brightness', label: 'Temperature', min: 0.01, max: 1.0, step: 0.05, default: 0.4, desc: 'Cool blue/teal tint strength' },
  ],
  cyberpunk: [
    { key: 'shift', label: 'Cyan Boost', min: 1, max: 5, step: 0.25, default: 2.5 },
    { key: 'glow', label: 'Magenta Boost', min: 1, max: 5, step: 0.25, default: 2.5 },
  ],
  horror: [
    { key: 'glow', label: 'Red Tint', min: 1, max: 4, step: 0.1, default: 1.8 },
    { key: 'amount', label: 'Grain', min: 5, max: 80, step: 5, default: 30 },
  ],
  bleach_bypass: [
    { key: 'contrast', label: 'Contrast', min: 1, max: 5, step: 0.1, default: 2.5 },
    { key: 'saturation', label: 'Saturation', min: 0, max: 0.8, step: 0.05, default: 0.25 },
  ],
  color_shift: [
    { key: 'hue_shift', label: 'Hue', min: 0, max: 360, step: 5, default: 120, unit: '°', desc: 'Hue rotation amount' },
    { key: 'glow', label: 'Saturation', min: 0.5, max: 4, step: 0.1, default: 1.5 },
  ],
  posterize: [
    { key: 'size', label: 'Levels', min: 2, max: 16, step: 1, default: 4, desc: 'Color depth (lower = more poster)' },
  ],
  split_tone: [
    { key: 'hue_shift', label: 'Shadow Hue', min: 0, max: 360, step: 10, default: 200, unit: '°' },
    { key: 'glow', label: 'Highlight Hue', min: 0, max: 360, step: 10, default: 40, unit: '°' },
  ],
  scanlines: [
    { key: 'count', label: 'Line Count', min: 20, max: 200, step: 10, default: 80, desc: 'Number of scanlines' },
    { key: 'amount', label: 'Opacity', min: 5, max: 70, step: 5, default: 30, unit: '%' },
  ],
  vhs: [
    { key: 'shift', label: 'Tracking', min: 1, max: 20, step: 1, default: 6, desc: 'VHS tracking error offset' },
    { key: 'amount', label: 'Noise', min: 5, max: 60, step: 5, default: 20 },
  ],
  halftone: [
    { key: 'size', label: 'Dot Size', min: 2, max: 20, step: 1, default: 6, unit: 'px' },
  ],
  impact_lines: [
    { key: 'count', label: 'Density', min: 8, max: 40, step: 2, default: 16, desc: 'Number of speed lines' },
    { key: 'amount', label: 'Length', min: 10, max: 80, step: 5, default: 40, unit: '%' },
  ],
  glow_bloom: [
    { key: 'sigma', label: 'Blur', min: 1, max: 30, step: 1, default: 8, desc: 'Bloom spread radius' },
    { key: 'brightness', label: 'Strength', min: 0.1, max: 2.0, step: 0.1, default: 0.8 },
  ],
  tv_noise: [
    { key: 'amount', label: 'Static', min: 5, max: 80, step: 5, default: 25 },
  ],
  radial_blur: [
    { key: 'sigma', label: 'Blur', min: 2, max: 30, step: 1, default: 10, desc: 'Radial blur intensity' },
  ],
  tilt_shift: [
    { key: 'brightness', label: 'Focus Y', min: 10, max: 90, step: 5, default: 50, unit: '%', desc: 'Vertical focus center' },
    { key: 'sigma', label: 'Blur', min: 2, max: 20, step: 1, default: 8, desc: 'Out-of-focus blur strength' },
  ],
  mirror_h: [
    { key: 'amount', label: 'Power', min: 0.1, max: 1.0, step: 0.05, default: 1.0, desc: 'Effect strength' },
  ],
  rain: [
    { key: 'count',  label: 'Density', min: 1,  max: 10,  step: 1,  default: 4 },
    { key: 'angle',  label: 'Angle',   min: 0,  max: 60,  step: 5,  default: 15, unit: '°', desc: 'Rain streak angle' },
    { key: 'amount', label: 'Power',   min: 0.1,max: 1.0, step: 0.05, default: 0.8 },
  ],
  // ── new effects ────────────────────────────────────────────────────────
  mirror_v: [
    { key: 'amount', label: 'Power', min: 0.1, max: 1.0, step: 0.05, default: 1.0 },
  ],
  double_vision: [
    { key: 'shift',  label: 'Offset',  min: 2,  max: 40,  step: 1,  default: 12,  unit: 'px', desc: 'Ghost frame offset distance' },
    { key: 'decay',  label: 'Opacity', min: 0.1,max: 0.8, step: 0.05, default: 0.4 },
    { key: 'angle',  label: 'Direction', min: 0, max: 360, step: 15, default: 0,  unit: '°', desc: 'Offset direction' },
  ],
  shake_rotate: [
    { key: 'angle',  label: 'Max Angle', min: 1, max: 30,  step: 1,  default: 8,  unit: '°', desc: 'Max rotation per frame' },
    { key: 'amount', label: 'Power',     min: 0.1,max: 1.0,step: 0.05,default: 0.8 },
  ],
  heartbeat: [
    { key: 'scale',  label: 'Pulse Scale', min: 1.02, max: 1.5, step: 0.02, default: 1.12 },
    { key: 'frames', label: 'Beat Count',  min: 1,    max: 6,   step: 1,    default: 2,   desc: 'Pulses per trigger' },
    { key: 'amount', label: 'Power',       min: 0.1,  max: 1.0, step: 0.05, default: 0.9 },
  ],
  rgb_wobble: [
    { key: 'shift',  label: 'Amplitude', min: 1,  max: 30,  step: 1,  default: 10, unit: 'px' },
    { key: 'frames', label: 'Speed',     min: 1,  max: 8,   step: 1,  default: 3,  desc: 'Wobble oscillation speed' },
    { key: 'amount', label: 'Power',     min: 0.1,max: 1.0, step: 0.05, default: 0.9 },
  ],
  screen_tear: [
    { key: 'count',  label: 'Tears',   min: 1,   max: 8,   step: 1,  default: 3,  desc: 'Number of horizontal tears' },
    { key: 'shift',  label: 'Offset',  min: 2,   max: 40,  step: 1,  default: 12, unit: 'px' },
    { key: 'amount', label: 'Power',   min: 0.1, max: 1.0, step: 0.05, default: 0.85 },
  ],
  negative: [
    { key: 'amount', label: 'Power',   min: 0.1, max: 1.0, step: 0.05, default: 1.0 },
  ],
  solarize: [
    { key: 'brightness', label: 'Threshold', min: 0.1, max: 1.0, step: 0.05, default: 0.5, desc: 'Solarize threshold level' },
    { key: 'amount',     label: 'Power',     min: 0.1, max: 1.0, step: 0.05, default: 0.9 },
  ],
  lens_distort: [
    { key: 'sigma',  label: 'Distortion', min: 0.05, max: 1.0, step: 0.05, default: 0.3, desc: 'Barrel distortion strength' },
    { key: 'amount', label: 'Power',      min: 0.1,  max: 1.0, step: 0.05, default: 0.8 },
  ],
  dream_glow: [
    { key: 'sigma',      label: 'Spread',     min: 2,  max: 40, step: 1,   default: 14, desc: 'Glow blur radius' },
    { key: 'brightness', label: 'Brightness', min: 0.1,max: 2.0,step: 0.1, default: 0.7 },
    { key: 'hue_shift',  label: 'Hue Tint',   min: 0,  max: 360,step: 10,  default: 300, unit: '°' },
    { key: 'amount',     label: 'Power',      min: 0.1,max: 1.0, step: 0.05,default: 0.8 },
  ],
  color_burn: [
    { key: 'contrast',   label: 'Burn',    min: 1,  max: 6,   step: 0.1, default: 3 },
    { key: 'brightness', label: 'Dodge',   min: -1, max: 0.5, step: 0.05,default: -0.2 },
    { key: 'amount',     label: 'Power',   min: 0.1,max: 1.0, step: 0.05,default: 0.85 },
  ],
  white_out: [
    { key: 'brightness', label: 'Brightness', min: 0.5, max: 3.0, step: 0.1, default: 1.8 },
    { key: 'amount',     label: 'Power',      min: 0.1, max: 1.0, step: 0.05, default: 0.9 },
  ],
  dither: [
    { key: 'size',   label: 'Grid Size', min: 1, max: 16, step: 1, default: 4,   unit: 'px', desc: 'Dither matrix size' },
    { key: 'amount', label: 'Power',     min: 0.1, max: 1.0, step: 0.05, default: 0.85 },
  ],
  aura: [
    { key: 'sigma',     label: 'Spread',     min: 2,  max: 40,  step: 1,   default: 12 },
    { key: 'hue_shift', label: 'Aura Color', min: 0,  max: 360, step: 10,  default: 280, unit: '°' },
    { key: 'glow',      label: 'Intensity',  min: 0.5,max: 5.0, step: 0.25,default: 2.0 },
    { key: 'amount',    label: 'Power',      min: 0.1,max: 1.0, step: 0.05,default: 0.85 },
  ],
  zoom_snap: [
    { key: 'scale',  label: 'Zoom',     min: 1.1,  max: 3.0,  step: 0.1,  default: 1.6 },
    { key: 'amount', label: 'Power',    min: 0.1,  max: 1.0,  step: 0.05, default: 1.0 },
  ],
  panel_v: [
    { key: 'count',     label: 'Panels', min: 2, max: 6,  step: 1, default: 2,  desc: 'Number of vertical panels' },
    { key: 'thickness', label: 'Border', min: 1, max: 20, step: 1, default: 4,  unit: 'px' },
    { key: 'amount',    label: 'Power',  min: 0.1, max: 1.0, step: 0.05, default: 0.9 },
  ],
  rgb_split_d: [
    { key: 'shift',  label: 'Offset', min: 1,   max: 40,  step: 1,   default: 8,  unit: 'px' },
    { key: 'angle',  label: 'Angle',  min: 0,   max: 360, step: 15,  default: 45, unit: '°' },
    { key: 'amount', label: 'Power',  min: 0.1, max: 1.0, step: 0.05,default: 0.9 },
  ],
  ink_drip: [
    { key: 'count',  label: 'Drops',   min: 1,   max: 12,  step: 1,   default: 5 },
    { key: 'amount', label: 'Opacity', min: 0.1, max: 1.0, step: 0.05,default: 0.85 },
  ],
  speed_cut: [
    { key: 'frames', label: 'Cut Frames', min: 1,   max: 6,   step: 1,   default: 2,  desc: 'Black frame duration' },
    { key: 'amount', label: 'Power',      min: 0.1, max: 1.0, step: 0.05,default: 1.0 },
  ],
};

function getParamValue(effect: Effect, key: string): number {
  const defs = EFFECT_PARAM_DEFS[effect.type];
  const def = defs?.find((d) => d.key === key);
  const val = effect.params?.[key];
  return (typeof val === 'number' ? val : undefined) ?? def?.default ?? 0;
}

const DEMO_PROJECT_ID = 'local-test-video';
const DEMO_QUERY_VALUE = 'test-video';
const DEMO_CLIP_ID = 'demo-test-video-clip';
const DEMO_VIDEO_URL = '/test_video.mp4';

function createDemoTimeline(): {
  clips: Clip[];
  music_track: null;
  settings: { resolution: string; aspect_ratio: string; fps: number };
} {
  const demoClip: Clip = {
    id: DEMO_CLIP_ID,
    order: 0,
    type: 'video',
    duration_ms: 30000,
    prompt: 'Local timing test video',
    generated_media_url: DEMO_VIDEO_URL,
    shot_type: 'continuous',
    scene_group: 0,
    gen_status: 'done',
    position: { x: 0, y: 100 },
  };

  return {
    clips: [demoClip],
    music_track: null,
    settings: { resolution: '1080p', aspect_ratio: '16:9', fps: 24 },
  };
}

function formatPreviewTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function normalizeEffectType(type: EffectType | undefined): EffectType | undefined {
  if (!type) return undefined;
  if (type === 'flash_black' || type === 'red_flash') return 'flash';
  return type === 'flash_white' ? 'flash' : type;
}

// ─── Transition metadata ──────────────────────────────────────────────────────




// ─── Clip colors by type ─────────────────────────────────────────────────────

const CLIP_COLORS: Record<string, string> = {
  image: '#374151',
  video: '#1e3a5f',
  text_overlay: '#3b1f6e',
};

// ─── CSS preview animation styles ────────────────────────────────────────────

// Effects that render via background/overlay div (not container filter/transform)
const OVERLAY_EFFECT_TYPES = new Set<EffectType>([
  'flash', 'flash_white', 'flash_black', 'strobe', 'red_flash', 'overexpose', 'cross_cut',
  'scanlines', 'vhs', 'tv_noise', 'impact_lines', 'horror', 'rain',
]);

function getPreviewStyle(type: EffectType, active: boolean): React.CSSProperties {
  if (!active) return {};
  switch (type) {
    // ─ Flash / overlay ───────────────────────────────────────────
    case 'flash_white':
    case 'flash_black':    return { animation: 'amv-flash-white 0.3s ease-out infinite' };
    case 'strobe':         return { animation: 'amv-strobe 0.1s steps(2) infinite' };
    case 'red_flash':      return { animation: 'amv-red 0.3s ease-out infinite' };
    case 'overexpose':     return { animation: 'amv-overexpose 0.3s ease-out infinite' };
    case 'cross_cut':      return { animation: 'amv-xslash 0.35s ease-in-out infinite' };
    // ─ Zoom / transform (on container) ──────────────────────────
    case 'zoom_burst':     return { animation: 'amv-zoom 0.4s ease-out infinite' };
    case 'zoom_out':       return { animation: 'amv-zoomout 0.5s ease-in-out infinite' };
    case 'shake':          return { animation: 'amv-shake 0.2s linear infinite' };
    case 'heavy_shake':    return { animation: 'amv-heavy-shake 0.15s linear infinite' };
    case 'speed_ramp':     return { animation: 'amv-ramp 1s ease-in-out infinite' };
    case 'reverse':        return { animation: 'amv-reverse 0.8s ease-in-out infinite' };
    // ─ Temporal (filter on container) ───────────────────────────
    case 'echo':           return { animation: 'amv-echo 0.6s ease-out infinite' };
    case 'time_echo':      return { animation: 'amv-techo 0.4s ease-in-out infinite' };
    case 'freeze':         return { animation: 'amv-freeze 0.5s ease-in-out infinite' };
    // ─ Color / grade (filter on container) ──────────────────────
    case 'chromatic':      return { animation: 'amv-chroma 0.5s linear infinite' };
    case 'rgb_shift_v':    return { animation: 'amv-vshift 0.4s linear infinite' };
    case 'glitch':         return { animation: 'amv-glitch 0.3s steps(3) infinite' };
    case 'neon':           return { animation: 'amv-neon 0.5s ease-in-out infinite' };
    case 'invert':         return { animation: 'amv-invert 0.35s ease-in-out infinite' };
    case 'black_white':    return { animation: 'amv-bw 0.4s ease-in-out infinite' };
    case 'manga_ink':      return { animation: 'amv-manga 0.4s ease-in-out infinite' };
    case 'sepia':          return { animation: 'amv-sepia 0.5s ease-in-out infinite' };
    case 'contrast_punch': return { animation: 'amv-contrast 0.4s ease-in-out infinite' };
    case 'flicker':        return { animation: 'amv-flicker 0.15s steps(10) infinite' };
    // ─ Texture / overlay ────────────────────────────────────────
    case 'panel_split':    return { animation: 'amv-panels 0.5s ease-in-out infinite' };
    case 'letterbox':      return { animation: 'amv-letterbox 0.5s ease-in-out infinite' };
    case 'vignette':       return { animation: 'amv-vignette 0.5s ease-in-out infinite' };
    case 'film_grain':     return { animation: 'amv-grain 0.12s steps(3) infinite' };
    case 'blur_out':       return { animation: 'amv-blur 0.5s ease-in-out infinite' };
    case 'pixelate':       return { animation: 'amv-pixelate 0.2s steps(4) infinite' };
    case 'flash':          return { animation: 'amv-flash-white 0.3s ease-out infinite' };
    case 'shake_h':        return { animation: 'amv-shake-h 0.18s linear infinite' };
    case 'shake_v':        return { animation: 'amv-shake-v 0.18s linear infinite' };
    case 'zoom_pulse':     return { animation: 'amv-pulse 0.4s ease-in-out infinite' };
    case 'whip_pan':       return { animation: 'amv-whip 0.3s ease-in-out infinite' };
    case 'stutter':        return { animation: 'amv-stutter 0.2s steps(3) infinite' };
    case 'duotone':        return { animation: 'amv-duotone 0.5s ease-in-out infinite' };
    case 'lut_warm':       return { animation: 'amv-warm 0.5s ease-in-out infinite' };
    case 'lut_cold':       return { animation: 'amv-cold 0.5s ease-in-out infinite' };
    case 'cyberpunk':      return { animation: 'amv-cyberpunk 0.5s ease-in-out infinite' };
    case 'horror':         return { animation: 'amv-horror 0.5s ease-in-out infinite' };
    case 'bleach_bypass':  return { animation: 'amv-bleach 0.4s ease-in-out infinite' };
    case 'color_shift':    return { animation: 'amv-colorshift 0.6s ease-in-out infinite' };
    case 'posterize':      return { animation: 'amv-posterize 0.4s ease-in-out infinite' };
    case 'split_tone':     return { animation: 'amv-splittone 0.5s ease-in-out infinite' };
    case 'scanlines':      return { animation: 'amv-scanlines 0.15s steps(2) infinite' };
    case 'vhs':            return { animation: 'amv-vhs 0.2s steps(4) infinite' };
    case 'halftone':       return { animation: 'amv-halftone 0.4s ease-in-out infinite' };
    case 'impact_lines':   return { animation: 'amv-impact 0.3s ease-in-out infinite' };
    case 'glow_bloom':     return { animation: 'amv-bloom 0.5s ease-in-out infinite' };
    case 'tv_noise':       return { animation: 'amv-tvnoise 0.1s steps(5) infinite' };
    case 'radial_blur':    return { animation: 'amv-radial 0.4s ease-in-out infinite' };
    case 'tilt_shift':     return { animation: 'amv-tiltshift 0.5s ease-in-out infinite' };
    case 'mirror_h':       return { animation: 'amv-mirror 0.4s ease-in-out infinite' };
    case 'rain':           return { animation: 'amv-rain 0.5s linear infinite' };
    default: return {};
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isDemoMode = id === DEMO_PROJECT_ID || searchParams.get('demo') === DEMO_QUERY_VALUE;

  // Load timeline from API if store is empty (direct navigation)
  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const setProjectId = useTimelineStore((s) => s.setProjectId);
  const storeProjectId = useTimelineStore((s) => s.projectId);
  useEffect(() => {
    if (!id) return;
    setProjectId(id);

    if (isDemoMode) {
      loadTimeline(createDemoTimeline());
      return;
    }

    // Always fetch fresh from DB on mount — never trust stale store for intro/outro clips
    import('@/lib/api').then(({ api }) => {
      api.getTimeline(id).then((tl: any) => {
        loadTimeline(tl);
        if (tl.beat_map?.bpm) {
          setBpm(tl.beat_map.bpm);
        }
      }).catch(() => {});
    });
  }, [id, isDemoMode, loadTimeline, setProjectId]);

  // compiledUrl is set only when the user actively renders in this session (see handleRender)

  const clips        = useTimelineStore((s) => s.clips);
  const effects      = useTimelineStore((s) => s.effects);
  const beatMap      = useTimelineStore((s) => s.beatMap);
  const musicTrack   = useTimelineStore((s) => s.musicTrack);
  const addEffect    = useTimelineStore((s) => s.addEffect);
  const removeEffect = useTimelineStore((s) => s.removeEffect);
  const updateEffect = useTimelineStore((s) => s.updateEffect);
  const setBeatMap   = useTimelineStore((s) => s.setBeatMap);
  const setEffects   = useTimelineStore((s) => s.setEffects);
  const clearEffects = useTimelineStore((s) => s.clearEffects);
  const updateClip   = useTimelineStore((s) => s.updateClip);

  const [selectedType, setSelectedType] = useState<EffectType | null>(null);
  const [hoveredType, setHoveredType]   = useState<EffectType | null>(null);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [prePlaceDuration, setPrePlaceDuration]   = useState(200);
  const [prePlaceIntensity, setPrePlaceIntensity] = useState(0.8);
  const [prePlaceParams, setPrePlaceParams]       = useState<Record<string, number>>({});
  const [hoveredTrack, setHoveredTrack] = useState<'clips' | 'fx' | null>(null);
  const [bpm, setBpm]           = useState(() => useTimelineStore.getState().beatMap?.bpm || 128);
  const [pxPerMs, setPxPerMs]   = useState(0.1);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [flashColor, setFlashColor] = useState('#ffffff');
  const [beatSyncIntensity, setBeatSyncIntensity] = useState<string>('balanced');
  const [autoAmvLoading, setAutoAmvLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewLoadError, setPreviewLoadError] = useState<string | null>(null);
  const [compiledUrl, setCompiledUrl] = useState<string | null>(null);
  const [compiledReady, setCompiledReady] = useState(false);

  const timelineRef   = useRef<HTMLDivElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const compiledVideoRef = useRef<HTMLVideoElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const chatContentRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);

  // ── Draggable decoratives ────────────────────────────────────────────────
  const [decorEditMode, setDecorEditMode] = useState(false);
  const [decorPos, setDecorPos] = useState<Record<string, { x: number; y: number }>>({
    flower3:    { x: -383, y: 56   },
    flowers:    { x: -32,  y: -15  },
    stone2:     { x: 1352, y: 161  },
    leaf6:      { x: 828,  y: -56  },
    leaf3:      { x: 1129, y: -225 },
    flower4a:   { x: 1231, y: 5    },
    stone1r:    { x: -187, y: 95   },
    pine:       { x: -321, y: 196  },
    leaf7:      { x: 796,  y: -203 },
    stone3:     { x: -610, y: 197  },
    leaf5:      { x: -96,  y: 0    },
    leaf78:     { x: -522, y: -223 },
    stone1c:    { x: -504, y: 156  },
    leaf2:      { x: -656, y: -183 },
    flower4b:   { x: -351, y: 116  },
    leaf4:      { x: 1066, y: -230 },
    sun:        { x: 1077, y: -148 },
    flowersc:   { x: 476,  y: 210  },
    flowersc2:  { x: 541,  y: 182  },
    leaf2b:     { x: 497,  y: -208 },
    leaf3b:     { x: 539,  y: -207 },
    leaf5b:     { x: 537,  y: 236  },
    stone2b:    { x: 623,  y: 196  },
    pine2:      { x: 723,  y: -220 },
    flower3b:   { x: 694,  y: 199  },
    ud_flower3: { x: 1038, y: -203 },
    ud_flowers: { x: 770,  y: -238 },
    ud_pine:    { x: 662,  y: 234  },
    ud_leaf6:   { x: 676,  y: -219 },
    ud_leaf7:   { x: 483,  y: 207  },
    ud_flower4: { x: 792,  y: -169 },
    ud_leaf2:   { x: 850,  y: 146  },
    ud_stone1:  { x: 878,  y: -124 },
    ud_flowersc:{ x: 604,  y: -200 },
    ud_leaf78:  { x: 1425, y: 206  },
    ud_stone2:  { x: 1063, y: -250 },
    ud_stone3:  { x: 480,  y: -230 },
    ud_stone1b: { x: 1170, y: -199 },
    ud_stone2b: { x: 1267, y: -154 },
    ud_stone3b: { x: 984,  y: -226 },
    extra_l1:   { x: 1264, y: 224  },
    extra_l2:   { x: 1298, y: 189  },
    extra_l3:   { x: 1417, y: -195 },
    extra_r1:   { x: 1369, y: -209 },
    extra_r2:   { x: 1391, y: 166  },
  });
  const draggingDecor = useRef<{ key: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const startDecorDrag = useCallback((key: string, e: React.MouseEvent) => {
    if (!decorEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    draggingDecor.current = { key, startX: e.clientX, startY: e.clientY, origX: decorPos[key].x, origY: decorPos[key].y };
    const onMove = (ev: MouseEvent) => {
      if (!draggingDecor.current) return;
      const dx = ev.clientX - draggingDecor.current.startX;
      const dy = ev.clientY - draggingDecor.current.startY;
      setDecorPos(p => ({ ...p, [key]: { x: Math.round(draggingDecor.current!.origX + dx), y: Math.round(draggingDecor.current!.origY + dy) } }));
    };
    const onUp = () => { draggingDecor.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [decorEditMode, decorPos]);
  // Stable ref for playheadMs so callbacks don't go stale
  const playheadMsRef = useRef(0);

  // ── Derived values ──────────────────────────────────────────────────────

  const fallbackClips = isDemoMode && clips.length === 0 ? createDemoTimeline().clips : [];
  const timelineClips = fallbackClips.length > 0 ? fallbackClips : clips;
  const sortedClips = [...timelineClips].sort((a, b) => a.order - b.order);
  const totalMs = sortedClips.reduce((sum, c) => sum + (c.duration_ms || 3000), 0) || 30000;

  // Compute clip start times
  const clipStartMs: Record<string, number> = {};
  let acc = 0;
  for (const c of sortedClips) {
    clipStartMs[c.id] = acc;
    acc += c.duration_ms || 3000;
  }

  // ── Auto-scale px/ms on first load ─────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.clientWidth;
    const targetW = containerW * 0.8;
    const calculated = Math.min(0.5, Math.max(0.02, targetW / Math.max(totalMs, 1)));
    setPxPerMs(calculated);
  }, [totalMs]);

  // ── Autosave effects + beatMap to DB (debounced 1.5s) ──────────────────

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!id || isDemoMode) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const doSave = () => {
      const { settings } = useTimelineStore.getState();
      import('@/lib/api').then(({ api }) => {
        api.updateTimeline(id, {
          clips,
          music_track: musicTrack,
          settings,
          effects,
          beat_map: beatMap,
          total_duration_ms: totalMs,
        }).catch(() => {});
      });
    };
    pendingSaveRef.current = doSave;
    saveTimeoutRef.current = setTimeout(() => {
      doSave();
      pendingSaveRef.current = null;
    }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [clips, musicTrack, effects, beatMap, id, isDemoMode, totalMs]);

  // Flush any pending save immediately when navigating away
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        pendingSaveRef.current();
        pendingSaveRef.current = null;
      }
    };
  }, []);

  // ── Beat map generation ─────────────────────────────────────────────────

  const generateBeatMap = useCallback((bpmValue: number): BeatMap => {
    const intervalMs = (60 / bpmValue) * 1000;
    const beats: number[] = [];
    for (let t = 0; t <= totalMs + intervalMs; t += intervalMs) {
      beats.push(Math.round(t));
    }
    return { bpm: bpmValue, offset_ms: 0, beats };
  }, [totalMs]);

  useEffect(() => {
    setBeatMap(generateBeatMap(bpm));
  }, [bpm, generateBeatMap, setBeatMap]);

  // ── Chat panel GSAP slide animation ─────────────────────────────────────

  useEffect(() => {
    if (!chatPanelRef.current || !chatContentRef.current) return;
    if (chatOpen) {
      gsap.to(chatPanelRef.current, { x: 0, duration: 0.3, ease: 'power3.out' });
      gsap.fromTo(chatContentRef.current, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.25, delay: 0.1, ease: 'power2.out' });
    } else {
      gsap.to(chatContentRef.current, { opacity: 0, x: 20, duration: 0.15, ease: 'power2.in' });
      gsap.to(chatPanelRef.current, { x: '100%', duration: 0.25, delay: 0.1, ease: 'power3.in' });
    }
  }, [chatOpen]);

  // ── Auto AMV ────────────────────────────────────────────────────────────

  const handleAutoAmv = useCallback(async () => {
    if (!beatMap) return;
    setAutoAmvLoading(true);
    clearEffects();

    // ── Helpers ──────────────────────────────────────────────────────────────
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    // Clamp to timeline, sort, remove events closer than minGapMs
    const dedupe = (times: number[], minGapMs = 100): number[] => {
      const sorted = [...times].filter(t => t >= 0 && t <= totalMs).sort((a, b) => a - b);
      const out: number[] = [];
      for (const t of sorted) {
        if (out.length === 0 || t - out[out.length - 1] >= minGapMs) out.push(t);
      }
      return out;
    };
    const mkFx = (type: EffectType, ts: number, dur: number, intensity: number, params?: Record<string, number>): Effect => ({
      id: crypto.randomUUID(), type, timestamp_ms: ts, duration_ms: dur, intensity,
      ...(params && Object.keys(params).length ? { params } : {}),
    });

    // ── Pull rich music data from beatMap (all in ms, converted on upload) ──
    const crashes        = dedupe(beatMap.crashes           || [], 200);
    const energyPeaks    = dedupe(beatMap.energy_peaks      || [], 300);
    const sectionBounds  = dedupe(beatMap.section_boundaries|| [], 500);
    const downbeats      = dedupe(beatMap.downbeats         || [], 200);
    const kicks          = dedupe(beatMap.kicks             || [], 80);
    const snares         = dedupe(beatMap.snares            || [], 80);
    const horns          = dedupe(beatMap.horns             || [], 150);
    const allBeats       = dedupe(beatMap.beats             || [], 80);
    const beatStrengths  = beatMap.beat_strengths           || [];
    const energyCurve    = beatMap.energy_curve             || [];
    const energyAt = (ms: number) => energyCurve[Math.round(ms / 100)] ?? 0.5;

    // ── Event-driven fallback (uses real music events, not random beats) ─────
    const runFallback = () => {
      const effects: Effect[] = [];
      const coveredBuckets = new Set<number>(); // 100ms buckets
      const cover = (ms: number) => coveredBuckets.add(Math.round(ms / 100));
      const isCovered = (ms: number) => coveredBuckets.has(Math.round(ms / 100));

      // P1: CRASHES → heaviest impact (non-negotiable sync points)
      const crashFx: EffectType[] = ['flash_white', 'heavy_shake', 'zoom_burst', 'panel_split', 'overexpose', 'manga_ink'];
      for (const t of crashes) {
        effects.push(mkFx(pick(crashFx), t, 250, 0.85 + energyAt(t) * 0.15));
        cover(t);
        // Decay shake 150ms after crash
        if (t + 150 <= totalMs) { effects.push(mkFx('shake', t + 150, 150, 0.5)); cover(t + 150); }
      }

      // P2: ENERGY PEAKS → intense sustained effects
      const peakFx: EffectType[] = ['zoom_burst', 'overexpose', 'contrast_punch', 'neon', 'red_flash', 'manga_ink'];
      for (const t of energyPeaks) {
        if (isCovered(t)) continue;
        effects.push(mkFx(pick(peakFx), t, 300, 0.75 + energyAt(t) * 0.2));
        cover(t);
      }

      // P3: SECTION BOUNDARIES → major visual resets
      const sectionFx: EffectType[] = ['glitch', 'reverse', 'echo', 'blur_out', 'time_echo', 'freeze', 'letterbox'];
      for (const t of sectionBounds) {
        if (isCovered(t)) continue;
        effects.push(mkFx(pick(sectionFx), t, 420, 0.8));
        cover(t);
      }

      // P4: HORN STABS → bright accents
      const hornFx: EffectType[] = ['neon', 'chromatic', 'rgb_shift_v', 'contrast_punch', 'flash_white'];
      if (beatSyncIntensity !== 'chill') {
        for (const t of horns) {
          if (isCovered(t)) continue;
          effects.push(mkFx(pick(hornFx), t, 200, 0.6 + energyAt(t) * 0.25));
          cover(t);
        }
      }

      // P5: DOWNBEATS → moderate accents
      const downbeatFx: EffectType[] = ['zoom_burst', 'vignette', 'contrast_punch', 'chromatic', 'shake'];
      if (beatSyncIntensity === 'balanced' || beatSyncIntensity === 'intense' || beatSyncIntensity === 'all-out') {
        for (let i = 0; i < downbeats.length; i++) {
          const t = downbeats[i];
          if (isCovered(t)) continue;
          const str = beatStrengths[allBeats.findIndex(b => Math.abs(b - t) < 80)] ?? 0.5;
          effects.push(mkFx(pick(downbeatFx), t, 180, 0.45 + str * 0.4));
          cover(t);
        }
      }

      // P6: SNARES → sharp percussive hits
      const snareFx: EffectType[] = ['flash_white', 'chromatic', 'red_flash', 'flicker', 'rgb_shift_v'];
      if (beatSyncIntensity === 'intense' || beatSyncIntensity === 'all-out') {
        for (const t of snares) {
          if (isCovered(t)) continue;
          effects.push(mkFx(pick(snareFx), t, 120, 0.4 + energyAt(t) * 0.35));
          cover(t);
        }
      }

      // P7: KICKS → bass impact
      const kickFx: EffectType[] = ['shake', 'zoom_burst', 'contrast_punch', 'vignette', 'flicker'];
      if (beatSyncIntensity === 'intense' || beatSyncIntensity === 'all-out') {
        for (const t of kicks) {
          if (isCovered(t)) continue;
          effects.push(mkFx(pick(kickFx), t, 130, 0.35 + energyAt(t) * 0.35));
          cover(t);
        }
      }

      // P8: ALL-OUT — fill every beat
      if (beatSyncIntensity === 'all-out') {
        const fillFx: EffectType[] = ['flash_white', 'shake', 'flicker', 'chromatic', 'contrast_punch'];
        const beatInterval = beatMap.bpm > 0 ? 60000 / beatMap.bpm : 500;
        for (let i = 0; i < allBeats.length; i++) {
          const t = allBeats[i];
          if (isCovered(t)) continue;
          const str = beatStrengths[i] ?? 0.4;
          if (str < 0.3 && Math.random() > 0.5) continue;
          effects.push(mkFx(pick(fillFx), t, 100, 0.28 + str * 0.38));
          cover(t);
          // Ghost half-beat
          const half = Math.round(t + beatInterval / 2);
          if (half <= totalMs && !isCovered(half) && Math.random() > 0.6) {
            effects.push(mkFx(pick(fillFx), half, 80, 0.18 + str * 0.22));
          }
        }
      }

      // ── Guaranteed minimum: if no rich audio data and < 5 effects produced,
      //    fall back to classic beat-grid so something always happens ──────────
      if (effects.length < 5 && allBeats.length > 0) {
        const beatFx: EffectType[] = ['flash_white', 'zoom_burst', 'shake', 'chromatic', 'flicker', 'red_flash', 'contrast_punch'];
        const strongFx: EffectType[] = ['zoom_burst', 'panel_split', 'heavy_shake', 'neon', 'manga_ink', 'overexpose', 'vignette'];
        const rareFx: EffectType[] = ['echo', 'reverse', 'time_echo', 'freeze', 'blur_out', 'zoom_out', 'glitch', 'letterbox'];
        const beatInterval = beatMap.bpm > 0 ? 60000 / beatMap.bpm : 500;
        // Determine step: chill=every 4th, balanced=every 2nd, intense=every, all-out=every+half
        const step = beatSyncIntensity === 'chill' ? 4 : beatSyncIntensity === 'balanced' ? 2 : 1;
        allBeats.forEach((t, idx) => {
          if (idx % step !== 0) return;
          if (isCovered(t)) return;
          const str = beatStrengths[idx] ?? 0.5;
          if (idx % 8 === 0 && idx > 0) {
            effects.push(mkFx(pick(rareFx), t, 350, 0.6 + str * 0.3));
          } else if (idx % 4 === 0 && idx > 0) {
            effects.push(mkFx(pick(strongFx), t, 250, 0.65 + str * 0.3));
          } else {
            effects.push(mkFx(pick(beatFx), t, 150, 0.4 + str * 0.4));
          }
          cover(t);
          if (beatSyncIntensity === 'all-out') {
            const half = Math.round(t + beatInterval / 2);
            if (half <= totalMs && !isCovered(half) && Math.random() > 0.5) {
              effects.push(mkFx(pick(beatFx), half, 100, 0.25 + str * 0.25));
            }
          }
        });
      }

      setEffects(effects.sort((a, b) => a.timestamp_ms - b.timestamp_ms));
    };

    try {
      const projectState = useProjectStore.getState();
      const timelineState = useTimelineStore.getState();
      const proj = projectState.currentProject as any;
      const audioAnalysis = proj?.audio_analysis;
      const clips = timelineState.clips.filter((c: any) => c.type !== 'text_overlay');

      const availableEffects = EFFECT_TYPES.map(t => {
        const meta = EFFECT_META[t];
        const params = EFFECT_PARAM_DEFS[t];
        return `${t} (${meta?.label}): ${meta?.desc}${params ? ' | params: ' + params.map((p: any) => p.key).join(', ') : ''}`;
      }).join('\n');

      // Clip summary with start times
      const clipSummary = clips.slice(0, 20).map((c: any, i: number) => {
        let startMs = 0;
        for (let j = 0; j < i; j++) startMs += (clips[j] as any).duration_ms || 3000;
        return `[${i}] @${startMs}ms type=${c.type} shot=${c.shot_type || 'cut'} dur=${c.duration_ms}ms scene="${(c.prompt || '').slice(0, 55)}"`;
      }).join('\n');

      // ── Rich structured music data ──────────────────────────────────────────
      const fmt = (arr: number[], cap = 60) => arr.slice(0, cap).join(', ') || 'none';
      const fmtStrength = (arr: number[], str: number[], cap = 30) =>
        arr.slice(0, cap).map((t, i) => `${t}(${(str[i] ?? 0.5).toFixed(2)})`).join(', ') || 'none';

      // Energy profile: label each 2s segment HIGH/MID/LOW
      const energyProfile: string[] = [];
      for (let ms = 0; ms < totalMs; ms += 2000) {
        const s = Math.round(ms / 100), e = Math.round(Math.min(ms + 2000, totalMs) / 100);
        const seg = energyCurve.slice(s, e);
        if (!seg.length) continue;
        const avg = seg.reduce((a: number, v: number) => a + v, 0) / seg.length;
        energyProfile.push(`${ms}-${ms + 2000}ms:${avg > 0.7 ? 'HIGH' : avg > 0.4 ? 'MID' : 'LOW'}(${avg.toFixed(2)})`);
      }

      const musicData = [
        `BPM: ${beatMap.bpm} | Duration: ${(totalMs / 1000).toFixed(1)}s`,
        `Genre: ${audioAnalysis?.genre || proj?.analysis?.genre || 'unknown'} | Mood: ${audioAnalysis?.mood || proj?.analysis?.mood || 'unknown'}`,
        ``,
        `=== HIGHEST PRIORITY — MUST SYNC THESE ===`,
        `CRASHES (${crashes.length}) [flash_white/heavy_shake/zoom_burst/panel_split, intensity 0.9-1.0]:`,
        `  ${fmt(crashes)}`,
        ``,
        `ENERGY PEAKS (${energyPeaks.length}) [zoom_burst/overexpose/neon/manga_ink, intensity 0.75-0.95]:`,
        `  ${fmt(energyPeaks)}`,
        ``,
        `SECTION CHANGES (${sectionBounds.length}) [glitch/reverse/echo/blur_out, intensity 0.7-0.9]:`,
        `  ${fmt(sectionBounds)}`,
        ``,
        `=== SECONDARY — ADD BASED ON INTENSITY ===`,
        `HORN STABS (${horns.length}) [neon/chromatic/contrast_punch]:`,
        `  ${fmt(horns, 40)}`,
        ``,
        `DOWNBEATS / BAR STARTS (${downbeats.length}) [zoom_burst/vignette/shake]:`,
        `  ${fmt(downbeats, 30)}`,
        ``,
        `SNARES (${snares.length}) [flash_white/chromatic/flicker]:`,
        `  ${fmt(snares, 40)}`,
        ``,
        `KICKS (${kicks.length}) [shake/contrast_punch/zoom_burst]:`,
        `  ${fmt(kicks, 40)}`,
        ``,
        `=== ALL BEATS with strength score ===`,
        `  ${fmtStrength(allBeats, beatStrengths, 40)}`,
        ``,
        `=== ENERGY ENVELOPE (2s windows) ===`,
        `  ${energyProfile.slice(0, 20).join(' | ')}`,
      ].join('\n');

      const prompt = `You are an expert AMV (Anime Music Video) editor. Generate a cinematic, music-synced effect timeline.

PROJECT: "${proj?.title || 'Untitled'}"
STORY GENRE: ${proj?.analysis?.genre || 'unknown'} | MOOD: ${proj?.analysis?.mood || 'unknown'}
THEMES: ${(proj?.analysis?.themes || []).join(', ') || 'unknown'}

=== MUSIC DATA (all timestamps in milliseconds) ===
${musicData}

=== CLIPS (${clips.length} visual clips with start times in ms) ===
${clipSummary}

=== SYNC INTENSITY: ${beatSyncIntensity.toUpperCase()} ===
chill → only crashes+energy peaks+section changes
balanced → above + horn stabs + downbeats
intense → above + snares + kicks
all-out → everything above + fill every remaining beat

=== EFFECT PALETTE ===
${availableEffects}

=== DIRECTOR RULES ===
1. CRASHES are non-negotiable — every crash gets a heavy effect (flash_white, heavy_shake, zoom_burst, panel_split, overexpose, white_out, or speed_cut)
2. Energy peaks get strong effects matched to energy level
3. Section boundaries get "reset" effects (glitch, reverse, blur_out, echo, screen_tear, dream_glow) — structural music changes
4. Match effects to scene content: manga_ink/panel_split/panel_v/cross_cut for battle; echo/dream_glow/blur_out for emotional; neon/aura/cyberpunk for supernatural; horror/vignette/negative for dark scenes
5. High-energy regions (>0.7) → higher intensity (0.7-1.0), shorter duration; low-energy → subtle, longer duration
6. Minimum 50ms between any two effects
7. Scale effect density to the sync intensity level
8. USE PARAMS: every effect has a "power" (0.1-1.0) param — tune it. Use "color" param on flash for non-white hits. Use "angle"/"direction" on whip_pan/rgb_split_d/double_vision. Use "hue_shift" on dream_glow/aura/color_shift/duotone to match scene mood.
9. Use NEW effects freely: heartbeat (tense scenes), screen_tear (glitch moments), aura (power-up), zoom_snap (reveals), speed_cut (staccato edits), rgb_wobble (psychedelic), ink_drip (impact), mirror_v/mirror_h (surreal)

Respond ONLY with compact JSON (no markdown, no explanation):
{"effects":[{"type":"effect_type","timestamp_ms":number,"duration_ms":number,"intensity":number,"params":{"power":0.9}}]}`;

      // Skip AI call if there's no real audio analysis — fallback is better in that case
      const hasRichData = crashes.length > 0 || energyPeaks.length > 0 || sectionBounds.length > 0;
      if (!hasRichData) { runFallback(); return; }

      const currentTimeline = { clips: timelineState.clips, music_track: timelineState.musicTrack, settings: timelineState.settings };
      // 20s timeout so the button doesn't hang forever if AI service is slow/down
      const result = await Promise.race([
        api.chat(id as string, prompt, currentTimeline, []),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000)),
      ]) as any;

      // ── Parse AI response ──────────────────────────────────────────────────
      const parseEffects = (rawEffects: any[]): Effect[] =>
        rawEffects
          .filter((e: any) => EFFECT_TYPES.includes(e.type as EffectType) && typeof e.timestamp_ms === 'number')
          .map((e: any) => ({
            id: crypto.randomUUID(),
            type: e.type as EffectType,
            timestamp_ms: Math.max(0, Math.min(totalMs, e.timestamp_ms)),
            duration_ms: Math.max(50, e.duration_ms || 200),
            intensity: Math.max(0, Math.min(1, e.intensity ?? 0.8)),
            ...(e.params && Object.keys(e.params).length > 0 ? { params: e.params } : {}),
          }));

      let applied = false;
      for (const call of (result?.tool_calls || [])) {
        const fn = call.function || call;
        const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments || fn);
        const effects = parseEffects(args.effects || []);
        if (effects.length > 0) { setEffects(effects); applied = true; break; }
      }

      if (!applied && result?.message) {
        try {
          const jsonMatch = result.message.match(/\{[\s\S]*"effects"[\s\S]*\}/);
          if (jsonMatch) {
            const effects = parseEffects(JSON.parse(jsonMatch[0]).effects || []);
            if (effects.length > 0) { setEffects(effects); applied = true; }
          }
        } catch {}
      }

      if (!applied) runFallback();
    } catch (err) {
      console.warn('Auto AMV AI failed, using fallback:', err);
      runFallback();
    } finally {
      setAutoAmvLoading(false);
    }
  }, [beatMap, bpm, totalMs, clearEffects, setEffects, beatSyncIntensity, id]);

  // ── Timeline click → place effect ──────────────────────────────────────

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    const timestamp_ms = Math.max(0, Math.min(totalMs, Math.round(x / pxPerMs)));
    const compiled = compiledVideoRef.current;
    if (compiled) {
      compiled.currentTime = timestamp_ms / 1000;
      if (!compiled.paused) {
        // keep playing from new position
      }
    } else if (previewVideoRef.current && !previewVideoRef.current.paused) {
      previewVideoRef.current.pause();
      setIsPlaying(false);
    }
    setPlayheadMs(timestamp_ms);

    if (selectedType !== null) {
      const flashType: EffectType = selectedType === 'flash_white' && flashColor !== '#ffffff'
        ? 'red_flash' : selectedType;
      const flashParams = selectedType === 'flash_white' && flashColor !== '#ffffff'
        ? { color: flashColor } : undefined;
      const mergedParams = { ...prePlaceParams, ...(flashParams ?? {}) };
      addEffect({
        id: crypto.randomUUID(),
        type: flashType,
        timestamp_ms,
        duration_ms: prePlaceDuration,
        intensity: prePlaceIntensity,
        ...(Object.keys(mergedParams).length > 0 ? { params: mergedParams as Record<string, number> } : {}),
      });
    }
  }, [addEffect, flashColor, prePlaceDuration, prePlaceIntensity, prePlaceParams, pxPerMs, selectedType, totalMs]);

  // ── Cycle transition type on a clip ─────────────────────────────────────


  // ── Render ──────────────────────────────────────────────────────────────

  const handleRender = useCallback(async () => {
    if (!id || rendering) return;
    setRendering(true);
    setRenderStatus('Starting render...');
    try {
      const { clips: c, musicTrack, settings } = useTimelineStore.getState();
      // Exclude: text_overlay, title/end cards by ID, title cards by prompt, clips without media
      const EXCLUDED_CLIP_IDS = new Set(['title_card', 'end_card']);
      const TITLE_CARD_TERMS = [
        'title card', 'title screen', 'title slide', 'title page', 'title treatment',
        'title reveal', 'title sequence', 'opening title', 'title shot',
        'book title', 'movie title', 'film title', 'outro card', 'intro card',
        'end card', 'coming soon', 'the end', 'credits',
        'glowing text', 'floating text', 'text appears', 'text reads',
        'logo reveal', 'brand reveal',
      ];
      const isTitleCardClip = (cl: any) => {
        const p = (cl.prompt || '').toLowerCase();
        return TITLE_CARD_TERMS.some((t) => p.includes(t));
      };
      const renderClips = c.filter((cl: any) =>
        cl.type !== 'text_overlay' &&
        !EXCLUDED_CLIP_IDS.has(cl.id) &&
        !isTitleCardClip(cl) &&
        cl.generated_media_url
      );
      const currentTimeline = {
        clips: renderClips,
        music_track: musicTrack || null,
        settings: settings || { resolution: '1080p', aspect_ratio: '16:9', fps: 24 },
        effects,
        beat_map: beatMap,
        total_duration_ms: renderClips.reduce((s: number, cl: any) => s + (cl.duration_ms || 0), 0),
      };
      const result: any = await api.renderTrailer(id, currentTimeline);
      const jobId = result?.job_id;
      if (!jobId) { setRenderStatus('Submitted!'); return; }
      setRenderStatus('Rendering...');
      let attempts = 0;
      while (attempts < 120) {
        await new Promise((r) => setTimeout(r, 5000));
        attempts++;
        try {
          const status: any = await api.getRenderStatus(id, jobId);
          setRenderStatus(`Rendering... ${status.progress || 0}%`);
          if (status.status === 'done') {
            setRenderStatus('Done!');
            const previewUrl = status.preview_url || status.output_url;
            if (previewUrl) {
              setCompiledUrl(previewUrl);
              setCompiledReady(false);
            }
            break;
          } else if (status.status === 'error') {
            setRenderStatus(null);
            alert('Render failed: ' + (status.error || 'Unknown'));
            break;
          }
        } catch { /* keep polling */ }
      }
    } catch (err) {
      console.error('Render failed:', err);
      alert('Render failed.');
    } finally {
      setRendering(false);
      setTimeout(() => setRenderStatus(null), 4000);
    }
  }, [id, rendering, effects, beatMap]);

  // ── Effect counts per clip ──────────────────────────────────────────────

  const effectCountPerClip: Record<string, number> = {};
  for (const clip of sortedClips) {
    const start = clipStartMs[clip.id];
    const end   = start + (clip.duration_ms || 3000);
    effectCountPerClip[clip.id] = effects.filter(
      (e) => e.timestamp_ms >= start && e.timestamp_ms < end
    ).length;
  }

  const timelineWidth = Math.max(totalMs * pxPerMs, 400);

  // Beat ruler ticks
  const beatTicks = beatMap?.beats ?? [];

  // text_overlay, title_card, end_card are not real scene clips — skip for canvas preview
  const visualSortedClips = sortedClips.filter((c) => c.type !== 'text_overlay' && c.id !== 'title_card' && c.id !== 'end_card');
  const activeClip = visualSortedClips.find((clip) => {
    const start = clipStartMs[clip.id] || 0;
    const end = start + (clip.duration_ms || 3000);
    return playheadMs >= start && playheadMs < end;
  }) ?? visualSortedClips[0] ?? null;
  const activeClipStartMs = activeClip ? (clipStartMs[activeClip.id] || 0) : 0;
  const activeClipDurationMs = activeClip?.duration_ms || 3000;
  const activeClipOffsetMs = activeClip ? Math.max(0, playheadMs - activeClipStartMs) : 0;
  const activeEffect = effects.find(
    (effect) => playheadMs >= effect.timestamp_ms && playheadMs <= effect.timestamp_ms + effect.duration_ms
  ) ?? null;
  const selectedEffect = selectedEffectId
    ? effects.find((effect) => effect.id === selectedEffectId) ?? null
    : null;
  const _rawInfoType = normalizeEffectType(hoveredType ?? selectedEffect?.type ?? selectedType ?? undefined) ?? 'flash_white';
  const previewInfoType = (_rawInfoType in EFFECT_META ? _rawInfoType : 'flash_white') as EffectType;
  const previewEffectType = activeEffect ? normalizeEffectType(activeEffect.type) : null;
  const activeClipMediaUrl = activeClip?.generated_media_url || activeClip?.thumbnail_url || null;
  const activeClipIsVideo = activeClip?.type === 'video' || (activeClipMediaUrl?.includes('.mp4') ?? false);
  const canPreviewPlayback = (!!compiledUrl && compiledReady) || (activeClipIsVideo && !!activeClipMediaUrl);

  // Keep ref in sync so stable callbacks always read the latest value
  playheadMsRef.current = playheadMs;

  // Stable callback — no playheadMs/totalMs in deps (reads via ref)
  const handlePreviewPlayToggle = useCallback(async () => {
    const compiled = compiledVideoRef.current;
    if (compiled) {
      if (compiled.paused) {
        const cur = playheadMsRef.current;
        // If at/near the end, restart from beginning
        if (cur >= compiled.duration * 1000 - 50) {
          compiled.currentTime = 0;
          setPlayheadMs(0);
        }
        // Otherwise let the video play from wherever its currentTime already is
        // (don't seek — that can abort the play() promise)
        try { await compiled.play(); } catch (e: any) { if (e?.name !== 'AbortError') console.error('compiled play() failed:', e); }
      } else {
        compiled.pause();
      }
      return;
    }

    const video = previewVideoRef.current;
    if (!video || !activeClip || !activeClipIsVideo) return;

    if (video.paused) {
      const cur = playheadMsRef.current;
      const clipEndMs = activeClipStartMs + activeClipDurationMs;
      if (cur >= clipEndMs - 50) {
        video.currentTime = 0;
        setPlayheadMs(activeClipStartMs);
      } else {
        video.currentTime = Math.max(0, Math.min(cur - activeClipStartMs, activeClipDurationMs)) / 1000;
      }
      try { await video.play(); } catch (error: any) { if (error?.name !== 'AbortError') console.error('Preview playback failed:', error); }
      return;
    }
    video.pause();
  }, [activeClip, activeClipDurationMs, activeClipStartMs, activeClipIsVideo]);

  const handlePreviewSeek = useCallback((nextMs: number) => {
    const clampedMs = Math.max(0, Math.min(totalMs, nextMs));
    const compiled = compiledVideoRef.current;
    if (compiled) {
      compiled.currentTime = clampedMs / 1000;
      setPlayheadMs(clampedMs);
      return;
    }
    const video = previewVideoRef.current;
    if (video) {
      if (!video.paused) video.pause();
      const targetSeconds = Math.max(0, Math.min(clampedMs - activeClipStartMs, activeClipDurationMs)) / 1000;
      if (activeClipIsVideo) video.currentTime = targetSeconds;
    }
    setIsPlaying(false);
    setPlayheadMs(clampedMs);
  }, [activeClip?.type, activeClipIsVideo, activeClipDurationMs, activeClipStartMs, totalMs]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || !activeClip || !activeClipIsVideo || isPlaying || compiledUrl) return;
    const targetSeconds = Math.max(0, Math.min(activeClipOffsetMs, activeClipDurationMs)) / 1000;
    if (Math.abs(video.currentTime - targetSeconds) > 0.05) {
      video.currentTime = targetSeconds;
    }
  }, [activeClip, activeClipDurationMs, activeClipOffsetMs, isPlaying, compiledUrl]);

  useEffect(() => {
    setPreviewLoadError(null);
  }, [activeClip?.id, activeClip?.generated_media_url]);

  useEffect(() => {
    if (selectedEffectId && !selectedEffect) {
      setSelectedEffectId(null);
    }
  }, [selectedEffect, selectedEffectId]);

  useEffect(() => {
    if (!selectedEffect) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      event.preventDefault();
      removeEffect(selectedEffect.id);
      setSelectedEffectId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeEffect, selectedEffect]);

  return (
    <div className="h-screen flex flex-col text-white overflow-hidden" style={{ backgroundImage: 'url(/stylized_imgs/dark_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {/* Inline keyframes */}
      <style>{`
        /* ── Flash / overlay ── */
        @keyframes amv-flash-white  { 0%,100%{background:transparent} 50%{background:rgba(255,255,255,0.9)} }
        @keyframes amv-flash-black  { 0%,100%{background:transparent} 50%{background:rgba(0,0,0,0.95)} }
        @keyframes amv-strobe       { 0%{background:rgba(255,255,255,0.95)} 50%{background:transparent} }
        @keyframes amv-red          { 0%,100%{background:transparent} 50%{background:rgba(220,38,38,0.78)} }
        @keyframes amv-overexpose   { 0%,100%{background:transparent} 50%{background:rgba(255,255,255,0.72)} }
        @keyframes amv-xslash       { 0%,100%{background:transparent;opacity:0} 50%{opacity:1;background:repeating-linear-gradient(45deg,rgba(255,255,255,0.88) 0,rgba(255,255,255,0.88) 4px,transparent 4px,transparent 48px),repeating-linear-gradient(-45deg,rgba(255,255,255,0.88) 0,rgba(255,255,255,0.88) 4px,transparent 4px,transparent 48px)} }
        /* ── Zoom / transform ── */
        @keyframes amv-zoom         { 0%{transform:scale(1)} 50%{transform:scale(1.45)} 100%{transform:scale(1)} }
        @keyframes amv-zoomout      { 0%,100%{transform:scale(1)} 50%{transform:scale(0.76)} }
        @keyframes amv-shake        { 0%{transform:translate(0,0)} 25%{transform:translate(-6px,3px)} 50%{transform:translate(6px,-3px)} 75%{transform:translate(-4px,4px)} 100%{transform:translate(0,0)} }
        @keyframes amv-heavy-shake  { 0%{transform:translate(0,0) rotate(0)} 12%{transform:translate(-20px,11px) rotate(-2deg)} 25%{transform:translate(20px,-13px) rotate(2deg)} 38%{transform:translate(-16px,9px) rotate(-1.5deg)} 50%{transform:translate(16px,-10px) rotate(1.5deg)} 62%{transform:translate(-12px,7px) rotate(-1deg)} 75%{transform:translate(10px,-7px)} 88%{transform:translate(-6px,4px)} 100%{transform:translate(0,0) rotate(0)} }
        @keyframes amv-ramp         { 0%{filter:blur(3px);transform:scaleX(0.88)} 100%{filter:none;transform:scaleX(1)} }
        @keyframes amv-reverse      { 0%{transform:scaleX(1)} 50%{transform:scaleX(-1)} 100%{transform:scaleX(1)} }
        /* ── Temporal / opacity ── */
        @keyframes amv-echo         { 0%{opacity:1} 40%{opacity:0.3;transform:scale(1.06)} 100%{opacity:1} }
        @keyframes amv-techo        { 0%,100%{opacity:1;transform:translate(0,0)} 30%{opacity:0.65;transform:translate(3px,2px)} 60%{opacity:0.82;transform:translate(-2px,-1px)} }
        @keyframes amv-freeze       { 0%,100%{opacity:1;filter:none} 50%{opacity:0.88;filter:blur(1.5px) brightness(1.2)} }
        @keyframes amv-flicker      { 0%{opacity:1} 14%{opacity:0.15} 28%{opacity:1} 42%{opacity:0.5} 57%{opacity:1} 71%{opacity:0.1} 85%{opacity:1} 100%{opacity:1} }
        /* ── Color / grade ── */
        @keyframes amv-chroma       { 0%{filter:none} 33%{filter:drop-shadow(3px 0 0 rgba(255,0,100,0.9)) drop-shadow(-3px 0 0 rgba(0,200,255,0.9))} 66%{filter:drop-shadow(-4px 0 0 rgba(255,0,100,0.7)) drop-shadow(4px 0 0 rgba(0,200,255,0.7))} 100%{filter:none} }
        @keyframes amv-vshift       { 0%,100%{filter:none} 33%{filter:drop-shadow(0 10px 0 rgba(255,0,80,0.85)) drop-shadow(0 -10px 0 rgba(0,150,255,0.85))} 66%{filter:drop-shadow(0 -7px 0 rgba(255,0,80,0.6)) drop-shadow(0 7px 0 rgba(0,150,255,0.6))} }
        @keyframes amv-glitch       { 0%{filter:none} 33%{filter:hue-rotate(90deg) saturate(3)} 66%{filter:invert(1) brightness(2)} 100%{filter:none} }
        @keyframes amv-neon         { 0%,100%{filter:none} 50%{filter:hue-rotate(280deg) saturate(6) brightness(1.5)} }
        @keyframes amv-invert       { 0%,100%{filter:none} 50%{filter:invert(1) hue-rotate(180deg)} }
        @keyframes amv-bw           { 0%,100%{filter:none} 50%{filter:grayscale(1) contrast(1.4)} }
        @keyframes amv-manga        { 0%,100%{filter:none} 50%{filter:grayscale(1) contrast(6) brightness(0.55)} }
        @keyframes amv-sepia        { 0%,100%{filter:none} 50%{filter:sepia(1) contrast(1.2) brightness(1.1)} }
        @keyframes amv-contrast     { 0%,100%{filter:none} 50%{filter:contrast(5) brightness(0.62) saturate(0)} }
        /* ── Texture / fx ── */
        @keyframes amv-panels       { 0%,100%{clip-path:inset(0 0 0 0)} 50%{clip-path:inset(0 30% 0 0)} }
        @keyframes amv-letterbox    { 0%,100%{clip-path:inset(0 0 0 0)} 50%{clip-path:inset(12% 0 12% 0)} }
        @keyframes amv-vignette     { 0%,100%{box-shadow:inset 0 0 0 rgba(0,0,0,0)} 50%{box-shadow:inset 0 0 120px rgba(0,0,0,0.95)} }
        @keyframes amv-grain        { 0%{filter:contrast(1.2) brightness(0.88) saturate(0.7)} 33%{filter:contrast(1.45) brightness(1.06) saturate(0.55)} 66%{filter:contrast(0.9) brightness(0.93)} 100%{filter:contrast(1.2) brightness(0.88) saturate(0.7)} }
        @keyframes amv-blur         { 0%,100%{filter:none} 50%{filter:blur(14px) brightness(1.1)} }
        @keyframes amv-pixelate     { 0%,100%{filter:none} 50%{filter:blur(3px) contrast(8) saturate(0)} }
        /* ── New effects ── */
        @keyframes amv-shake-h    { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
        @keyframes amv-shake-v    { 0%,100%{transform:translateY(0)} 25%{transform:translateY(-8px)} 75%{transform:translateY(8px)} }
        @keyframes amv-pulse      { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
        @keyframes amv-whip       { 0%,100%{filter:none} 50%{filter:blur(12px) brightness(1.3)} }
        @keyframes amv-stutter    { 0%{opacity:1;transform:translate(0,0)} 33%{opacity:0.4;transform:translate(2px,0)} 66%{opacity:1;transform:translate(-2px,1px)} 100%{opacity:1;transform:translate(0,0)} }
        @keyframes amv-duotone    { 0%,100%{filter:none} 50%{filter:hue-rotate(200deg) saturate(4) contrast(1.3)} }
        @keyframes amv-warm       { 0%,100%{filter:none} 50%{filter:sepia(0.6) saturate(1.8) brightness(1.1)} }
        @keyframes amv-cold       { 0%,100%{filter:none} 50%{filter:hue-rotate(195deg) saturate(1.8) brightness(1.05)} }
        @keyframes amv-cyberpunk  { 0%,100%{filter:none} 50%{filter:hue-rotate(150deg) saturate(3) contrast(1.4)} }
        @keyframes amv-horror     { 0%,100%{filter:none;box-shadow:none} 50%{filter:saturate(0.3) brightness(0.7);box-shadow:inset 0 0 80px rgba(180,0,0,0.7)} }
        @keyframes amv-bleach     { 0%,100%{filter:none} 50%{filter:saturate(0.15) contrast(2.5) brightness(1.1)} }
        @keyframes amv-colorshift { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }
        @keyframes amv-posterize  { 0%,100%{filter:none} 50%{filter:contrast(8) brightness(1.1) saturate(1.5)} }
        @keyframes amv-splittone  { 0%,100%{filter:none} 50%{filter:hue-rotate(30deg) saturate(2) contrast(1.2)} }
        @keyframes amv-scanlines  { 0%{filter:contrast(1.1)} 50%{filter:contrast(1.3) brightness(0.85)} }
        @keyframes amv-vhs        { 0%{filter:none;transform:translate(0,0)} 25%{filter:hue-rotate(180deg) saturate(0.5);transform:translate(3px,0)} 50%{filter:none;transform:translate(-2px,1px)} 75%{filter:saturate(2);transform:translate(0,-1px)} 100%{filter:none;transform:translate(0,0)} }
        @keyframes amv-halftone   { 0%,100%{filter:none} 50%{filter:contrast(6) grayscale(0.5) brightness(1.1)} }
        @keyframes amv-impact     { 0%,100%{filter:none} 50%{filter:brightness(1.6) contrast(2) saturate(0)} }
        @keyframes amv-bloom      { 0%,100%{filter:none} 50%{filter:blur(4px) brightness(1.5) saturate(1.3)} }
        @keyframes amv-tvnoise    { 0%{filter:contrast(1.2) brightness(0.9)} 20%{filter:invert(0.1) brightness(1.2)} 40%{filter:contrast(0.7) brightness(0.8) saturate(0)} 60%{filter:brightness(1.1)} 80%{filter:contrast(1.5) brightness(0.95) saturate(0.5)} 100%{filter:contrast(1.2) brightness(0.9)} }
        @keyframes amv-radial     { 0%,100%{filter:none;transform:scale(1)} 50%{filter:blur(6px);transform:scale(1.06)} }
        @keyframes amv-tiltshift  { 0%,100%{filter:none} 50%{filter:blur(5px) saturate(1.5)} }
        @keyframes amv-mirror     { 0%,100%{transform:scaleX(1)} 50%{transform:scaleX(-1)} }
        @keyframes amv-rain       { 0%{filter:none;opacity:0.9} 50%{filter:blur(0.5px) brightness(0.9) saturate(0.8);opacity:1} 100%{filter:none;opacity:0.9} }
        @keyframes playhead-pulse   { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes frame-glow       { 0%,100%{opacity:0.55;box-shadow:none} 50%{opacity:1;box-shadow:0 0 18px var(--frame-color,#a855f7),inset 0 0 12px var(--frame-color,#a855f7)} }
        @keyframes corner-pulse     { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
        .timeline-scroll::-webkit-scrollbar { height: 6px; }
        .timeline-scroll::-webkit-scrollbar-track { background: #111; }
        .timeline-scroll::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
        .palette-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .palette-scroll::-webkit-scrollbar-track { background: #111; }
        .palette-scroll::-webkit-scrollbar-thumb { background: #333; border-radius: 999px; }
      `}</style>

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <header className="h-12 border-b border-[#333] flex items-center px-4 gap-3 shrink-0 bg-black/75 backdrop-blur-sm">
        <Link href={`/project/${id}`} className="text-[#888] hover:text-white transition-colors flex items-center gap-1.5 text-sm">
          <ArrowLeft size={16} />
          <span className="text-xs tracking-widest" style={{ fontFamily: 'var(--font-manga)' }}>BACK</span>
        </Link>

        <div className="w-px h-5 bg-[#333] mx-1" />

        <span className="font-bold tracking-widest text-sm text-white" style={{ fontFamily: 'var(--font-manga)' }}>
          AMV TIMELINE EDITOR
        </span>

        <div className="w-px h-5 bg-[#333] mx-1" />

        {/* BPM control */}
        <div className="flex items-center gap-2">
          <Music size={13} className="text-[#888]" />
          <span className="text-xs text-[#888] tracking-wider" style={{ fontFamily: 'var(--font-manga)' }}>BPM</span>
          <input
            type="number"
            value={bpm}
            min={60}
            max={300}
            onChange={(e) => setBpm(Math.max(60, Math.min(300, Number(e.target.value))))}
            className="w-16 bg-[#1a1a1a] border border-[#333] text-white text-xs px-2 py-1 text-center focus:outline-none focus:border-[#555]"
            style={{ fontFamily: 'var(--font-manga)' }}
          />
        </div>

        <div className="w-px h-5 bg-[#333] mx-1" />

        {/* Beat sync intensity */}
        <div className="flex items-center border border-[#333]">
          {INTENSITY_LEVELS.map((l) => (
            <button
              key={l.key}
              onClick={() => {
                setBeatSyncIntensity(l.key);
                const audioAnalysis = useProjectStore.getState().currentProject?.audio_analysis;
                if (!audioAnalysis) return;
                const state = useTimelineStore.getState();
                const visualClips = [...state.clips].filter((c: any) => c.type !== 'text_overlay').sort((a: any, b: any) => a.order - b.order);
                const durations = computeBeatSync(audioAnalysis, visualClips.length, l.key);
                visualClips.forEach((c: any, i: number) => state.updateClip(c.id, { duration_ms: durations[i] }));
                const updated = useTimelineStore.getState();
                api.updateTimeline(id!, { clips: updated.clips, music_track: updated.musicTrack, settings: updated.settings }).catch(() => {});
              }}
              className={`px-2.5 py-1.5 text-[0.55rem] font-bold tracking-widest transition-colors border-r border-[#333] last:border-r-0 ${
                beatSyncIntensity === l.key
                  ? 'bg-[#a855f7] text-white'
                  : 'bg-[#1a1a1a] text-[#666] hover:text-white hover:bg-[#2a2a2a]'
              }`}
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              {l.label.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Effect count badge */}
          <span className="text-xs text-[#999] tracking-wider" style={{ fontFamily: 'var(--font-manga)' }}>
            {effects.length} EFFECTS
          </span>

          {effects.length > 0 && (
            <button
              onClick={clearEffects}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-[#888] hover:text-red-400 border border-[#333] hover:border-red-400 transition-colors"
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              <Trash2 size={12} /> CLEAR
            </button>
          )}

          <button
            onClick={handleAutoAmv}
            disabled={autoAmvLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#fbbf24] text-black font-bold border border-[#fbbf24] hover:bg-[#f59e0b] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            {autoAmvLoading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            {autoAmvLoading ? 'GENERATING...' : 'AUTO AMV'}
          </button>

          <button
            onClick={() => setChatOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border transition-colors ${chatOpen ? 'bg-[#2563eb] text-white border-[#2563eb]' : 'border-[#333] text-[#888] hover:text-white hover:border-[#555]'}`}
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            <MessageSquare size={13} /> COPILOT
          </button>

          <button
            onClick={handleRender}
            disabled={rendering}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white text-black font-bold border border-white hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors"
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            {rendering ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {renderStatus || 'RENDER'}
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 flex overflow-hidden">
        {/* Timeline content */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-y-auto overflow-x-hidden">

        {/* ── PREVIEW AREA ─────────────────────────────────────────────── */}
        <div ref={previewAreaRef} className="relative h-[14rem] border-b border-[#333] flex flex-nowrap items-center justify-center gap-6 px-6 py-4 shrink-0 lg:h-[16rem] lg:gap-10 overflow-hidden" style={{ backgroundImage: 'url(/stylized_imgs/dark_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>


          {/* Decorative stylized elements — draggable in edit mode */}
          {([
            { key: 'flower3',  src: 'flower3.png',  w: 208, rot: 'rotate(-18deg) scaleX(-1)', op: 0.62, br: 0.6  },
            { key: 'flowers',  src: 'flowers.png',  w: 192, rot: 'rotate(10deg)',              op: 0.58, br: 0.55 },
            { key: 'stone2',   src: 'stone2.png',   w: 112, rot: 'rotate(-5deg)',              op: 0.52, br: 0.5  },
            { key: 'leaf6',    src: 'leaf6.png',    w: 128, rot: 'rotate(-30deg) scaleX(-1)',  op: 0.42, br: 0.55 },
            { key: 'leaf3',    src: 'leaf3.png',    w: 80,  rot: 'rotate(20deg)',              op: 0.36, br: 0.5  },
            { key: 'flower4a', src: 'flower4.png',  w: 96,  rot: 'rotate(14deg) scaleX(-1)',  op: 0.4,  br: 0.55 },
            { key: 'stone1r',  src: 'stone1.png',   w: 176, rot: 'rotate(5deg)',              op: 0.58, br: 0.5  },
            { key: 'pine',     src: 'pine.png',     w: 144, rot: '',                           op: 0.45, br: 0.5  },
            { key: 'leaf7',    src: 'leaf7.png',    w: 160, rot: 'rotate(16deg) scaleX(-1)',  op: 0.52, br: 0.55 },
            { key: 'stone3',   src: 'stone3.png',   w: 160, rot: 'rotate(-8deg)',             op: 0.46, br: 0.48 },
            { key: 'leaf5',    src: 'leaf5.png',    w: 80,  rot: 'rotate(28deg) scaleX(-1)',  op: 0.38, br: 0.5  },
            { key: 'leaf78',   src: 'leaf78.png',   w: 88,  rot: 'rotate(-22deg)',            op: 0.35, br: 0.5  },
            { key: 'stone1c',  src: 'stone1.png',   w: 112, rot: 'rotate(12deg)',             op: 0.38, br: 0.52 },
            { key: 'leaf2',    src: 'leaf2.png',    w: 96,  rot: 'rotate(-28deg) scaleX(-1)', op: 0.42, br: 0.55 },
            { key: 'flower4b', src: 'flower4.png',  w: 112, rot: 'rotate(18deg)',             op: 0.4,  br: 0.55 },
            { key: 'leaf4',    src: 'leaf4.png',    w: 80,  rot: 'rotate(-40deg)',            op: 0.33, br: 0.5  },
            // extras
            { key: 'sun',       src: 'sun.png',              w: 100, rot: 'rotate(15deg)',                        op: 0.4,  br: 0.55 },
            { key: 'flowersc',  src: 'flowers copy.png',     w: 120, rot: 'rotate(-12deg)',                       op: 0.45, br: 0.6  },
            { key: 'flowersc2', src: 'flowers copy 2.png',   w: 130, rot: 'rotate(8deg) scaleX(-1)',              op: 0.45, br: 0.6  },
            { key: 'leaf2b',    src: 'leaf2.png',   w: 110, rot: 'rotate(35deg)',                                 op: 0.4,  br: 0.55 },
            { key: 'leaf3b',    src: 'leaf3.png',   w: 100, rot: 'rotate(-18deg) scaleX(-1)',                     op: 0.38, br: 0.55 },
            { key: 'leaf5b',    src: 'leaf5.png',   w: 95,  rot: 'rotate(22deg)',                                 op: 0.38, br: 0.5  },
            { key: 'stone2b',   src: 'stone2.png',  w: 130, rot: 'rotate(10deg)',                                 op: 0.45, br: 0.5  },
            { key: 'pine2',     src: 'pine.png',    w: 120, rot: 'rotate(-5deg) scaleX(-1)',                      op: 0.42, br: 0.5  },
            { key: 'flower3b',  src: 'flower3.png', w: 140, rot: 'rotate(20deg)',                                 op: 0.45, br: 0.6  },
            // upside-down variants
            { key: 'ud_flower3',  src: 'flower3.png',        w: 180, rot: 'rotate(180deg) scaleX(-1)',            op: 0.45, br: 0.6  },
            { key: 'ud_flowers',  src: 'flowers.png',        w: 170, rot: 'rotate(180deg)',                       op: 0.42, br: 0.55 },
            { key: 'ud_pine',     src: 'pine.png',           w: 130, rot: 'rotate(180deg)',                       op: 0.4,  br: 0.5  },
            { key: 'ud_leaf6',    src: 'leaf6.png',          w: 120, rot: 'rotate(180deg) scaleX(-1)',            op: 0.4,  br: 0.55 },
            { key: 'ud_leaf7',    src: 'leaf7.png',          w: 140, rot: 'rotate(180deg)',                       op: 0.45, br: 0.55 },
            { key: 'ud_flower4',  src: 'flower4.png',        w: 110, rot: 'rotate(180deg)',                       op: 0.4,  br: 0.55 },
            { key: 'ud_leaf2',    src: 'leaf2.png',          w: 100, rot: 'rotate(180deg) scaleX(-1)',            op: 0.38, br: 0.55 },
            { key: 'ud_stone1',   src: 'stone1.png',         w: 140, rot: 'rotate(180deg)',                       op: 0.42, br: 0.5  },
            { key: 'ud_flowersc', src: 'flowers copy.png',   w: 120, rot: 'rotate(180deg) scaleX(-1)',            op: 0.42, br: 0.6  },
            { key: 'ud_leaf78',   src: 'leaf78.png',         w: 100, rot: 'rotate(180deg)',                       op: 0.38, br: 0.5  },
            { key: 'ud_stone2',   src: 'stone2.png',         w: 150, rot: 'rotate(180deg)',                       op: 0.44, br: 0.5  },
            { key: 'ud_stone3',   src: 'stone3.png',         w: 160, rot: 'rotate(180deg) scaleX(-1)',            op: 0.44, br: 0.48 },
            { key: 'ud_stone1b',  src: 'stone1.png',         w: 120, rot: 'rotate(180deg) scaleX(-1)',            op: 0.4,  br: 0.5  },
            { key: 'ud_stone2b',  src: 'stone2.png',         w: 130, rot: 'rotate(175deg)',                       op: 0.42, br: 0.5  },
            { key: 'ud_stone3b',  src: 'stone3.png',         w: 110, rot: 'rotate(185deg)',                       op: 0.4,  br: 0.48 },
            // new both sides
            { key: 'extra_l1',  src: 'leaf4.png',           w: 120, rot: 'rotate(180deg) scaleX(-1)',            op: 0.42, br: 0.55 },
            { key: 'extra_l2',  src: 'flowers copy 2.png',  w: 150, rot: 'rotate(180deg)',                       op: 0.42, br: 0.6  },
            { key: 'extra_l3',  src: 'stone2.png',          w: 145, rot: 'rotate(178deg) scaleX(-1)',            op: 0.44, br: 0.5  },
            { key: 'extra_r1',  src: 'leaf3.png',           w: 130, rot: 'rotate(-15deg)',                       op: 0.42, br: 0.55 },
            { key: 'extra_r2',  src: 'flower3.png',         w: 155, rot: 'rotate(12deg) scaleX(-1)',             op: 0.44, br: 0.6  },
          ] as const).map(({ key, src, w, rot, op, br }) => {
            const pos = decorPos[key];
            const isRight = pos.x < 0;
            const posStyle: React.CSSProperties = isRight
              ? { right: -pos.x, bottom: pos.y < 0 ? -pos.y : undefined, top: pos.y >= 0 ? pos.y : undefined }
              : { left: pos.x,   bottom: pos.y < 0 ? -pos.y : undefined, top: pos.y >= 0 ? pos.y : undefined };
            return (
              <img
                key={key}
                src={`/stylized_imgs/${src}`}
                alt="" aria-hidden
                className={`absolute select-none ${decorEditMode ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
                style={{
                  ...posStyle,
                  width: w,
                  opacity: decorEditMode ? Math.min(op + 0.2, 1) : op,
                  filter: `brightness(${br}) saturate(0)`,
                  transform: rot || undefined,
                  outline: decorEditMode ? '1px dashed #a855f7' : 'none',
                  zIndex: decorEditMode ? 40 : 0,
                }}
                onMouseDown={(e) => startDecorDrag(key, e)}
              />
            );
          })}
          <div className="relative h-[11.5rem] w-[20rem] shrink-0 border border-[#333] bg-[#1a1a1a] overflow-hidden lg:h-[13.5rem] lg:w-[24rem]">
            {/* Manga halftone bg */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle, #2a2a2a 1px, transparent 1px)',
                backgroundSize: '8px 8px',
              }}
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={previewEffectType ? getPreviewStyle(previewEffectType, true) : {}}
            >
              {compiledUrl ? (
                <video
                  key={compiledUrl}
                  ref={compiledVideoRef}
                  src={compiledUrl}
                  className="h-full w-full object-cover"
                  playsInline
                  preload="auto"
                  onCanPlay={() => setCompiledReady(true)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => { setIsPlaying(false); }}
                  onTimeUpdate={(event) => {
                    const ms = Math.round(event.currentTarget.currentTime * 1000);
                    playheadMsRef.current = ms;
                    setPlayheadMs(ms);
                  }}
                  onError={(e) => { console.error('Compiled video error', e); setPreviewLoadError('Compiled video unavailable — try re-rendering'); }}
                />
              ) : activeClipIsVideo && activeClipMediaUrl ? (
                <video
                  key={`${activeClip!.id}-${activeClipMediaUrl}`}
                  ref={previewVideoRef}
                  src={activeClipMediaUrl}
                  className="h-full w-full object-cover"
                  playsInline
                  preload="metadata"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={(event) => {
                    const nextMs = activeClipStartMs + Math.round(event.currentTarget.currentTime * 1000);
                    setPlayheadMs(Math.min(totalMs, nextMs));
                  }}
                  onCanPlay={() => setPreviewLoadError(null)}
                  onError={() => {
                    setIsPlaying(false);
                    setPreviewLoadError(`Failed to load ${activeClipMediaUrl}`);
                  }}
                  onLoadedMetadata={(event) => {
                    if (activeClip.id !== DEMO_CLIP_ID) return;
                    const durationMs = Math.max(1000, Math.round(event.currentTarget.duration * 1000));
                    if (Math.abs(durationMs - activeClip.duration_ms) > 250) {
                      updateClip(activeClip.id, { duration_ms: durationMs });
                    }
                  }}
                />
              ) : activeClipMediaUrl ? (
                <img
                  src={activeClipMediaUrl}
                  alt={activeClip?.prompt || 'Timeline preview'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="text-2xl tracking-[0.2em] text-white font-bold"
                    style={{ fontFamily: 'var(--font-manga)', textShadow: `0 0 20px ${EFFECT_META[previewInfoType].color}` }}
                  >
                    {EFFECT_META[previewInfoType].label}
                  </span>
                </div>
              )}
            </div>
            {previewLoadError && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 px-4 text-center">
                <span className="text-[0.65rem] text-red-300">{previewLoadError}</span>
              </div>
            )}
            {compiledUrl && (
              <div className="absolute top-2 right-2 z-20 flex items-center gap-1 px-1.5 py-0.5 bg-[#a855f7]/80 text-white text-[0.55rem] font-bold tracking-widest" style={{ fontFamily: 'var(--font-manga)' }}>
                {compiledReady ? null : <Loader2 size={8} className="animate-spin" />}
                COMPILED
              </div>
            )}
            {canPreviewPlayback && !previewLoadError && (
              <button
                onClick={handlePreviewPlayToggle}
                className="absolute left-4 top-4 z-20 flex items-center gap-2 border border-white/20 bg-black/70 px-3 py-2 text-[0.75rem] font-bold tracking-[0.18em] text-white backdrop-blur-sm transition-colors hover:border-[#fbbf24] hover:text-[#fbbf24]"
                style={{ fontFamily: 'var(--font-manga)' }}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                {isPlaying ? 'PAUSE' : 'PLAY'}
              </button>
            )}
            {compiledUrl && !compiledReady && !previewLoadError && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
                <Loader2 size={28} className="text-[#a855f7] animate-spin" />
              </div>
            )}
            {previewEffectType && OVERLAY_EFFECT_TYPES.has(previewEffectType) && (
              <div className="absolute inset-0 pointer-events-none z-10" style={getPreviewStyle(previewEffectType, true)} />
            )}
            {/* ── Manga frame ────────────────────────────────────── */}
            {(() => {
              const fc = EFFECT_META[previewInfoType].color;
              const active = !!previewEffectType;
              const cs = 18; // corner size px
              const ct = 2;  // corner thickness px
              const corner = (pos: string) => {
                const top = pos.includes('t'); const left = pos.includes('l');
                return (
                  <div
                    key={pos}
                    className="absolute pointer-events-none"
                    style={{
                      width: cs, height: cs,
                      top: top ? 6 : undefined, bottom: top ? undefined : 6,
                      left: left ? 6 : undefined, right: left ? undefined : 6,
                      borderTop: top ? `${ct}px solid ${fc}` : 'none',
                      borderBottom: top ? 'none' : `${ct}px solid ${fc}`,
                      borderLeft: left ? `${ct}px solid ${fc}` : 'none',
                      borderRight: left ? 'none' : `${ct}px solid ${fc}`,
                      opacity: active ? 1 : 0.45,
                      animation: active ? 'corner-pulse 0.8s ease-in-out infinite' : undefined,
                    }}
                  />
                );
              };
              return (
                <>
                  {/* Glowing outer border */}
                  <div
                    className="absolute inset-0 border pointer-events-none"
                    style={{
                      borderColor: fc,
                      '--frame-color': fc,
                      animation: active ? 'frame-glow 0.6s ease-in-out infinite' : undefined,
                      opacity: active ? undefined : 0.3,
                    } as React.CSSProperties}
                  />
                  {/* Corner brackets */}
                  {['tl','tr','bl','br'].map(corner)}
                  {/* Center crosshair tick marks */}
                  <div className="absolute top-1/2 left-0 w-1.5 pointer-events-none" style={{ height: 1, backgroundColor: fc, opacity: active ? 0.6 : 0.2 }} />
                  <div className="absolute top-1/2 right-0 w-1.5 pointer-events-none" style={{ height: 1, backgroundColor: fc, opacity: active ? 0.6 : 0.2 }} />
                  <div className="absolute left-1/2 top-0 h-1.5 pointer-events-none" style={{ width: 1, backgroundColor: fc, opacity: active ? 0.6 : 0.2 }} />
                  <div className="absolute left-1/2 bottom-0 h-1.5 pointer-events-none" style={{ width: 1, backgroundColor: fc, opacity: active ? 0.6 : 0.2 }} />
                </>
              );
            })()}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/55 to-transparent px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.72rem] tracking-[0.22em] text-white/70" style={{ fontFamily: 'var(--font-manga)' }}>
                  {isDemoMode ? 'DEMO VIDEO' : activeClip ? activeClip.type.toUpperCase() : 'PREVIEW'}
                </span>
                <span className="text-[0.72rem] text-white/70">
                  {(playheadMs / 1000).toFixed(2)}s / {(totalMs / 1000).toFixed(2)}s
                </span>
              </div>
              <p className="truncate text-[0.8rem] text-white/80">
                {activeClip?.prompt || 'Place an effect on the timeline to preview it during playback.'}
              </p>
            </div>
          </div>

          {/* Effect info */}
          <div className="flex flex-col gap-3 min-w-[280px] h-full overflow-y-auto py-1" style={{ scrollbarWidth: 'none' }}>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: EFFECT_META[previewInfoType].color }}
              />
              <span
                className="text-lg font-bold tracking-[0.16em] text-white"
                style={{ fontFamily: 'var(--font-manga)' }}
              >
                {EFFECT_META[previewInfoType].label}
              </span>
            </div>
            <p className="max-w-[280px] text-sm text-[#888] leading-relaxed">
              {EFFECT_META[previewInfoType].desc}
            </p>
            <div className="w-full max-w-[360px]">
              <input
                type="range"
                min={0}
                max={Math.max(totalMs, 1)}
                step={50}
                value={Math.min(playheadMs, totalMs)}
                onChange={(e) => handlePreviewSeek(Number(e.target.value))}
                className="w-full cursor-pointer accent-[#fbbf24]"
              />
              <div className="mt-1 flex items-center justify-between text-xs text-[#999]">
                <span>{formatPreviewTime(playheadMs)}</span>
                <span>{activeClip ? `${formatPreviewTime(activeClipOffsetMs)} in clip` : 'no clip'}</span>
                <span>{formatPreviewTime(totalMs)}</span>
              </div>
            </div>
            {selectedEffect && (
              <div className="w-full max-w-[360px] border border-[#333] px-3 py-3" style={{ backgroundImage: 'url(/stylized_imgs/dark_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[0.72rem] tracking-[0.18em] text-[#888]" style={{ fontFamily: 'var(--font-manga)' }}>
                      EFFECT DURATION
                    </span>
                    <span className="text-sm text-[#fbbf24]">
                      {(selectedEffect.duration_ms / 1000).toFixed(2)}s
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      removeEffect(selectedEffect.id);
                      setSelectedEffectId(null);
                    }}
                    className="flex items-center gap-1.5 border border-red-500/40 px-2.5 py-1.5 text-[0.72rem] text-red-300 transition-colors hover:border-red-400 hover:text-red-200"
                    style={{ fontFamily: 'var(--font-manga)' }}
                  >
                    <Trash2 size={12} />
                    DELETE
                  </button>
                </div>
                <input
                  type="range"
                  min={50}
                  max={2000}
                  step={25}
                  value={selectedEffect.duration_ms}
                  onChange={(e) => updateEffect(selectedEffect.id, { duration_ms: Number(e.target.value) })}
                  className="mt-2 w-full cursor-pointer accent-[#fbbf24]"
                />
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-[#999]">ms</span>
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    step={25}
                    value={selectedEffect.duration_ms}
                    onChange={(e) => {
                      const value = Math.max(50, Math.min(5000, Number(e.target.value) || 50));
                      updateEffect(selectedEffect.id, { duration_ms: value });
                    }}
                    className="w-28 bg-[#1a1a1a] border border-[#333] px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#555]"
                  />
                </div>
                {/* ── Per-effect param controls ─────────────────────── */}
                {(EFFECT_PARAM_DEFS[selectedEffect.type]?.length ?? 0) > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#2a2a2a] space-y-2.5">
                    <span className="text-[0.65rem] tracking-[0.2em] text-[#555]" style={{ fontFamily: 'var(--font-manga)' }}>
                      EFFECT PARAMS
                    </span>
                    {EFFECT_PARAM_DEFS[selectedEffect.type]!.map((def) => {
                      const val = getParamValue(selectedEffect, def.key);
                      if (def.type === 'color_hex') {
                        const hexStr = '#' + Math.max(0, Math.min(16777215, Math.round(val))).toString(16).padStart(6, '0');
                        return (
                          <div key={def.key}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[0.68rem] text-[#777]" style={{ fontFamily: 'var(--font-manga)' }}>{def.label}</span>
                              <input
                                type="color"
                                value={hexStr}
                                onChange={(e) => {
                                  const intVal = parseInt(e.target.value.slice(1), 16);
                                  updateEffect(selectedEffect.id, { params: { ...(selectedEffect.params || {}), [def.key]: intVal } });
                                }}
                                className="w-10 h-6 cursor-pointer border border-[#444] bg-transparent rounded-none"
                              />
                            </div>
                            {def.desc && <p className="text-[0.58rem] text-[#444] mt-0.5">{def.desc}</p>}
                          </div>
                        );
                      }
                      return (
                        <div key={def.key}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[0.68rem] text-[#777]" style={{ fontFamily: 'var(--font-manga)' }}>
                              {def.label}{def.unit ? ` (${def.unit})` : ''}
                            </span>
                            <input
                              type="number"
                              min={def.min}
                              max={def.max}
                              step={def.step}
                              value={Number(val.toFixed(4))}
                              onChange={(e) => {
                                const v = Math.max(def.min, Math.min(def.max, Number(e.target.value)));
                                updateEffect(selectedEffect.id, { params: { ...(selectedEffect.params || {}), [def.key]: v } });
                              }}
                              className="w-20 bg-[#0a0a0a] border border-[#333] px-1.5 py-0.5 text-xs text-[#fbbf24] text-right focus:outline-none focus:border-[#555]"
                            />
                          </div>
                          <input
                            type="range"
                            min={def.min}
                            max={def.max}
                            step={def.step}
                            value={val}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              updateEffect(selectedEffect.id, { params: { ...(selectedEffect.params || {}), [def.key]: v } });
                            }}
                            className="w-full cursor-pointer accent-[#a855f7]"
                          />
                          {def.desc && (
                            <p className="text-[0.58rem] text-[#444] mt-0.5">{def.desc}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-[#999]">
              <span>{effects.filter((e) => normalizeEffectType(e.type) === previewInfoType).length} placed</span>
              <span>•</span>
              <span>{activeClip ? `clip ${(activeClip.order ?? 0) + 1}` : 'no clip'}</span>
            </div>
            {isDemoMode && (
              <p className="text-sm text-[#fbbf24]">
                Loaded from <span className="text-white">/test_video.mp4</span>
              </p>
            )}
          </div>

          {/* Zoom controls */}
          <div className="ml-auto flex flex-col gap-1.5 items-center">
            <span className="text-xs text-[#555] tracking-[0.18em]" style={{ fontFamily: 'var(--font-manga)' }}>ZOOM</span>
            <button
              onClick={() => setPxPerMs((p) => Math.min(0.5, p * 1.3))}
              className="w-8 h-8 flex items-center justify-center border border-[#333] bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#888] hover:text-white transition-colors"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={() => setPxPerMs((p) => Math.max(0.02, p / 1.3))}
              className="w-8 h-8 flex items-center justify-center border border-[#333] bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#888] hover:text-white transition-colors"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-xs text-[#555]">{(pxPerMs * 1000).toFixed(0)}px/s</span>
          </div>
        </div>

        {/* ── EFFECTS PALETTE ───────────────────────────────────────────── */}
        <div className="max-h-[9rem] border-b border-[#333] bg-black/70 backdrop-blur-sm flex shrink-0 overflow-hidden">
          {/* Effect type buttons — scrollable */}
          <div className="flex-1 min-w-0 flex flex-wrap content-start items-center px-4 py-2 gap-2.5 overflow-y-auto palette-scroll">
          <div className="mr-2 flex min-w-[5.5rem] flex-col self-stretch justify-center">
            <span className="text-xs text-[#555] tracking-[0.22em]" style={{ fontFamily: 'var(--font-manga)' }}>FX</span>
            <span className="text-[0.62rem] text-[#444] tracking-[0.12em]" style={{ fontFamily: 'var(--font-manga)' }}>
              PICK + PLACE
            </span>
          </div>
          {EFFECT_TYPES.map((type) => {
            const meta = EFFECT_META[type];
            const isSelected = selectedType === type;
            const isHovered = hoveredType === type;
            const isFlash = type === 'flash_white';
            const FLASH_PRESETS = ['#ffffff', '#dc2626', '#111111', '#a855f7'] as const;
            type FlashPreset = typeof FLASH_PRESETS[number];
            const count = isFlash
              ? effects.filter((e) => e.type === 'flash_white' || e.type === 'red_flash').length
              : effects.filter((e) => normalizeEffectType(e.type) === type).length;
            const swatchColor = isFlash ? flashColor : meta.color;

            return (
              <button
                key={type}
                onClick={() => { setSelectedType(prev => { const next = prev === type ? null : type; if (next !== prev) setPrePlaceParams({}); return next; }); }}
                onMouseEnter={() => setHoveredType(type)}
                onMouseLeave={() => setHoveredType(null)}
                className="relative shrink-0 flex flex-col items-center gap-1 border transition-all"
                style={{
                  minWidth: isFlash ? '7.5rem' : '5.5rem',
                  padding: isFlash ? '6px 10px 8px' : '10px 12px',
                  borderColor: isSelected ? swatchColor : '#333',
                  backgroundColor: isSelected ? `${swatchColor}22` : isHovered ? '#1a1a1a' : '#0f0f0f',
                  boxShadow: isSelected ? `0 0 12px ${swatchColor}44` : 'none',
                }}
              >
                <div
                  className="w-5 h-5 rounded-sm"
                  style={{
                    backgroundColor: swatchColor,
                    boxShadow: isSelected || isHovered ? `0 0 8px ${swatchColor}88` : 'none',
                    border: swatchColor === '#ffffff' ? '1px solid #555' : 'none',
                  }}
                />
                <span
                  className="text-[0.74rem] tracking-[0.16em]"
                  style={{ fontFamily: 'var(--font-manga)', color: isSelected ? swatchColor : '#666' }}
                >
                  {meta.label}
                </span>

                {/* ── Flash: inline color picker row ── */}
                {isFlash && (
                  <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                    {FLASH_PRESETS.map((c) => (
                      <button
                        key={c}
                        title={c}
                        onClick={(e) => { e.stopPropagation(); setFlashColor(c); setSelectedType('flash_white'); }}
                        className="w-3.5 h-3.5 rounded-sm transition-transform"
                        style={{
                          backgroundColor: c,
                          border: flashColor === c ? '1.5px solid #a855f7' : c === '#ffffff' ? '1px solid #555' : '1px solid #333',
                          transform: flashColor === c ? 'scale(1.2)' : 'scale(1)',
                        }}
                      />
                    ))}
                    {/* Custom hex color */}
                    <label
                      title="Custom color"
                      className="relative block w-3.5 h-3.5 rounded-sm cursor-pointer overflow-hidden"
                      style={{ border: !FLASH_PRESETS.includes(flashColor as FlashPreset) ? '1.5px solid #a855f7' : '1px solid #444' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="color"
                        value={flashColor}
                        onChange={(e) => { setFlashColor(e.target.value); setSelectedType('flash_white'); }}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      />
                      <div
                        className="w-full h-full"
                        style={{
                          background: FLASH_PRESETS.includes(flashColor as FlashPreset)
                            ? 'conic-gradient(#f0f,#ff0,#0ff,#f0f)'
                            : flashColor,
                        }}
                      />
                    </label>
                  </div>
                )}

                {count > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 text-[0.58rem] px-1.5 py-0.5 rounded-full font-bold"
                    style={{ backgroundColor: swatchColor, color: swatchColor === '#ffffff' || type === 'strobe' ? '#000' : '#fff' }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          </div>{/* end scrollable buttons */}

          {/* Pre-placement config — fixed right panel, fits within palette height */}
          {selectedType && (
            <div className="w-72 shrink-0 border-l border-[#2a2a2a] bg-[#090909] flex flex-col justify-center gap-2 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: EFFECT_META[selectedType]?.color }} />
                <span className="text-[0.6rem] tracking-[0.2em] text-white truncate" style={{ fontFamily: 'var(--font-manga)' }}>
                  {EFFECT_META[selectedType]?.label}
                </span>
                <span className="text-[0.52rem] text-[#444] ml-auto shrink-0">click timeline to place</span>
              </div>
              {/* Horizontal controls row */}
              <div className="flex flex-col gap-1.5">
                {/* Duration */}
                <div className="flex items-center gap-2">
                  <span className="text-[0.55rem] text-[#555] tracking-widest w-6 shrink-0" style={{ fontFamily: 'var(--font-manga)' }}>DUR</span>
                  <input type="range" min={50} max={1000} step={25} value={prePlaceDuration}
                    onChange={(e) => setPrePlaceDuration(Number(e.target.value))}
                    className="flex-1 cursor-pointer accent-[#fbbf24] h-1" />
                  <span className="text-[0.6rem] text-[#fbbf24] w-12 text-right tabular-nums shrink-0">{prePlaceDuration}ms</span>
                </div>
                {/* Intensity */}
                <div className="flex items-center gap-2">
                  <span className="text-[0.55rem] text-[#555] tracking-widest w-6 shrink-0" style={{ fontFamily: 'var(--font-manga)' }}>INT</span>
                  <input type="range" min={0.1} max={1.0} step={0.05} value={prePlaceIntensity}
                    onChange={(e) => setPrePlaceIntensity(Number(e.target.value))}
                    className="flex-1 cursor-pointer accent-[#a855f7] h-1" />
                  <span className="text-[0.6rem] text-[#a855f7] w-12 text-right tabular-nums shrink-0">{prePlaceIntensity.toFixed(2)}</span>
                </div>
                {/* Type-specific params (first 2, compact) */}
                {(EFFECT_PARAM_DEFS[selectedType] || []).filter(d => d.type !== 'color_hex').slice(0, 2).map((def) => {
                  const val = prePlaceParams[def.key] ?? def.default;
                  return (
                    <div key={def.key} className="flex items-center gap-2">
                      <span className="text-[0.55rem] text-[#555] tracking-widest w-6 shrink-0 truncate" style={{ fontFamily: 'var(--font-manga)' }} title={def.label}>
                        {def.label.slice(0, 3).toUpperCase()}
                      </span>
                      <input type="range" min={def.min} max={def.max} step={def.step} value={val}
                        onChange={(e) => setPrePlaceParams(p => ({ ...p, [def.key]: Number(e.target.value) }))}
                        className="flex-1 cursor-pointer accent-[#fbbf24] h-1" />
                      <span className="text-[0.6rem] text-[#fbbf24] w-12 text-right tabular-nums shrink-0">{Number(val.toFixed(2))}{def.unit ? def.unit : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>{/* end palette wrapper */}

        {/* ── TIMELINE ──────────────────────────────────────────────────── */}
        <div ref={containerRef} className="relative min-h-[7rem] flex-1 overflow-hidden flex flex-col bg-black/60 backdrop-blur-sm">
          {/* Decorative stylized elements */}
          <img src="/stylized_imgs/stone3.png" alt="" aria-hidden className="absolute -bottom-6 right-24 w-52 pointer-events-none select-none z-0" style={{ opacity: 0.28, filter: 'brightness(0.55) saturate(0)', transform: 'rotate(-6deg)' }} />
          <img src="/stylized_imgs/flower4.png" alt="" aria-hidden className="absolute top-2 right-4 w-36 pointer-events-none select-none z-0" style={{ opacity: 0.3, filter: 'brightness(0.6) saturate(0)', transform: 'rotate(12deg) scaleX(-1)' }} />
          <img src="/stylized_imgs/leaf4.png" alt="" aria-hidden className="absolute bottom-4 left-28 w-40 pointer-events-none select-none z-0" style={{ opacity: 0.25, filter: 'brightness(0.55) saturate(0)', transform: 'rotate(-18deg)' }} />
          <img src="/stylized_imgs/pine.png" alt="" aria-hidden className="absolute top-0 left-1/2 w-28 pointer-events-none select-none z-0" style={{ opacity: 0.2, filter: 'brightness(0.5) saturate(0)', transform: 'rotate(8deg)' }} />
          {/* Track labels column */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left labels */}
            <div className="w-20 shrink-0 flex flex-col border-r border-[#222] bg-[#0d0d0d]">
              <div className="h-6 border-b border-[#222] flex items-center px-2">
                <span className="text-[0.5rem] text-[#444] tracking-widest" style={{ fontFamily: 'var(--font-manga)' }}>TIME</span>
              </div>
              <div className="h-16 border-b border-[#222] flex items-center px-2" style={{ order: 2 }}>
                <span className="text-[0.5rem] text-[#555] tracking-widest" style={{ fontFamily: 'var(--font-manga)' }}>CLIPS</span>
              </div>
              <div className="flex-1 flex items-center px-2" style={{ order: 1 }}>
                <span className="text-[0.5rem] text-[#555] tracking-widest" style={{ fontFamily: 'var(--font-manga)' }}>FX</span>
              </div>
            </div>

            {/* Scrollable timeline area */}
            <div
              ref={timelineRef}
              className="flex-1 overflow-x-auto overflow-y-hidden timeline-scroll"
            >
              <div style={{ width: timelineWidth + 100, minWidth: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>

                {/* ── Beat ruler ──────────────────────────────────────── */}
                <div className="h-6 border-b border-[#222] relative shrink-0 bg-black/60 cursor-pointer" style={{ width: timelineWidth + 100 }} onClick={handleTimelineClick}>
                  {/* Second ticks */}
                  {Array.from({ length: Math.ceil(totalMs / 1000) + 1 }, (_, i) => i).map((sec) => {
                    const x = sec * 1000 * pxPerMs;
                    return (
                      <div
                        key={`sec-${sec}`}
                        className="absolute top-0 h-3 w-px bg-[#333]"
                        style={{ left: x }}
                      />
                    );
                  })}
                  {/* Beat ticks */}
                  {beatTicks.map((beatMs, idx) => {
                    const x = beatMs * pxPerMs;
                    const isStrong = idx % 4 === 0;
                    const label = isStrong && idx > 0 ? `${Math.floor(beatMs / 1000)}s` : null;
                    return (
                      <div key={`beat-${idx}`} className="absolute top-0 flex flex-col items-center" style={{ left: x }}>
                        <div
                          className="w-px"
                          style={{
                            height: isStrong ? 20 : 10,
                            backgroundColor: isStrong ? '#555' : '#2a2a2a',
                          }}
                        />
                        {label && (
                          <span
                            className="text-[0.45rem] text-[#555] absolute top-4 -translate-x-1/2"
                            style={{ fontFamily: 'var(--font-manga)' }}
                          >
                            {label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {/* Playhead on ruler */}
                  <div
                    className="absolute top-0 h-full w-px bg-white z-20 pointer-events-none"
                    style={{ left: playheadMs * pxPerMs }}
                  />
                </div>

                {/* ── Clips track ──────────────────────────────────────── */}
                <div
                  className="h-16 border-b border-[#222] relative shrink-0 cursor-crosshair transition-colors duration-100"
                  style={{ width: timelineWidth + 100, minWidth: '100%', order: 2, backgroundColor: hoveredTrack === 'clips' ? '#161616' : '#0e0e0e', boxShadow: hoveredTrack === 'clips' ? 'inset 0 1px 0 #333, inset 0 -1px 0 #333' : 'none' }}
                  onClick={handleTimelineClick}
                  onMouseEnter={() => setHoveredTrack('clips')}
                  onMouseLeave={() => setHoveredTrack(null)}
                >
                  {visualSortedClips.map((clip, idx) => {
                    const x    = clipStartMs[clip.id] * pxPerMs;
                    const w    = Math.max((clip.duration_ms || 3000) * pxPerMs, 4);
                    const clr  = CLIP_COLORS[clip.type] || '#374151';
                    const cnt  = effectCountPerClip[clip.id] || 0;
                    return (
                      <div
                        key={clip.id}
                        className={`absolute top-1 bottom-1 border flex items-center overflow-hidden group ${
                          (clip as any).gen_status === 'generating'
                            ? 'border-blue-400 cursor-pointer'
                            : 'border-[#444]'
                        }`}
                        style={{ left: x, width: w, backgroundColor: clr }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if ((clip as any).gen_status === 'generating') {
                            cancelClipGeneration(clip.id);
                            updateClip(clip.id, { gen_status: 'pending' });
                          }
                        }}
                        title={(clip as any).gen_status === 'generating' ? 'Click to cancel generation' : undefined}
                      >
                        {/* Thumbnail */}
                        {clip.thumbnail_url && (
                          <img
                            src={clip.thumbnail_url}
                            alt=""
                            className="h-full object-cover opacity-40"
                            style={{ width: Math.min(w, 48) }}
                          />
                        )}
                        {w > 30 && (
                          <span
                            className="absolute left-1 bottom-0.5 text-[0.45rem] text-white/60 tracking-wider"
                            style={{ fontFamily: 'var(--font-manga)' }}
                          >
                            {idx + 1}
                          </span>
                        )}
                        {cnt > 0 && w > 20 && (
                          <span
                            className="absolute right-0.5 top-0.5 text-[0.45rem] bg-[#fbbf24] text-black px-0.5 rounded-sm font-bold"
                            style={{ fontFamily: 'var(--font-manga)' }}
                          >
                            {cnt}
                          </span>
                        )}
                        {/* Generating indicator / cancel hint */}
                        {(clip as any).gen_status === 'generating' ? (
                          <span className="absolute inset-0 flex items-center justify-center text-[0.45rem] text-blue-300 font-bold animate-pulse"
                            style={{ fontFamily: 'var(--font-manga)' }}>
                            ✕ CANCEL
                          </span>
                        ) : w > 50 && (
                          <span
                            className="absolute inset-0 flex items-center justify-center text-[0.5rem] text-white/50"
                            style={{ fontFamily: 'var(--font-manga)' }}
                          >
                            {((clip.duration_ms || 3000) / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Empty state */}
                  {visualSortedClips.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-[#444]" style={{ fontFamily: 'var(--font-manga)' }}>
                        NO CLIPS — ADD FROM EDITOR
                      </span>
                    </div>
                  )}

                  {/* Playhead */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-white z-20 pointer-events-none"
                    style={{ left: playheadMs * pxPerMs }}
                  />
                </div>

                {/* ── Transitions track ────────────────────────────────── */}

                {/* ── Effects track ─────────────────────────────────────── */}
                <div
                  className="flex-1 relative cursor-crosshair transition-colors duration-100"
                  style={{ width: timelineWidth + 100, minWidth: '100%', minHeight: 60, order: 1, backgroundColor: hoveredTrack === 'fx' ? '#0e0e0e' : '#080808', boxShadow: hoveredTrack === 'fx' && selectedType ? `inset 0 1px 0 ${EFFECT_META[selectedType]?.color}44, inset 0 -1px 0 ${EFFECT_META[selectedType]?.color}44` : 'none' }}
                  onClick={handleTimelineClick}
                  onMouseEnter={() => setHoveredTrack('fx')}
                  onMouseLeave={() => setHoveredTrack(null)}
                >
                  {/* Beat grid lines */}
                  {beatTicks.map((beatMs, idx) => {
                    const x = beatMs * pxPerMs;
                    const isStrong = idx % 4 === 0;
                    return (
                      <div
                        key={`grid-${idx}`}
                        className="absolute top-0 h-full w-px pointer-events-none"
                        style={{
                          left: x,
                          backgroundColor: isStrong ? '#1a1a1a' : '#111',
                        }}
                      />
                    );
                  })}

                  {/* Effects */}
                  {effects.map((effect) => {
                    const x    = effect.timestamp_ms * pxPerMs;
                    const w    = Math.max(effect.duration_ms * pxPerMs, 3);
                    const meta = EFFECT_META[normalizeEffectType(effect.type) ?? effect.type];
                    const isSelected = selectedEffectId === effect.id;
                    return (
                      <div
                        key={effect.id}
                        className="absolute top-1 bottom-1 border-l-2 cursor-pointer group"
                        style={{
                          left: x,
                          width: Math.max(w, 4),
                          borderLeftColor: meta.color,
                          backgroundColor: `${meta.color}${isSelected ? '55' : '22'}`,
                          boxShadow: isSelected ? `0 0 8px ${meta.color}88` : `0 0 4px ${meta.color}33`,
                          borderTop: isSelected ? `1px solid ${meta.color}` : 'none',
                          borderBottom: isSelected ? `1px solid ${meta.color}` : 'none',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEffectId(isSelected ? null : effect.id);
                        }}
                        title={`${meta.label} @ ${(effect.timestamp_ms / 1000).toFixed(2)}s — click to select`}
                      >
                        {/* Intensity indicator */}
                        <div
                          className="absolute bottom-0 left-0 w-1"
                          style={{
                            height: `${effect.intensity * 100}%`,
                            backgroundColor: meta.color,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    );
                  })}

                  {/* Playhead */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-white z-20 pointer-events-none"
                    style={{ left: playheadMs * pxPerMs, animation: 'playhead-pulse 1s ease-in-out infinite' }}
                  />

                  {/* Empty effects state */}
                  {effects.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-xs text-[#ddd]" style={{ fontFamily: 'var(--font-manga)' }}>
                        CLICK TIMELINE TO PLACE EFFECTS — OR HIT AUTO AMV
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Status bar ──────────────────────────────────────────────── */}
          <div className="min-h-[2.75rem] border-t border-[#222] bg-black/70 backdrop-blur-sm flex flex-wrap items-center px-4 py-2 gap-x-5 gap-y-1 shrink-0">
            <span className="text-[0.68rem] text-[#444]" style={{ fontFamily: 'var(--font-manga)' }}>
              SELECTED: <span className="text-[#999]">{selectedType ? EFFECT_META[selectedType].label : '—'}</span>
            </span>
            <span className="text-[0.68rem] text-[#444]" style={{ fontFamily: 'var(--font-manga)' }}>
              TOTAL: <span className="text-[#999]">{(totalMs / 1000).toFixed(1)}s</span>
            </span>
            <span className="text-[0.68rem] text-[#444]" style={{ fontFamily: 'var(--font-manga)' }}>
              BPM: <span className="text-[#999]">{bpm}</span>
            </span>
            <span className="text-[0.68rem] text-[#444]" style={{ fontFamily: 'var(--font-manga)' }}>
              BEATS: <span className="text-[#999]">{beatTicks.length}</span>
            </span>
            {selectedEffect && (
              <span className="text-[0.68rem] text-[#fbbf24]" style={{ fontFamily: 'var(--font-manga)' }}>
                EFFECT SELECTED - ADJUST DURATION ABOVE OR PRESS DELETE
              </span>
            )}
          </div>
        </div>
        </div>{/* end timeline content */}

        {/* Chat panel — always mounted, GSAP slide overlay (no layout shift) */}
        <div
          ref={chatPanelRef}
          className="absolute top-0 right-0 bottom-0 z-30 border-l border-[#222] overflow-hidden"
          style={{ width: 288, transform: 'translateX(100%)', backgroundImage: 'url(/stylized_imgs/dark_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
          {/* Decorative overlays */}
          <img src="/stylized_imgs/flower3.png" alt="" aria-hidden className="absolute pointer-events-none select-none" style={{ top: '-2%', right: '-10%', width: '65%', opacity: 0.4, filter: 'brightness(0.65) saturate(0)', transform: 'rotate(15deg)' }} />
          <img src="/stylized_imgs/stone2.png" alt="" aria-hidden className="absolute pointer-events-none select-none" style={{ bottom: '18%', left: '-8%', width: '55%', opacity: 0.35, filter: 'brightness(0.6) saturate(0)', transform: 'rotate(-8deg)' }} />
          <img src="/stylized_imgs/pine.png" alt="" aria-hidden className="absolute pointer-events-none select-none" style={{ bottom: '-2%', right: '-5%', width: '60%', opacity: 0.32, filter: 'brightness(0.6) saturate(0)', transform: 'rotate(5deg) scaleX(-1)' }} />
          <img src="/stylized_imgs/leaf7.png" alt="" aria-hidden className="absolute pointer-events-none select-none" style={{ top: '30%', left: '-5%', width: '50%', opacity: 0.38, filter: 'brightness(0.65) saturate(0)', transform: 'rotate(-25deg)' }} />
          <img src="/stylized_imgs/flowers.png" alt="" aria-hidden className="absolute pointer-events-none select-none" style={{ bottom: '38%', right: '-8%', width: '55%', opacity: 0.35, filter: 'brightness(0.6) saturate(0)', transform: 'rotate(20deg) scaleX(-1)' }} />
          <div ref={chatContentRef} className="relative w-72 h-full">
            <ChatPanel projectId={id!} onCollapse={() => setChatOpen(false)} dark mode="effects" />
          </div>
        </div>
      </div>
    </div>
  );
}

