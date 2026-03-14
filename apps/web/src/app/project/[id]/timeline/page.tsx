'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { TransitionLink as Link } from '@/components/PageTransition';
import {
  ArrowLeft, Zap, Play, Download, Loader2, Trash2, ZoomIn, ZoomOut, Music,
} from 'lucide-react';
import { useTimelineStore, type Effect, type EffectType, type BeatMap } from '@/stores/timeline-store';
import { api } from '@/lib/api';

// ─── Effect metadata ────────────────────────────────────────────────────────

const EFFECT_META: Record<EffectType, { label: string; color: string; desc: string }> = {
  flash_white:  { label: 'FLASH W',    color: '#ffffff', desc: 'Sudden white frame flash — high impact hit' },
  flash_black:  { label: 'FLASH B',    color: '#333333', desc: 'Sudden black frame cut — dramatic pause' },
  zoom_burst:   { label: 'ZOOM',       color: '#fbbf24', desc: 'Rapid zoom-in burst for emphasis' },
  shake:        { label: 'SHAKE',      color: '#f97316', desc: 'Camera shake — violence or impact' },
  echo:         { label: 'ECHO',       color: '#60a5fa', desc: 'Ghost repeat of the current frame' },
  speed_ramp:   { label: 'RAMP',       color: '#4ade80', desc: 'Slow → fast speed ramp for tension' },
  chromatic:    { label: 'CHROMA',     color: '#f472b6', desc: 'RGB split chromatic aberration' },
  panel_split:  { label: 'PANELS',     color: '#a855f7', desc: 'Manga multi-panel split overlay' },
  reverse:      { label: 'REVERSE',    color: '#ef4444', desc: 'Brief reverse playback rewind' },
  glitch:       { label: 'GLITCH',     color: '#22d3ee', desc: 'Digital glitch artifact corruption' },
  strobe:       { label: 'STROBE',     color: '#e2e8f0', desc: 'Rapid strobe flash sequence' },
};

const EFFECT_TYPES = Object.keys(EFFECT_META) as EffectType[];

// ─── Clip colors by type ─────────────────────────────────────────────────────

const CLIP_COLORS: Record<string, string> = {
  image: '#374151',
  video: '#1e3a5f',
  text_overlay: '#3b1f6e',
  transition: '#1a3a2a',
};

// ─── CSS preview animation styles ────────────────────────────────────────────

