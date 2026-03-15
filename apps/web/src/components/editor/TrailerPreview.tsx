'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { X, Play, Pause, RotateCcw, Film, Volume2 } from 'lucide-react';
import gsap from 'gsap';

interface Clip {
  id: string;
  order: number;
  type: string;
  duration_ms: number;
  prompt: string;
  text?: string;
  text_style?: { font_size?: number; color?: string; position?: string; animation?: string };
  transition_type?: string;
  generated_media_url?: string;
  thumbnail_url?: string;
}

interface TrailerPreviewProps {
  clips: Clip[];
  musicTrack?: { url: string; name: string; volume?: number } | null;
  onClose: () => void;
  projectTitle?: string;
}

const TRANSITION_MS = 400;

export function TrailerPreview({ clips, musicTrack, onClose, projectTitle }: TrailerPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const playingRef = useRef(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const sortedClips = useMemo(() => [...clips].sort((a, b) => a.order - b.order), [clips]);
  const totalMs = useMemo(() => sortedClips.reduce((s, c) => s + c.duration_ms, 0), [sortedClips]);
  const clipTimeline = useMemo(() => {
    let t = 0;
    return sortedClips.map(c => {
      const start = t;
      t += c.duration_ms;
      return { clip: c, startMs: start, endMs: t };
    });
  }, [sortedClips]);

  const clipTimelineRef = useRef(clipTimeline);
  const totalMsRef = useRef(totalMs);
  useEffect(() => { clipTimelineRef.current = clipTimeline; }, [clipTimeline]);
  useEffect(() => { totalMsRef.current = totalMs; }, [totalMs]);

  // ── Entry animation ────────────────────────────────────────────────────────
  useEffect(() => {
    const backdrop = backdropRef.current;
    const modal = modalRef.current;
    if (!backdrop || !modal) return;

    gsap.fromTo(backdrop,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: 'power2.out' }
    );
    gsap.fromTo(modal,
      { scale: 0.88, y: 32, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.38, ease: 'back.out(1.6)', delay: 0.05 }
    );
  }, []);

  const handleClose = () => {
    const backdrop = backdropRef.current;
    const modal = modalRef.current;
    if (modal) {
      gsap.to(modal, { scale: 0.92, y: 16, opacity: 0, duration: 0.22, ease: 'power2.in' });
    }
    if (backdrop) {
      gsap.to(backdrop, { opacity: 0, duration: 0.25, delay: 0.08, ease: 'power2.in', onComplete: onClose });
    } else {
      onClose();
    }
  };

  // ── Image preloading ───────────────────────────────────────────────────────
  useEffect(() => {
    const urls = sortedClips
      .filter(c => c.generated_media_url || c.thumbnail_url)
      .map(c => (c.generated_media_url || c.thumbnail_url)!);

    if (urls.length === 0) { setLoaded(true); return; }

    let done = 0;
    urls.forEach(url => {
      if (imagesRef.current.has(url)) {
        done++;
        if (done === urls.length) setLoaded(true);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = () => {
        done++;
        if (done === urls.length) setLoaded(true);
      };
      img.src = url;
      imagesRef.current.set(url, img);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Canvas draw ────────────────────────────────────────────────────────────
  const drawFrameRef = useRef((ms: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const ct = clipTimelineRef.current;
    const total = totalMsRef.current;

    const idx = ct.findIndex(e => ms < e.endMs);
    if (idx < 0) return;
    const { clip, endMs } = ct[idx];
    const nextEntry = ct[idx + 1];

    const findNearestScene = (fromIdx: number): Clip | null => {
      for (let i = fromIdx - 1; i >= 0; i--) {
        const c = ct[i].clip;
        if (c.type !== 'text_overlay' && (c.generated_media_url || c.thumbnail_url)) return c;
      }
      for (let i = fromIdx + 1; i < ct.length; i++) {
        const c = ct[i].clip;
        if (c.type !== 'text_overlay' && (c.generated_media_url || c.thumbnail_url)) return c;
      }
      return null;
    };

    const timeToEnd = endMs - ms;
    const transAlpha = clip.transition_type !== 'cut' && timeToEnd < TRANSITION_MS
      ? 1 - timeToEnd / TRANSITION_MS : 0;

    const drawClip = (c: Clip, alpha: number) => {
      ctx.globalAlpha = alpha;
      const effectiveClip = (c.type === 'text_overlay' && !c.generated_media_url && !c.thumbnail_url)
        ? (findNearestScene(idx) ?? c) : c;
      const url = effectiveClip.generated_media_url || effectiveClip.thumbnail_url;
      if (url && imagesRef.current.has(url)) {
        const img = imagesRef.current.get(url)!;
        if (img.complete && img.naturalWidth > 0) {
          const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
          const sw = img.naturalWidth * scale, sh = img.naturalHeight * scale;
          ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
          if (c.type === 'text_overlay') {
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = alpha;
          }
          return;
        }
      }
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, W, H);
    };

    ctx.clearRect(0, 0, W, H);
    drawClip(clip, 1);
    if (transAlpha > 0 && nextEntry) drawClip(nextEntry.clip, transAlpha);
    ctx.globalAlpha = 1;

    // Text overlay
    const textClip = transAlpha < 0.5 ? clip : (nextEntry?.clip ?? clip);
    if (textClip.text || textClip.type === 'text_overlay') {
      const txt = textClip.text || textClip.prompt?.split('.')[0] || '';
      if (txt) {
        const style = textClip.text_style || {};
        const fontSize = Math.round((style.font_size || 36) * (W / 1080));
        const color = style.color || '#ffffff';
        const pos = style.position || 'center';
        ctx.font = `bold ${fontSize}px 'Bangers', sans-serif`;
        ctx.textAlign = 'center';
        const lines = txt.split('\n');
        const lineH = fontSize * 1.3;
        const totalTextH = lines.length * lineH;
        const y = pos === 'top' ? fontSize + 20
          : pos === 'bottom' ? H - totalTextH - 20
          : (H - totalTextH) / 2;
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = fontSize * 0.08;
        lines.forEach((line, i) => {
          const ly = y + i * lineH;
          ctx.strokeText(line, W / 2, ly);
          ctx.fillStyle = color;
          ctx.fillText(line, W / 2, ly);
        });
        ctx.shadowBlur = 0;
      }
    }

    // Progress bar (inside canvas, bottom 4px)
    const progress = Math.min(ms / total, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, H - 4, W, 4);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(0, H - 4, W * progress, 4);
  });

  const tickRef = useRef(() => {
    const elapsed = performance.now() - startTimeRef.current + pausedAtRef.current;
    const ms = Math.min(elapsed, totalMsRef.current);
    setCurrentMs(ms);
    drawFrameRef.current(ms);
    if (ms < totalMsRef.current) {
      rafRef.current = requestAnimationFrame(tickRef.current);
    } else {
      playingRef.current = false;
      setPlaying(false);
      pausedAtRef.current = totalMsRef.current;
    }
  });

  const play = (fromMs?: number) => {
    cancelAnimationFrame(rafRef.current);
    if (fromMs !== undefined) pausedAtRef.current = fromMs;
    else if (pausedAtRef.current >= totalMsRef.current) pausedAtRef.current = 0;
    startTimeRef.current = performance.now();
    playingRef.current = true;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tickRef.current);
    if (audioRef.current) {
      audioRef.current.currentTime = pausedAtRef.current / 1000;
      audioRef.current.play().catch(() => {});
    }
  };

  const pause = () => {
    cancelAnimationFrame(rafRef.current);
    pausedAtRef.current = currentMs;
    playingRef.current = false;
    setPlaying(false);
    audioRef.current?.pause();
  };

  const restart = () => {
    cancelAnimationFrame(rafRef.current);
    pausedAtRef.current = 0;
    playingRef.current = false;
    setPlaying(false);
    setCurrentMs(0);
    drawFrameRef.current(0);
    if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.pause(); }
  };

  useEffect(() => {
    if (loaded) drawFrameRef.current(0);
  }, [loaded]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    const a = audioRef.current;
    if (a) { a.pause(); a.src = ''; a.load(); }
  }, []);

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ms = Math.round(frac * totalMsRef.current);
    if (playingRef.current) {
      pausedAtRef.current = ms;
      startTimeRef.current = performance.now();
      if (audioRef.current) audioRef.current.currentTime = ms / 1000;
    } else {
      cancelAnimationFrame(rafRef.current);
      pausedAtRef.current = ms;
      setCurrentMs(ms);
      drawFrameRef.current(ms);
      if (audioRef.current) audioRef.current.currentTime = ms / 1000;
    }
  };

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progressPct = totalMs > 0 ? Math.min((currentMs / totalMs) * 100, 100) : 0;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={handleClose}
    >
      {/* Manga halftone dot overlay on backdrop */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="preview-dots" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="1.2" fill="#fff" opacity="0.04" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#preview-dots)" />
      </svg>

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full mx-4 bg-white flex flex-col"
        style={{
          maxWidth: 820,
          border: '3px solid #111',
          boxShadow: '8px 8px 0px #111',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b-2 border-[#111] shrink-0"
          style={{ background: '#111' }}
        >
          <Film size={14} className="text-[#a855f7] shrink-0" />
          <div className="flex-1 min-w-0">
            <span
              className="text-sm font-black tracking-widest text-white uppercase"
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              {projectTitle ? `${projectTitle}` : 'TRAILER PREVIEW'}
            </span>
            <span
              className="text-[0.52rem] text-white/40 ml-2 font-bold tracking-widest"
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              {sortedClips.length} CLIPS · {fmt(totalMs)}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Canvas area */}
        <div
          className="relative bg-[#0d0d0d]"
          style={{ aspectRatio: '16/9' }}
        >
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              {/* Manga-style loading spinner */}
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-2 border-[#333] rounded-full" />
                <div
                  className="absolute inset-0 border-2 border-transparent border-t-[#a855f7] rounded-full animate-spin"
                  style={{ animationDuration: '0.8s' }}
                />
              </div>
              <span
                className="text-[0.6rem] text-white/40 tracking-widest font-bold uppercase"
                style={{ fontFamily: 'var(--font-manga)' }}
              >
                Loading…
              </span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full"
            style={{ display: loaded ? 'block' : 'none' }}
          />
        </div>

        {/* Controls bar */}
        <div className="px-4 py-3 border-t-2 border-[#111] bg-white space-y-2.5">

          {/* Scrubber */}
          <div
            className="relative w-full h-2 bg-[#e5e5e5] cursor-pointer group"
            style={{ border: '1.5px solid #ccc' }}
            onClick={handleScrub}
          >
            {/* Fill */}
            <div
              className="absolute inset-y-0 left-0 bg-[#a855f7] transition-none"
              style={{ width: `${progressPct}%` }}
            />
            {/* Playhead thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#a855f7] border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                left: `${progressPct}%`,
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 0 2px #a855f7',
              }}
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-2">
            {/* Restart */}
            <button
              onClick={restart}
              className="w-8 h-8 flex items-center justify-center text-[#888] hover:text-[#111] hover:bg-[#f0f0f0] transition-colors border border-[#e5e5e5]"
              title="Restart"
            >
              <RotateCcw size={14} />
            </button>

            {/* Play / Pause — main button */}
            <button
              onClick={playing ? pause : () => play()}
              disabled={!loaded}
              className="flex items-center justify-center gap-1.5 px-4 h-8 font-black text-[0.65rem] text-white transition-all disabled:opacity-40 tracking-widest"
              style={{
                background: '#111',
                border: '2px solid #111',
                boxShadow: playing ? 'none' : '3px 3px 0px #a855f7',
                fontFamily: 'var(--font-manga)',
                transform: playing ? 'translate(2px, 2px)' : undefined,
              }}
            >
              {playing
                ? <><Pause size={12} /> PAUSE</>
                : <><Play size={12} className="ml-0.5" /> PLAY</>
              }
            </button>

            {/* Timecode */}
            <span
              className="text-xs text-[#888] font-mono"
              style={{ fontFamily: 'var(--font-manga)', fontSize: '0.62rem' }}
            >
              {fmt(currentMs)} <span className="text-[#ccc]">/</span> {fmt(totalMs)}
            </span>

            {/* Music label */}
            {musicTrack && (
              <div className="ml-auto flex items-center gap-1.5 min-w-0">
                <Volume2 size={11} className="text-[#bbb] shrink-0" />
                <span
                  className="text-[0.55rem] text-[#bbb] truncate max-w-[140px]"
                  style={{ fontFamily: 'var(--font-manga)' }}
                >
                  {musicTrack.name}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Corner accent — top right manga speed-line decoration */}
        <div
          className="absolute top-0 right-0 pointer-events-none"
          style={{ width: 60, height: 60, overflow: 'hidden' }}
        >
          <div
            style={{
              position: 'absolute', top: 0, right: 0,
              width: 0, height: 0,
              borderStyle: 'solid',
              borderWidth: '0 60px 60px 0',
              borderColor: 'transparent #a855f7 transparent transparent',
              opacity: 0.15,
            }}
          />
        </div>
      </div>

      {musicTrack?.url && (
        <audio
          ref={audioRef}
          src={musicTrack.url}
          loop={false}
          style={{ display: 'none' }}
          onLoadedMetadata={() => {
            if (audioRef.current) audioRef.current.volume = musicTrack.volume ?? 0.7;
          }}
        />
      )}
    </div>
  );
}
