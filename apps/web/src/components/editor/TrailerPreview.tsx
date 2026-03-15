'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  X, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  ChevronLeft, ChevronRight, Download, Film, Maximize,
} from 'lucide-react';
import gsap from 'gsap';

// ── Clip filtering ────────────────────────────────────────────────────────────

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
const STRIP_IDS = new Set(['title_card', 'end_card']);

function filterClips(clips: any[]): any[] {
  return clips.filter((c) => {
    if (STRIP_IDS.has(c.id)) return false;
    if (c.type === 'text_overlay') return false;
    const prompt = (c.prompt || '').toLowerCase();
    if (TITLE_CARD_TERMS.some((t) => prompt.includes(t))) return false;
    return true;
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TrailerPreviewProps {
  clips: any[];
  musicTrack?: { url?: string; name?: string; volume?: number } | null;
  compiledUrl?: string | null;
  onClose: () => void;
}

// ── Compiled video player ─────────────────────────────────────────────────────

function VideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    const v = videoRef.current;
    if (v) { v.pause(); v.src = ''; v.load(); }
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 2500);
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = frac * duration;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div
      className="relative bg-black overflow-hidden w-full"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black">
          <div className="w-8 h-8 border-2 border-[#ff3fa4] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <video
        ref={videoRef}
        src={url}
        autoPlay
        muted={muted}
        className="w-full h-full object-contain cursor-pointer"
        onCanPlay={() => { setLoading(false); setPlaying(true); }}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (!v) return;
          setCurrentTime(v.currentTime);
          setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
        }}
        onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration); }}
        onEnded={() => setPlaying(false)}
        onClick={togglePlay}
      />
      {!playing && !loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer" onClick={togglePlay}>
          <div className="w-14 h-14 bg-[#ff3fa4] flex items-center justify-center" style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.5)' }}>
            <Play size={24} className="text-white ml-1" />
          </div>
        </div>
      )}
      <div
        className={`absolute bottom-0 left-0 right-0 z-10 transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.9))' }}
      >
        <div className="mx-3 mb-1 h-1 bg-white/20 cursor-pointer hover:h-1.5 transition-all" onClick={handleScrub}>
          <div className="h-full bg-[#ff3fa4]" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-2 px-3 pb-2">
          <button onClick={togglePlay} className="text-white hover:text-[#ff3fa4] transition-colors">
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button onClick={() => { setMuted(m => !m); if (videoRef.current) videoRef.current.muted = !muted; }} className="text-white/60 hover:text-white transition-colors">
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <span className="text-white/60 text-xs font-mono tabular-nums">{fmt(currentTime)} / {fmt(duration)}</span>
          <div className="flex-1" />
          <a href={url} download className="text-white/50 hover:text-white transition-colors flex items-center gap-1 text-xs">
            <Download size={13} /> Download
          </a>
          <button onClick={() => videoRef.current?.requestFullscreen?.()} className="text-white/50 hover:text-white transition-colors">
            <Maximize size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Clip slideshow ────────────────────────────────────────────────────────────

function ClipSlideshow({ clips, musicTrack }: { clips: any[]; musicTrack?: TrailerPreviewProps['musicTrack'] }) {
  const [clipIdx, setClipIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const thumbStripRef = useRef<HTMLDivElement>(null);

  const current = clips[clipIdx];
  const clipDuration = current?.duration_ms || 2000;

  const tick = useCallback((ts: number) => {
    if (lastTsRef.current === null) lastTsRef.current = ts;
    const delta = ts - lastTsRef.current;
    lastTsRef.current = ts;

    setElapsed(prev => {
      const next = prev + delta;
      if (next >= clipDuration) {
        setClipIdx(i => {
          if (i + 1 >= clips.length) { setPlaying(false); return i; }
          return i + 1;
        });
        lastTsRef.current = null;
        return 0;
      }
      return next;
    });
    rafRef.current = requestAnimationFrame(tick);
  }, [clipDuration, clips.length]);

  useEffect(() => {
    if (playing) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, tick]);

  // Reset elapsed on clip change
  useEffect(() => {
    setElapsed(0);
    lastTsRef.current = null;
  }, [clipIdx]);

  // Sync audio with playing state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.play().catch(() => {});
    else audio.pause();
  }, [playing]);

  // Scroll thumbnail into view
  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const thumb = strip.children[clipIdx] as HTMLElement;
    if (thumb) thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [clipIdx]);

  const mediaUrl = current?.generated_media_url || current?.thumbnail_url;
  const isVideo = current?.type === 'video' && current?.generated_media_url;
  const progress = clipDuration > 0 ? (elapsed / clipDuration) * 100 : 0;

  const go = (dir: number) => {
    setClipIdx(i => Math.max(0, Math.min(clips.length - 1, i + dir)));
    setElapsed(0);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Main display */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {mediaUrl ? (
          isVideo ? (
            <video
              key={mediaUrl}
              src={mediaUrl}
              autoPlay={playing}
              muted
              loop={false}
              className="max-w-full max-h-full object-contain"
              style={{ aspectRatio: '16/9' }}
            />
          ) : (
            <img
              key={mediaUrl}
              src={mediaUrl}
              alt=""
              className="max-w-full max-h-full object-contain"
              style={{ aspectRatio: '16/9' }}
            />
          )
        ) : (
          <div className="w-full flex items-center justify-center" style={{ aspectRatio: '16/9', background: '#111' }}>
            <div className="text-center">
              <Film size={32} className="text-white/20 mx-auto mb-2" />
              <p className="text-white/30 text-xs">No media generated</p>
            </div>
          </div>
        )}

        {/* Prev/Next */}
        <button
          className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/60 hover:bg-[#ff3fa4] flex items-center justify-center transition-colors disabled:opacity-20"
          onClick={() => go(-1)}
          disabled={clipIdx === 0}
        >
          <ChevronLeft size={18} className="text-white" />
        </button>
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/60 hover:bg-[#ff3fa4] flex items-center justify-center transition-colors disabled:opacity-20"
          onClick={() => go(1)}
          disabled={clipIdx === clips.length - 1}
        >
          <ChevronRight size={18} className="text-white" />
        </button>

        {/* Clip counter badge */}
        <div className="absolute top-2 right-2 bg-black/70 px-2 py-0.5 text-white/60 text-xs font-mono">
          {clipIdx + 1} / {clips.length}
        </div>
      </div>

      {/* Clip progress bar */}
      <div className="h-0.5 bg-white/10 shrink-0">
        <div className="h-full bg-[#ff3fa4] transition-none" style={{ width: `${progress}%` }} />
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#111] shrink-0">
        <button onClick={() => { setClipIdx(0); setElapsed(0); setPlaying(false); }} className="text-white/40 hover:text-white transition-colors">
          <SkipBack size={15} />
        </button>
        <button
          onClick={() => setPlaying(p => !p)}
          className="w-8 h-8 bg-[#ff3fa4] hover:bg-[#c0005e] flex items-center justify-center transition-colors"
        >
          {playing ? <Pause size={13} className="text-white" /> : <Play size={13} className="text-white ml-0.5" />}
        </button>
        <button onClick={() => go(1)} className="text-white/40 hover:text-white transition-colors">
          <SkipForward size={15} />
        </button>
        <div className="flex-1" />
        {musicTrack?.url && (
          <>
            <audio ref={audioRef} src={musicTrack.url} loop muted={muted} />
            <button onClick={() => setMuted(m => !m)} className="text-white/40 hover:text-white transition-colors">
              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
            <span className="text-white/30 text-xs truncate max-w-[120px]">{musicTrack.name}</span>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      <div
        ref={thumbStripRef}
        className="flex gap-1 px-2 py-2 bg-[#0a0a0a] overflow-x-auto shrink-0"
        style={{ borderTop: '1px solid #1f1f1f', scrollbarWidth: 'none' }}
      >
        {clips.map((c, i) => {
          const thumb = c.thumbnail_url || c.generated_media_url;
          return (
            <button
              key={c.id || i}
              onClick={() => { setClipIdx(i); setElapsed(0); }}
              className={`shrink-0 w-14 h-9 overflow-hidden transition-all ${i === clipIdx ? 'ring-2 ring-[#ff3fa4] opacity-100' : 'opacity-40 hover:opacity-70'}`}
            >
              {thumb ? (
                <img src={thumb} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#222] flex items-center justify-center">
                  <span className="text-white/20 text-[8px]">{i + 1}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function TrailerPreview({ clips: rawClips, musicTrack, compiledUrl, onClose }: TrailerPreviewProps) {
  const filteredClips = useMemo(() => filterClips(rawClips), [rawClips]);
  const [tab, setTab] = useState<'video' | 'clips'>(compiledUrl ? 'video' : 'clips');

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) return;
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' });
    gsap.fromTo(panel, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'back.out(1.4)', delay: 0.05 });
  }, []);

  const handleClose = useCallback(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) { onClose(); return; }
    gsap.to(panel, { y: 20, opacity: 0, duration: 0.18, ease: 'power2.in' });
    gsap.to(backdrop, { opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: onClose });
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-4xl mx-4 flex flex-col bg-[#0a0a0a] overflow-hidden"
        style={{ border: '2px solid #333', boxShadow: '0 0 60px rgba(0,0,0,0.8)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#111] shrink-0" style={{ borderBottom: '1px solid #222' }}>
          <div className="flex items-center gap-3">
            <Film size={14} className="text-[#ff3fa4]" />
            <span className="text-white text-xs tracking-widest uppercase" style={{ fontFamily: 'var(--font-manga)' }}>
              Preview
            </span>
            {/* Tab switcher */}
            {compiledUrl && (
              <div className="flex ml-3" style={{ border: '1px solid #333' }}>
                <button
                  onClick={() => setTab('video')}
                  className={`px-3 py-0.5 text-xs transition-colors ${tab === 'video' ? 'bg-[#ff3fa4] text-white' : 'text-white/40 hover:text-white'}`}
                >
                  Compiled
                </button>
                <button
                  onClick={() => setTab('clips')}
                  className={`px-3 py-0.5 text-xs transition-colors ${tab === 'clips' ? 'bg-[#ff3fa4] text-white' : 'text-white/40 hover:text-white'}`}
                >
                  Clips ({filteredClips.length})
                </button>
              </div>
            )}
          </div>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
            <X size={17} />
          </button>
        </div>

        {/* Content */}
        {tab === 'video' && compiledUrl ? (
          <VideoPlayer url={compiledUrl} onClose={handleClose} />
        ) : filteredClips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Film size={36} className="text-white/20 mb-3" />
            <p className="text-white/40 text-sm">No clips to preview.</p>
            <p className="text-white/20 text-xs mt-1">Generate some clips first.</p>
          </div>
        ) : (
          <ClipSlideshow clips={filteredClips} musicTrack={musicTrack ?? undefined} />
        )}
      </div>
    </div>
  );
}
