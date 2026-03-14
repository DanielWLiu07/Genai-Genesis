'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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

const TRANSITION_MS = 400; // dissolve duration

export function TrailerPreview({ clips, musicTrack, onClose }: TrailerPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Pre-load all images
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const sortedClips = [...clips].sort((a, b) => a.order - b.order);
  const totalMs = sortedClips.reduce((s, c) => s + c.duration_ms, 0);

  // Build clip timeline: [{clip, startMs, endMs}]
  const clipTimeline = (() => {
    let t = 0;
    return sortedClips.map(c => {
      const start = t;
      t += c.duration_ms;
      return { clip: c, startMs: start, endMs: t };
    });
  })();

  // Preload images
  useEffect(() => {
    const urls = sortedClips
      .filter(c => c.generated_media_url || c.thumbnail_url)
      .map(c => (c.generated_media_url || c.thumbnail_url)!);

    if (urls.length === 0) { setLoaded(true); return; }

    let done = 0;
    urls.forEach(url => {
      if (imagesRef.current.has(url)) { done++; if (done === urls.length) setLoaded(true); return; }
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

  const drawFrame = useCallback((ms: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;

    // Find current and next clip
    const idx = clipTimeline.findIndex(e => ms < e.endMs);
    if (idx < 0) return;
    const { clip, startMs, endMs } = clipTimeline[idx];
    const nextEntry = clipTimeline[idx + 1];

    // How far into transition to next clip
    const timeToEnd = endMs - ms;
    const transAlpha = clip.transition_type !== 'cut' && timeToEnd < TRANSITION_MS
      ? 1 - timeToEnd / TRANSITION_MS  // 0→1 as we approach end
      : 0;

    const drawClip = (c: Clip, alpha: number) => {
      ctx.globalAlpha = alpha;
      const url = c.generated_media_url || c.thumbnail_url;
      if (url && imagesRef.current.has(url)) {
        const img = imagesRef.current.get(url)!;
        if (img.complete && img.naturalWidth > 0) {
          // Cover-fit
          const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
          const sw = img.naturalWidth * scale, sh = img.naturalHeight * scale;
          ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
          return;
        }
      }
      // Fallback: dark scene bg
      ctx.fillStyle = c.type === 'text_overlay' ? '#0a0a0a' : '#1a1a2e';
      ctx.fillRect(0, 0, W, H);
    };

    ctx.clearRect(0, 0, W, H);
    drawClip(clip, 1);

    // Dissolve overlay with next clip
    if (transAlpha > 0 && nextEntry) {
      drawClip(nextEntry.clip, transAlpha);
    }

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

        // Measure for background
        const lines = txt.split('\n');
        const lineH = fontSize * 1.3;
        const totalTextH = lines.length * lineH;
        const y = pos === 'top' ? fontSize + 20
          : pos === 'bottom' ? H - totalTextH - 20
          : (H - totalTextH) / 2;

        // Shadow + stroke for readability
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
    const progress = Math.min(ms / totalMs, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(0, H - 3, W * progress, 3);
  }, [clipTimeline, totalMs]);

  // Animation loop
  const tick = useCallback(() => {
    const elapsed = performance.now() - startTimeRef.current + pausedAtRef.current;
    const ms = Math.min(elapsed, totalMs);
    setCurrentMs(ms);
    drawFrame(ms);
    if (ms < totalMs) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setPlaying(false);
      pausedAtRef.current = totalMs;
    }
  }, [drawFrame, totalMs]);

  const play = useCallback(() => {
    if (pausedAtRef.current >= totalMs) pausedAtRef.current = 0;
    startTimeRef.current = performance.now();
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
    if (audioRef.current) {
      audioRef.current.currentTime = pausedAtRef.current / 1000;
      audioRef.current.play().catch(() => {});
    }
  }, [tick, totalMs]);

  const pause = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    pausedAtRef.current = currentMs;
    setPlaying(false);
    audioRef.current?.pause();
  }, [currentMs]);

  const restart = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    pausedAtRef.current = 0;
    setCurrentMs(0);
    drawFrame(0);
    if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.pause(); }
    setPlaying(false);
  }, [drawFrame]);

  // Draw first frame on load
  useEffect(() => {
    if (loaded) drawFrame(0);
  }, [loaded, drawFrame]);

  // Cleanup
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  // Scrub
  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const ms = Math.round(frac * totalMs);
    cancelAnimationFrame(rafRef.current);
    pausedAtRef.current = ms;
    setCurrentMs(ms);
    drawFrame(ms);
    setPlaying(false);
    if (audioRef.current) { audioRef.current.currentTime = ms / 1000; audioRef.current.pause(); }
  };

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex flex-col gap-3 w-full max-w-3xl px-4" onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button className="absolute -top-10 right-4 text-white/70 hover:text-white" onClick={onClose}>
          <X size={20} />
        </button>

        {/* Canvas */}
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

        {/* Controls */}
        <div className="flex flex-col gap-2">
          {/* Scrubber */}
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
              onClick={playing ? pause : play}
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

        {/* Hidden audio */}
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
