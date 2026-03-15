'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { X, Play, Pause, RotateCcw } from 'lucide-react';

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
}

const TRANSITION_MS = 400;

export function TrailerPreview({ clips, musicTrack, onClose }: TrailerPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const playingRef = useRef(false);

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

  // Keep refs in sync so the RAF loop always reads latest values
  const clipTimelineRef = useRef(clipTimeline);
  const totalMsRef = useRef(totalMs);
  useEffect(() => { clipTimelineRef.current = clipTimeline; }, [clipTimeline]);
  useEffect(() => { totalMsRef.current = totalMs; }, [totalMs]);

  // Preload images (runs once on mount)
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

  // Stable draw function stored in a ref — always uses latest clipTimeline via ref
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

    // Nearest scene clip for text_overlay bg
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
      ? 1 - timeToEnd / TRANSITION_MS
      : 0;

    const drawClip = (c: Clip, alpha: number) => {
      ctx.globalAlpha = alpha;
      const effectiveClip = (c.type === 'text_overlay' && !c.generated_media_url && !c.thumbnail_url)
        ? (findNearestScene(idx) ?? c)
        : c;
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
      ctx.fillStyle = '#1a1a2e';
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

    // Progress bar
    const progress = Math.min(ms / total, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(0, H - 3, W * progress, 3);
  });

  // Stable tick stored in a ref — no stale closures, no recreations
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

  // Draw first frame once loaded
  useEffect(() => {
    if (loaded) drawFrameRef.current(0);
  }, [loaded]);

  // Cleanup on unmount — cancel RAF and clear audio src so pending play() resolves cleanly
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    const a = audioRef.current;
    if (a) { a.pause(); a.src = ''; a.load(); }
  }, []);

  // Scrub — seek and keep playing if already playing
  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ms = Math.round(frac * totalMsRef.current);
    if (playingRef.current) {
      // Seek without stopping
      pausedAtRef.current = ms;
      startTimeRef.current = performance.now();
      if (audioRef.current) audioRef.current.currentTime = ms / 1000;
    } else {
      cancelAnimationFrame(rafRef.current);
      pausedAtRef.current = ms;
      setCurrentMs(ms);
      drawFrameRef.current(ms);
      if (audioRef.current) { audioRef.current.currentTime = ms / 1000; }
    }
  };

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex flex-col gap-3 w-full max-w-3xl px-4" onClick={e => e.stopPropagation()}>
        <button className="absolute -top-10 right-4 text-white/70 hover:text-white" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="relative bg-black border-2 border-[#333]" style={{ aspectRatio: '16/9' }}>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
              Loading images…
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

        <div className="flex flex-col gap-2">
          <div
            className="w-full h-2 bg-white/10 cursor-pointer rounded-full overflow-hidden"
            onClick={handleScrub}
          >
            <div
              className="h-full bg-[#a855f7] transition-none"
              style={{ width: `${(currentMs / totalMs) * 100}%` }}
            />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={restart} className="text-white/60 hover:text-white">
              <RotateCcw size={16} />
            </button>
            <button
              onClick={playing ? pause : () => play()}
              disabled={!loaded}
              className="bg-[#a855f7] text-white rounded-full w-9 h-9 flex items-center justify-center hover:bg-[#9333ea] disabled:opacity-40"
            >
              {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
            </button>
            <span className="text-white/50 text-xs font-mono">{fmt(currentMs)} / {fmt(totalMs)}</span>

            {musicTrack && (
              <span className="ml-auto text-white/30 text-xs truncate max-w-[180px]">♪ {musicTrack.name}</span>
            )}
          </div>
        </div>

        {musicTrack?.url && (
          <audio
            ref={audioRef}
            src={musicTrack.url}
            loop={false}
            style={{ display: 'none' }}
            onLoadedMetadata={() => { if (audioRef.current) audioRef.current.volume = musicTrack.volume ?? 0.7; }}
          />
        )}
      </div>
    </div>
  );
}