function getPreviewStyle(type: EffectType, active: boolean): React.CSSProperties {
  if (!active) return {};
  switch (type) {
    case 'flash_white':  return { animation: 'amv-flash-white 0.3s ease-out infinite' };
    case 'flash_black':  return { animation: 'amv-flash-black 0.3s ease-out infinite' };
    case 'zoom_burst':   return { animation: 'amv-zoom 0.4s ease-out infinite' };
    case 'shake':        return { animation: 'amv-shake 0.2s linear infinite' };
    case 'echo':         return { animation: 'amv-echo 0.6s ease-out infinite' };
    case 'speed_ramp':   return { animation: 'amv-ramp 1s ease-in-out infinite' };
    case 'chromatic':    return { animation: 'amv-chroma 0.5s linear infinite' };
    case 'panel_split':  return { animation: 'amv-panels 0.5s ease-in-out infinite' };
    case 'reverse':      return { animation: 'amv-reverse 0.8s ease-in-out infinite' };
    case 'glitch':       return { animation: 'amv-glitch 0.3s steps(3) infinite' };
    case 'strobe':       return { animation: 'amv-strobe 0.1s steps(2) infinite' };
    default: return {};
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const { id } = useParams<{ id: string }>();

  const clips      = useTimelineStore((s) => s.clips);
  const effects    = useTimelineStore((s) => s.effects);
  const beatMap    = useTimelineStore((s) => s.beatMap);
  const addEffect  = useTimelineStore((s) => s.addEffect);
  const removeEffect   = useTimelineStore((s) => s.removeEffect);
  const setBeatMap     = useTimelineStore((s) => s.setBeatMap);
  const setEffects     = useTimelineStore((s) => s.setEffects);
  const clearEffects   = useTimelineStore((s) => s.clearEffects);

  const [selectedType, setSelectedType] = useState<EffectType>('flash_white');
  const [hoveredType, setHoveredType]   = useState<EffectType | null>(null);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [bpm, setBpm]           = useState(128);
  const [pxPerMs, setPxPerMs]   = useState(0.1);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  const timelineRef   = useRef<HTMLDivElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);

  // ── Derived values ──────────────────────────────────────────────────────

  const sortedClips = [...clips].sort((a, b) => a.order - b.order);
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
    const bm = generateBeatMap(bpm);
    setBeatMap(bm);
  }, [bpm, generateBeatMap, setBeatMap]);

  // ── Auto AMV ────────────────────────────────────────────────────────────

  const handleAutoAmv = useCallback(() => {
    if (!beatMap) return;
    clearEffects();

    const newEffects: Effect[] = [];
    const beatEffects: EffectType[] = ['flash_white', 'flash_black', 'zoom_burst', 'shake'];
    const strongBeatEffects: EffectType[] = ['zoom_burst', 'panel_split'];
    const everyEighthEffects: EffectType[] = ['echo', 'reverse'];

    beatMap.beats.forEach((beatMs, idx) => {
      if (beatMs > totalMs) return;

      const intensity = 0.3 + Math.random() * 0.7;

      if (idx % 8 === 0 && idx > 0) {
        // Every 8th beat
        const type = everyEighthEffects[Math.floor(Math.random() * everyEighthEffects.length)];
        newEffects.push({
          id: crypto.randomUUID(),
          type,
          timestamp_ms: beatMs,
          duration_ms: 400,
          intensity,
        });
      } else if (idx % 4 === 0 && idx > 0) {
        // Every 4th beat (strong beat)
        const type = strongBeatEffects[Math.floor(Math.random() * strongBeatEffects.length)];
        newEffects.push({
          id: crypto.randomUUID(),
          type,
          timestamp_ms: beatMs,
          duration_ms: 300,
          intensity: Math.min(1, intensity + 0.2),
        });
      } else {
        // Every beat — primary effect
        const type = beatEffects[Math.floor(Math.random() * beatEffects.length)];
        newEffects.push({
          id: crypto.randomUUID(),
          type,
          timestamp_ms: beatMs,
          duration_ms: 150,
          intensity,
        });

        // Add a secondary effect for density (~2-4 effects per second)
        const halfBeat = (60 / bpm) * 500;
        const halfMs = beatMs + halfBeat;
        if (halfMs < totalMs && Math.random() > 0.4) {
          const type2 = beatEffects[Math.floor(Math.random() * beatEffects.length)];
          newEffects.push({
            id: crypto.randomUUID(),
            type: type2,
            timestamp_ms: Math.round(halfMs),
            duration_ms: 100,
            intensity: intensity * 0.7,
          });
        }
      }
    });

    setEffects(newEffects);
  }, [beatMap, bpm, totalMs, clearEffects, setEffects]);

  // ── Timeline click → place effect ──────────────────────────────────────

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    const timestamp_ms = Math.round(x / pxPerMs);
    if (timestamp_ms < 0 || timestamp_ms > totalMs + 2000) return;

    addEffect({
      id: crypto.randomUUID(),
      type: selectedType,
      timestamp_ms,
      duration_ms: 200,
      intensity: 0.8,
    });
  }, [pxPerMs, selectedType, totalMs, addEffect]);

  // ── Render ──────────────────────────────────────────────────────────────

  const handleRender = useCallback(async () => {
    if (!id || rendering) return;
    setRendering(true);
    setRenderStatus('Starting render...');
    try {
      const result: any = await (api as any).renderWithEffects
        ? (api as any).renderWithEffects(id, effects, beatMap)
        : api.renderTrailer(id);
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
            if (status.output_url?.startsWith('http')) window.open(status.output_url, '_blank');
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

  const previewType = hoveredType ?? selectedType;

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-white overflow-hidden">
      {/* Inline keyframes */}
      <style>{`
        @keyframes amv-flash-white { 0%,100%{background:transparent} 50%{background:rgba(255,255,255,0.9)} }
        @keyframes amv-flash-black  { 0%,100%{background:transparent} 50%{background:rgba(0,0,0,0.95)} }
        @keyframes amv-zoom         { 0%{transform:scale(1)} 50%{transform:scale(1.4)} 100%{transform:scale(1)} }
        @keyframes amv-shake        { 0%{transform:translate(0,0)} 25%{transform:translate(-6px,3px)} 50%{transform:translate(6px,-3px)} 75%{transform:translate(-4px,4px)} 100%{transform:translate(0,0)} }
        @keyframes amv-echo         { 0%{opacity:1} 40%{opacity:0.3;transform:scale(1.05)} 100%{opacity:1} }
        @keyframes amv-ramp         { 0%{filter:blur(3px);transform:scaleX(0.9)} 100%{filter:none;transform:scaleX(1)} }
        @keyframes amv-chroma       { 0%{text-shadow:2px 0 #f00,-2px 0 #00f} 50%{text-shadow:-3px 0 #f00,3px 0 #00f} 100%{text-shadow:2px 0 #f00,-2px 0 #00f} }
        @keyframes amv-panels       { 0%,100%{clip-path:inset(0 0 0 0)} 50%{clip-path:inset(0 30% 0 0)} }
        @keyframes amv-reverse      { 0%{transform:scaleX(1)} 50%{transform:scaleX(-1)} 100%{transform:scaleX(1)} }
        @keyframes amv-glitch       { 0%{filter:none} 33%{filter:hue-rotate(90deg) saturate(3)} 66%{filter:invert(1) brightness(2)} 100%{filter:none} }
        @keyframes amv-strobe       { 0%{background:rgba(255,255,255,0.95)} 50%{background:transparent} }
        @keyframes playhead-pulse   { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .timeline-scroll::-webkit-scrollbar { height: 6px; }
        .timeline-scroll::-webkit-scrollbar-track { background: #111; }
        .timeline-scroll::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
      `}</style>

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <header className="h-12 border-b border-[#333] flex items-center px-4 gap-3 shrink-0 bg-[#111]">
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

        <div className="ml-auto flex items-center gap-2">
          {/* Effect count badge */}
          <span className="text-xs text-[#666] tracking-wider" style={{ fontFamily: 'var(--font-manga)' }}>
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#fbbf24] text-black font-bold border border-[#fbbf24] hover:bg-[#f59e0b] transition-colors"
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            <Zap size={13} /> AUTO AMV
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
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── PREVIEW AREA ─────────────────────────────────────────────── */}
        <div className="h-40 border-b border-[#333] bg-[#0f0f0f] flex items-center justify-center gap-8 px-6 shrink-0">
          {/* Animated preview box */}
          <div className="relative w-48 h-28 border border-[#333] bg-[#1a1a1a] flex items-center justify-center overflow-hidden">
            {/* Manga halftone bg */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle, #2a2a2a 1px, transparent 1px)',
                backgroundSize: '8px 8px',
              }}
            />
            {/* Effect preview overlay */}
            <div
              className="absolute inset-0"
              style={getPreviewStyle(previewType, true)}
            />
            {/* Effect type label */}
            <span
              className="relative z-10 text-lg tracking-widest text-white font-bold"
              style={{ fontFamily: 'var(--font-manga)', textShadow: `0 0 20px ${EFFECT_META[previewType].color}` }}
            >
              {EFFECT_META[previewType].label}
            </span>
            {/* Color accent border */}
            <div
              className="absolute inset-0 border-2 pointer-events-none"
              style={{ borderColor: EFFECT_META[previewType].color, opacity: 0.6 }}
            />
          </div>

          {/* Effect info */}
          <div className="flex flex-col gap-2 min-w-[200px]">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: EFFECT_META[previewType].color }}
              />
              <span
                className="text-sm font-bold tracking-wider text-white"
                style={{ fontFamily: 'var(--font-manga)' }}
              >
                {EFFECT_META[previewType].label}
              </span>
            </div>
            <p className="text-xs text-[#888] leading-relaxed max-w-[220px]">
              {EFFECT_META[previewType].desc}
            </p>
            <div className="flex items-center gap-3 text-xs text-[#666]">
              <span>{effects.filter((e) => e.type === previewType).length} placed</span>
              <span>•</span>
              <span>click timeline to add</span>
            </div>
          </div>

          {/* Zoom controls */}
          <div className="ml-auto flex flex-col gap-1.5 items-center">
            <span className="text-[0.6rem] text-[#555] tracking-widest" style={{ fontFamily: 'var(--font-manga)' }}>ZOOM</span>
            <button
              onClick={() => setPxPerMs((p) => Math.min(0.5, p * 1.3))}
              className="w-7 h-7 flex items-center justify-center border border-[#333] bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#888] hover:text-white transition-colors"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={() => setPxPerMs((p) => Math.max(0.02, p / 1.3))}
              className="w-7 h-7 flex items-center justify-center border border-[#333] bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#888] hover:text-white transition-colors"
            >
              <ZoomOut size={13} />
            </button>
            <span className="text-[0.6rem] text-[#555]">{(pxPerMs * 1000).toFixed(0)}px/s</span>
          </div>
        </div>

        {/* ── EFFECTS PALETTE ───────────────────────────────────────────── */}
        <div className="h-16 border-b border-[#333] bg-[#111] flex items-center px-3 gap-1.5 shrink-0 overflow-x-auto">
          <span className="text-[0.6rem] text-[#555] tracking-widest mr-2 shrink-0" style={{ fontFamily: 'var(--font-manga)' }}>FX</span>
          {EFFECT_TYPES.map((type) => {
            const meta = EFFECT_META[type];
            const isSelected = selectedType === type;
            const isHovered = hoveredType === type;
            const count = effects.filter((e) => e.type === type).length;
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                onMouseEnter={() => setHoveredType(type)}
                onMouseLeave={() => setHoveredType(null)}
                className="relative shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-1.5 border transition-all"
                style={{
                  borderColor: isSelected ? meta.color : '#333',
                  backgroundColor: isSelected ? `${meta.color}22` : isHovered ? '#1a1a1a' : '#0f0f0f',
                  boxShadow: isSelected ? `0 0 12px ${meta.color}44` : 'none',
                }}
              >
                <div
                  className="w-4 h-4 rounded-sm"
                  style={{
                    backgroundColor: meta.color,
                    boxShadow: isSelected || isHovered ? `0 0 8px ${meta.color}88` : 'none',
                    border: type === 'flash_white' ? '1px solid #555' : 'none',
                  }}
                />
                <span
                  className="text-[0.5rem] tracking-wider"
                  style={{
                    fontFamily: 'var(--font-manga)',
                    color: isSelected ? meta.color : '#666',
                  }}
                >
                  {meta.label}
                </span>
                {count > 0 && (
                  <span
                    className="absolute -top-1 -right-1 text-[0.45rem] px-1 py-0 rounded-full font-bold"
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
        <div ref={containerRef} className="flex-1 overflow-hidden flex flex-col bg-[#0a0a0a]">
          {/* Track labels column */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left labels */}
            <div className="w-20 shrink-0 flex flex-col border-r border-[#222] bg-[#0d0d0d]">
              <div className="h-6 border-b border-[#222] flex items-center px-2">
                <span className="text-[0.5rem] text-[#444] tracking-widest" style={{ fontFamily: 'var(--font-manga)' }}>TIME</span>
              </div>
              <div className="h-16 border-b border-[#222] flex items-center px-2">
                <span className="text-[0.5rem] text-[#555] tracking-widest" style={{ fontFamily: 'var(--font-manga)' }}>CLIPS</span>
              </div>
              <div className="flex-1 flex items-center px-2">
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
                <div className="h-6 border-b border-[#222] relative shrink-0 bg-[#0d0d0d]" style={{ width: timelineWidth + 100 }}>
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
                  style={{ width: timelineWidth + 100 }}
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
                        className="absolute top-1 bottom-1 border border-[#444] flex items-center overflow-hidden group"
                        style={{ left: x, width: w, backgroundColor: clr }}
                        onClick={(e) => e.stopPropagation()}
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
                        {/* Duration label */}
                        {w > 50 && (
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

                {/* ── Effects track ─────────────────────────────────────── */}
                <div
                  className="flex-1 relative bg-[#080808] cursor-crosshair"
                  style={{ width: timelineWidth + 100, minHeight: 60 }}
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
                    const meta = EFFECT_META[effect.type];
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
                          if (isSelected) {
                            removeEffect(effect.id);
                            setSelectedEffectId(null);
                          } else {
                            setSelectedEffectId(effect.id);
                          }
                        }}
                        title={`${meta.label} @ ${(effect.timestamp_ms / 1000).toFixed(2)}s — click to select, click again to delete`}
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
                      <span className="text-xs text-[#333]" style={{ fontFamily: 'var(--font-manga)' }}>
                        CLICK TIMELINE TO PLACE EFFECTS — OR HIT AUTO AMV
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Status bar ──────────────────────────────────────────────── */}
          <div className="h-6 border-t border-[#222] bg-[#0d0d0d] flex items-center px-4 gap-4 shrink-0">
            <span className="text-[0.5rem] text-[#444]" style={{ fontFamily: 'var(--font-manga)' }}>
              SELECTED: <span className="text-[#666]">{EFFECT_META[selectedType].label}</span>
            </span>
            <span className="text-[0.5rem] text-[#444]" style={{ fontFamily: 'var(--font-manga)' }}>
              TOTAL: <span className="text-[#666]">{(totalMs / 1000).toFixed(1)}s</span>
            </span>
            <span className="text-[0.5rem] text-[#444]" style={{ fontFamily: 'var(--font-manga)' }}>
              BPM: <span className="text-[#666]">{bpm}</span>
            </span>
            <span className="text-[0.5rem] text-[#444]" style={{ fontFamily: 'var(--font-manga)' }}>
              BEATS: <span className="text-[#666]">{beatTicks.length}</span>
            </span>
            {selectedEffectId && (
              <span className="text-[0.5rem] text-[#fbbf24]" style={{ fontFamily: 'var(--font-manga)' }}>
                EFFECT SELECTED — CLICK AGAIN TO DELETE
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
