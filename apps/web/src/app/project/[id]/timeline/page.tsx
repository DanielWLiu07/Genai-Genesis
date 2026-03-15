'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  flash_white:    { label: 'FLASH W',   color: '#ffffff', desc: 'Sudden white frame flash — high impact hit' },
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
  red_flash:      { label: 'FLASH R',   color: '#dc2626', desc: 'Red flash — violence, danger, or impact (color param: any hex)' },
  blur_out:       { label: 'BLUR',      color: '#7dd3fc', desc: 'Dreamy soft blur — memory or transition' },
  film_grain:     { label: 'GRAIN',     color: '#92400e', desc: 'Film grain texture — cinematic grit' },
  letterbox:      { label: 'CINEMA',    color: '#0f172a', desc: 'Cinematic black bars slam in — epic reveal' },
  neon:           { label: 'NEON',      color: '#c084fc', desc: 'Neon violet glow — supernatural power' },
  sepia:          { label: 'SEPIA',     color: '#d97706', desc: 'Warm sepia wash — nostalgia / past' },
  overexpose:     { label: 'OVEREXP',   color: '#fef9c3', desc: 'Blinding overexposure — climactic moment' },
  pixelate:       { label: 'PIXEL',     color: '#34d399', desc: 'Digital pixelation — data / digital world' },
  contrast_punch: { label: 'CONTRAST',  color: '#fb923c', desc: 'Extreme contrast punch — manga ink style' },
  manga_ink:      { label: 'MANGA INK', color: '#e2e8f0', desc: 'Hyper-contrast B&W — pure manga look' },
};

// flash_black shares the flash_white display label when used as palette alias
EFFECT_META.flash_black = EFFECT_META.flash_white;

const EFFECT_TYPES: EffectType[] = [
  // ─ Flash / Light ────────────────
  'flash_white', 'red_flash', 'overexpose', 'strobe', 'flicker',
  // ─ Zoom / Move ──────────────────
  'zoom_burst', 'zoom_out', 'shake', 'heavy_shake', 'speed_ramp', 'reverse',
  // ─ Color / Grade ────────────────
  'chromatic', 'rgb_shift_v', 'neon', 'invert', 'black_white', 'manga_ink',
  'sepia', 'contrast_punch', 'glitch',
  // ─ Temporal ─────────────────────
  'echo', 'time_echo', 'freeze',
  // ─ Texture / Overlay ────────────
  'panel_split', 'cross_cut', 'letterbox', 'vignette', 'film_grain',
  'blur_out', 'pixelate',
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
};

function getParamValue(effect: Effect, key: string): number {
  const defs = EFFECT_PARAM_DEFS[effect.type];
  const def = defs?.find((d) => d.key === key);
  return effect.params?.[key] ?? def?.default ?? 0;
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

function normalizeEffectType(type: EffectType): EffectType {
  return type === 'flash_black' ? 'flash_white' : type;
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
  'flash_white', 'flash_black', 'strobe', 'red_flash', 'overexpose', 'cross_cut',
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
    const shouldBootstrap = storeProjectId !== id || useTimelineStore.getState().clips.length === 0;
    setProjectId(id);
    if (!shouldBootstrap) return;

    if (isDemoMode) {
      loadTimeline(createDemoTimeline());
      return;
    }

    import('@/lib/api').then(({ api }) => {
      api.getTimeline(id).then((tl: any) => {
        loadTimeline(tl);
        if (tl.beat_map?.bpm) {
          setBpm(tl.beat_map.bpm);
        }
      }).catch(() => {});
    });
  }, [id, isDemoMode, loadTimeline, setProjectId, storeProjectId]);

  // Load compiled video URL from most recent done render job
  useEffect(() => {
    if (!id || isDemoMode) return;
    import('@/lib/api').then(({ api }) => {
      api.getRenderJobs(id).then((jobs: any) => {
        const latest = (jobs || []).find((j: any) => j.status === 'done' && (j.preview_url || j.output_url));
        if (latest) { setCompiledUrl(latest.preview_url || latest.output_url); setCompiledReady(false); }
      }).catch(() => {});
    });
  }, [id, isDemoMode]);

  const clips        = useTimelineStore((s) => s.clips);
  const effects      = useTimelineStore((s) => s.effects);
  const beatMap      = useTimelineStore((s) => s.beatMap);
  const addEffect    = useTimelineStore((s) => s.addEffect);
  const removeEffect = useTimelineStore((s) => s.removeEffect);
  const updateEffect = useTimelineStore((s) => s.updateEffect);
  const setBeatMap   = useTimelineStore((s) => s.setBeatMap);
  const setEffects   = useTimelineStore((s) => s.setEffects);
  const clearEffects = useTimelineStore((s) => s.clearEffects);
  const updateClip   = useTimelineStore((s) => s.updateClip);

  const [selectedType, setSelectedType] = useState<EffectType>('flash_white');
  const [hoveredType, setHoveredType]   = useState<EffectType | null>(null);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [bpm, setBpm]           = useState(() => useTimelineStore.getState().beatMap?.bpm || 128);
  const [pxPerMs, setPxPerMs]   = useState(0.1);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
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
  useEffect(() => {
    if (!id || isDemoMode) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const { clips: c, musicTrack, settings } = useTimelineStore.getState();
      import('@/lib/api').then(({ api }) => {
        api.updateTimeline(id, {
          clips: c,
          music_track: musicTrack,
          settings,
          effects,
          beat_map: beatMap,
          total_duration_ms: totalMs,
        }).catch(() => {});
      });
    }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [effects, beatMap, id, isDemoMode, totalMs]);

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
      gsap.to(chatPanelRef.current, { width: 288, duration: 0.3, ease: 'power3.out' });
      gsap.fromTo(chatContentRef.current, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.25, delay: 0.1, ease: 'power2.out' });
    } else {
      gsap.to(chatContentRef.current, { opacity: 0, x: 20, duration: 0.15, ease: 'power2.in' });
      gsap.to(chatPanelRef.current, { width: 0, duration: 0.25, delay: 0.1, ease: 'power3.in' });
    }
  }, [chatOpen]);

  // ── Auto AMV ────────────────────────────────────────────────────────────

  const handleAutoAmv = useCallback(async () => {
    if (!beatMap) return;
    setAutoAmvLoading(true);
    clearEffects();

    // Fallback random algorithm
    const runFallback = () => {
      const newEffects: Effect[] = [];
      const beatEffects: EffectType[] = ['flash_white', 'zoom_burst', 'shake', 'chromatic', 'flicker', 'red_flash', 'contrast_punch'];
      const strongBeatEffects: EffectType[] = ['zoom_burst', 'panel_split', 'heavy_shake', 'neon', 'manga_ink', 'overexpose', 'vignette'];
      const everyEighthEffects: EffectType[] = ['echo', 'reverse', 'time_echo', 'freeze', 'blur_out', 'zoom_out', 'glitch', 'letterbox'];

      beatMap.beats.forEach((beatMs, idx) => {
        if (beatMs > totalMs) return;
        const intensity = 0.3 + Math.random() * 0.7;
        if (idx % 8 === 0 && idx > 0) {
          const type = everyEighthEffects[Math.floor(Math.random() * everyEighthEffects.length)];
          newEffects.push({ id: crypto.randomUUID(), type, timestamp_ms: beatMs, duration_ms: 400, intensity });
        } else if (idx % 4 === 0 && idx > 0) {
          const type = strongBeatEffects[Math.floor(Math.random() * strongBeatEffects.length)];
          newEffects.push({ id: crypto.randomUUID(), type, timestamp_ms: beatMs, duration_ms: 300, intensity: Math.min(1, intensity + 0.2) });
        } else {
          const type = beatEffects[Math.floor(Math.random() * beatEffects.length)];
          newEffects.push({ id: crypto.randomUUID(), type, timestamp_ms: beatMs, duration_ms: 150, intensity });
          const halfBeat = (60 / bpm) * 500;
          const halfMs = beatMs + halfBeat;
          if (halfMs < totalMs && Math.random() > 0.4) {
            const type2 = beatEffects[Math.floor(Math.random() * beatEffects.length)];
            newEffects.push({ id: crypto.randomUUID(), type: type2, timestamp_ms: Math.round(halfMs), duration_ms: 100, intensity: intensity * 0.7 });
          }
        }
      });
      setEffects(newEffects);
    };

    try {
      const projectState = useProjectStore.getState();
      const timelineState = useTimelineStore.getState();
      const proj = projectState.currentProject as any;
      const audioAnalysis = proj?.audio_analysis;
      const clips = timelineState.clips;

      const availableEffects = EFFECT_TYPES.map(t => {
        const meta = EFFECT_META[t];
        const params = EFFECT_PARAM_DEFS[t];
        return `${t} (${meta?.label}): ${meta?.desc}${params ? ' | params: ' + params.map(p => p.key).join(', ') : ''}`;
      }).join('\n');

      const clipSummary = clips.slice(0, 20).map((c, i) =>
        `[${i}] type=${c.type} shot=${c.shot_type || 'unknown'} duration=${c.duration_ms}ms prompt="${(c.prompt || '').slice(0, 60)}"`
      ).join('\n');

      const musicSummary = audioAnalysis ? [
        `BPM: ${audioAnalysis.bpm || bpm}`,
        `Duration: ${audioAnalysis.duration_s || (totalMs / 1000)}s`,
        `Key beats (first 20): ${(audioAnalysis.beat_timestamps || []).slice(0, 20).join(', ')}`,
        `Energy peaks (first 20): ${(audioAnalysis.energy_curve || []).slice(0, 20).map((v: number) => v.toFixed(2)).join(', ')}`,
        `Mood: ${audioAnalysis.mood || 'unknown'}`,
        `Genre: ${audioAnalysis.genre || 'unknown'}`,
      ].join('\n') : `BPM: ${bpm}, Duration: ${totalMs / 1000}s`;

      const prompt = `You are an expert AMV (Anime Music Video) editor. Create a cinematic effect timeline for this trailer.

PROJECT: "${proj?.title || 'Untitled'}"
GENRE: ${proj?.analysis?.genre || 'unknown'} | MOOD: ${proj?.analysis?.mood || 'unknown'}
THEMES: ${(proj?.analysis?.themes || []).join(', ') || 'unknown'}

MUSIC ANALYSIS:
${musicSummary}

CLIPS (${clips.length} total):
${clipSummary}

BEAT SYNC INTENSITY: ${beatSyncIntensity}

AVAILABLE EFFECTS:
${availableEffects}

Generate an AMV effect sequence that:
1. Syncs flash/zoom/shake effects to high-energy beat timestamps
2. Uses content-aware effects (manga_ink/panel_split for action, echo/blur_out for emotional moments, neon/glitch for supernatural scenes)
3. Respects the beat sync intensity level: ${beatSyncIntensity} (chill=sparse effects, balanced=moderate, intense=dense, all-out=every beat)
4. Clusters effects around energy peaks, sparse at low-energy moments
5. Uses appropriate params for each effect

Respond with a JSON tool call: { "tool": "set_amv_effects", "effects": [ { "type": "effect_type", "timestamp_ms": number, "duration_ms": number, "intensity": number (0-1), "params": {} } ] }`;

      const currentTimeline = { clips: timelineState.clips, music_track: timelineState.musicTrack, settings: timelineState.settings };
      const result = await api.chat(id as string, prompt, currentTimeline, []);

      // Parse AI tool calls
      let applied = false;
      const toolCalls = result?.tool_calls || [];
      for (const call of toolCalls) {
        const fn = call.function || call;
        const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments || fn);
        const rawEffects: any[] = args.effects || [];
        if (rawEffects.length > 0) {
          const newEffects: Effect[] = rawEffects
            .filter((e: any) => EFFECT_TYPES.includes(e.type as EffectType) && typeof e.timestamp_ms === 'number')
            .map((e: any) => ({
              id: crypto.randomUUID(),
              type: e.type as EffectType,
              timestamp_ms: Math.max(0, Math.min(totalMs, e.timestamp_ms)),
              duration_ms: Math.max(50, e.duration_ms || 200),
              intensity: Math.max(0, Math.min(1, e.intensity ?? 0.8)),
              params: e.params || {},
            }));
          if (newEffects.length > 0) {
            setEffects(newEffects);
            applied = true;
            break;
          }
        }
      }

      // Also check if AI returned JSON in text content
      if (!applied && result?.message) {
        try {
          const jsonMatch = result.message.match(/\{[\s\S]*"effects"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const rawEffects: any[] = parsed.effects || [];
            const newEffects: Effect[] = rawEffects
              .filter((e: any) => EFFECT_TYPES.includes(e.type as EffectType) && typeof e.timestamp_ms === 'number')
              .map((e: any) => ({
                id: crypto.randomUUID(),
                type: e.type as EffectType,
                timestamp_ms: Math.max(0, Math.min(totalMs, e.timestamp_ms)),
                duration_ms: Math.max(50, e.duration_ms || 200),
                intensity: Math.max(0, Math.min(1, e.intensity ?? 0.8)),
                params: e.params || {},
              }));
            if (newEffects.length > 0) {
              setEffects(newEffects);
              applied = true;
            }
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

    addEffect({
      id: crypto.randomUUID(),
      type: selectedType,
      timestamp_ms,
      duration_ms: 200,
      intensity: 0.8,
    });
  }, [addEffect, pxPerMs, selectedType, totalMs]);

  // ── Cycle transition type on a clip ─────────────────────────────────────


  // ── Render ──────────────────────────────────────────────────────────────

  const handleRender = useCallback(async () => {
    if (!id || rendering) return;
    setRendering(true);
    setRenderStatus('Starting render...');
    try {
      const { clips: c, musicTrack, settings } = useTimelineStore.getState();
      // Exclude: text_overlay overlays, old title_card/end_card auto-generated cards,
      // and any clip without actual AI-generated media
      const EXCLUDED_CLIP_IDS = new Set(['title_card', 'end_card']);
      const renderClips = c.filter((cl: any) =>
        cl.type !== 'text_overlay' &&
        !EXCLUDED_CLIP_IDS.has(cl.id) &&
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

  const activeClip = sortedClips.find((clip) => {
    const start = clipStartMs[clip.id] || 0;
    const end = start + (clip.duration_ms || 3000);
    return playheadMs >= start && playheadMs < end;
  }) ?? sortedClips[0] ?? null;
  const activeClipStartMs = activeClip ? (clipStartMs[activeClip.id] || 0) : 0;
  const activeClipDurationMs = activeClip?.duration_ms || 3000;
  const activeClipOffsetMs = activeClip ? Math.max(0, playheadMs - activeClipStartMs) : 0;
  const activeEffect = effects.find(
    (effect) => playheadMs >= effect.timestamp_ms && playheadMs <= effect.timestamp_ms + effect.duration_ms
  ) ?? null;
  const selectedEffect = selectedEffectId
    ? effects.find((effect) => effect.id === selectedEffectId) ?? null
    : null;
  const previewInfoType = normalizeEffectType(hoveredType ?? selectedEffect?.type ?? selectedType);
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
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Timeline content */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-y-auto overflow-x-hidden">

        {/* ── PREVIEW AREA ─────────────────────────────────────────────── */}
        <div className="relative min-h-[13rem] border-b border-[#333] flex flex-wrap items-center justify-center gap-6 px-6 py-4 shrink-0 lg:min-h-[15rem] lg:flex-nowrap lg:gap-10 overflow-hidden" style={{ backgroundImage: 'url(/stylized_imgs/dark_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
          {/* Decorative stylized elements */}
          {/* — far left corner cluster — */}
          <img src="/stylized_imgs/flower3.png"       alt="" aria-hidden className="absolute -top-6 -left-8 w-52 pointer-events-none select-none" style={{ opacity: 0.62, filter: 'brightness(0.6) saturate(0)', transform: 'rotate(-18deg) scaleX(-1)' }} />
          <img src="/stylized_imgs/flowers.png"       alt="" aria-hidden className="absolute -bottom-6 -left-6 w-48 pointer-events-none select-none" style={{ opacity: 0.58, filter: 'brightness(0.55) saturate(0)', transform: 'rotate(10deg)' }} />
          <img src="/stylized_imgs/stone2.png"        alt="" aria-hidden className="absolute bottom-0 left-20 w-28 pointer-events-none select-none" style={{ opacity: 0.52, filter: 'brightness(0.5) saturate(0)', transform: 'rotate(-5deg)' }} />
          <img src="/stylized_imgs/leaf6.png"         alt="" aria-hidden className="absolute -top-2 left-10 w-32 pointer-events-none select-none" style={{ opacity: 0.42, filter: 'brightness(0.55) saturate(0)', transform: 'rotate(-30deg) scaleX(-1)' }} />
          {/* — mid-left filler — */}
          <img src="/stylized_imgs/leaf3.png"         alt="" aria-hidden className="absolute bottom-1 left-40 w-20 pointer-events-none select-none" style={{ opacity: 0.36, filter: 'brightness(0.5) saturate(0)', transform: 'rotate(20deg)' }} />
          <img src="/stylized_imgs/flower4.png"       alt="" aria-hidden className="absolute top-2 left-36 w-24 pointer-events-none select-none" style={{ opacity: 0.4, filter: 'brightness(0.55) saturate(0)', transform: 'rotate(14deg) scaleX(-1)' }} />
          {/* — far right corner cluster — */}
          <img src="/stylized_imgs/stone1.png"        alt="" aria-hidden className="absolute -bottom-10 -right-4 w-44 pointer-events-none select-none" style={{ opacity: 0.58, filter: 'brightness(0.5) saturate(0)', transform: 'rotate(5deg)' }} />
          <img src="/stylized_imgs/pine.png"          alt="" aria-hidden className="absolute right-28 top-1/2 -translate-y-1/2 w-36 pointer-events-none select-none" style={{ opacity: 0.45, filter: 'brightness(0.5) saturate(0)' }} />
          <img src="/stylized_imgs/leaf7.png"         alt="" aria-hidden className="absolute -top-4 right-8 w-40 pointer-events-none select-none" style={{ opacity: 0.52, filter: 'brightness(0.55) saturate(0)', transform: 'rotate(16deg) scaleX(-1)' }} />
          <img src="/stylized_imgs/stone3.png"        alt="" aria-hidden className="absolute -bottom-4 right-56 w-24 pointer-events-none select-none" style={{ opacity: 0.46, filter: 'brightness(0.48) saturate(0)', transform: 'rotate(-8deg)' }} />
          {/* — mid-right filler — */}
          <img src="/stylized_imgs/leaf5.png"         alt="" aria-hidden className="absolute bottom-0 right-24 w-20 pointer-events-none select-none" style={{ opacity: 0.38, filter: 'brightness(0.5) saturate(0)', transform: 'rotate(28deg) scaleX(-1)' }} />
          <img src="/stylized_imgs/leaf78.png"        alt="" aria-hidden className="absolute top-1 right-44 w-22 pointer-events-none select-none" style={{ opacity: 0.35, filter: 'brightness(0.5) saturate(0)', transform: 'rotate(-22deg)' }} />
          {/* — centre cluster — */}
          <img src="/stylized_imgs/stone1.png"        alt="" aria-hidden className="absolute top-1/2 left-1/2 w-28 pointer-events-none select-none" style={{ opacity: 0.38, filter: 'brightness(0.52) saturate(0)', transform: 'translate(-50%,-10%) rotate(12deg)' }} />
          <img src="/stylized_imgs/leaf2.png"         alt="" aria-hidden className="absolute top-0 left-1/2 w-24 pointer-events-none select-none" style={{ opacity: 0.42, filter: 'brightness(0.55) saturate(0)', transform: 'translateX(-60%) rotate(-28deg) scaleX(-1)' }} />
          <img src="/stylized_imgs/flower4.png"       alt="" aria-hidden className="absolute bottom-0 left-1/2 w-28 pointer-events-none select-none" style={{ opacity: 0.4, filter: 'brightness(0.55) saturate(0)', transform: 'translateX(-60%) rotate(18deg)' }} />
          <img src="/stylized_imgs/leaf4.png"         alt="" aria-hidden className="absolute top-1/2 left-1/2 w-20 pointer-events-none select-none" style={{ opacity: 0.33, filter: 'brightness(0.5) saturate(0)', transform: 'translate(50%,-70%) rotate(-40deg)' }} />
          <div className="relative h-[12.375rem] w-[22rem] border border-[#333] bg-[#1a1a1a] overflow-hidden lg:h-[15.75rem] lg:w-[28rem]">
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
          <div className="flex flex-col gap-3 min-w-[280px]">
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
        <div className="max-h-[5.5rem] border-b border-[#333] bg-black/70 backdrop-blur-sm flex flex-wrap content-start items-center px-4 py-2 gap-2.5 shrink-0 overflow-y-auto palette-scroll">
          <div className="mr-2 flex min-w-[5.5rem] flex-col self-stretch justify-center">
            <span className="text-xs text-[#555] tracking-[0.22em]" style={{ fontFamily: 'var(--font-manga)' }}>FX</span>
            <span className="text-[0.62rem] text-[#444] tracking-[0.12em]" style={{ fontFamily: 'var(--font-manga)' }}>
              PICK THEN PLACE
            </span>
          </div>
          {EFFECT_TYPES.map((type) => {
            const meta = EFFECT_META[type];
            const isSelected = selectedType === type;
            const isHovered = hoveredType === type;
            const count = effects.filter((e) => normalizeEffectType(e.type) === type).length;
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                onMouseEnter={() => setHoveredType(type)}
                onMouseLeave={() => setHoveredType(null)}
                className="relative shrink-0 flex min-w-[5.5rem] flex-col items-center gap-1.5 px-3 py-2.5 border transition-all"
                style={{
                  borderColor: isSelected ? meta.color : '#333',
                  backgroundColor: isSelected ? `${meta.color}22` : isHovered ? '#1a1a1a' : '#0f0f0f',
                  boxShadow: isSelected ? `0 0 12px ${meta.color}44` : 'none',
                }}
              >
                <div
                  className="w-5 h-5 rounded-sm"
                  style={{
                    backgroundColor: meta.color,
                    boxShadow: isSelected || isHovered ? `0 0 8px ${meta.color}88` : 'none',
                    border: type === 'flash_white' ? '1px solid #555' : 'none',
                  }}
                />
                <span
                  className="text-[0.74rem] tracking-[0.16em]"
                  style={{
                    fontFamily: 'var(--font-manga)',
                    color: isSelected ? meta.color : '#666',
                  }}
                >
                  {meta.label}
                </span>
                {count > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 text-[0.58rem] px-1.5 py-0.5 rounded-full font-bold"
                    style={{ backgroundColor: meta.color, color: type === 'flash_white' || type === 'strobe' ? '#000' : '#fff' }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── TIMELINE ──────────────────────────────────────────────────── */}
        <div ref={containerRef} className="relative min-h-[14rem] flex-1 overflow-hidden flex flex-col bg-black/60 backdrop-blur-sm">
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
                <div className="h-6 border-b border-[#222] relative shrink-0 bg-black/60" style={{ width: timelineWidth + 100 }}>
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
                  className="h-16 border-b border-[#222] relative shrink-0 bg-[#0e0e0e] cursor-crosshair"
                  style={{ width: timelineWidth + 100, minWidth: '100%', order: 2 }}
                  onClick={handleTimelineClick}
                >
                  {sortedClips.map((clip, idx) => {
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
                  {sortedClips.length === 0 && (
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
                  className="flex-1 relative bg-[#080808] cursor-crosshair"
                  style={{ width: timelineWidth + 100, minWidth: '100%', minHeight: 60, order: 1 }}
                  onClick={handleTimelineClick}
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
                    const meta = EFFECT_META[normalizeEffectType(effect.type)];
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
              SELECTED: <span className="text-[#999]">{EFFECT_META[selectedType].label}</span>
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

        {/* Chat panel — always mounted, GSAP animated width */}
        <div
          ref={chatPanelRef}
          className="relative shrink-0 border-l border-[#222] overflow-hidden"
          style={{ width: 0, backgroundImage: 'url(/stylized_imgs/dark_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
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

