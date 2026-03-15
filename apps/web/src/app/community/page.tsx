'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { TransitionLink as Link } from '@/components/PageTransition';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX, Heart, Eye, BookOpen,
  ChevronUp, ChevronDown, Search, Filter, Clock, Sparkles, Film, Users, Library,
} from 'lucide-react';
import gsap from 'gsap';
import BookAvailability from '@/components/community/BookAvailability';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Clip {
  id: string;
  order: number;
  type: string;
  duration_ms: number;
  prompt: string;
  generated_media_url?: string;
  thumbnail_url?: string;
}

interface TrailerProject {
  id: string;
  title: string;
  author?: string;
  description?: string;
  cover_image_url?: string | null;
  status?: string;
  created_at?: string;
  clips: Clip[];
  music_track?: { url: string; name: string; volume?: number } | null;
  compiled_url?: string | null;
  likeCount: number;
  viewCount: number;
  liked: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coverGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue},18%,80%) 0%, hsl(${(hue + 40) % 360},12%,68%) 100%)`;
}

function fmtNum(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const MANGA_TITLE: React.CSSProperties = {
  fontFamily: 'var(--font-manga)',
  color: '#fff',
  WebkitTextStroke: '2px #111',
  paintOrder: 'stroke fill',
  textShadow: '3px 3px 0px #000',
};

// ─── Reel Card ────────────────────────────────────────────────────────────────

function ReelCard({
  project,
  active,
  onLike,
}: {
  project: TrailerProject;
  active: boolean;
  onLike: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [showBorrow, setShowBorrow] = useState(false);
  const heartRef = useRef<HTMLDivElement>(null);
  const borrowRef = useRef<HTMLDivElement>(null);

  // Animate borrow panel in/out
  useEffect(() => {
    if (!borrowRef.current) return;
    if (showBorrow) {
      gsap.fromTo(borrowRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' });
    }
  }, [showBorrow]);

  // compiled video > first video clip > first image clip
  const videoSrc = project.compiled_url
    || project.clips.find(c => c.type === 'video' && c.generated_media_url)?.generated_media_url;
  const thumbSrc = project.clips.find(c => c.thumbnail_url)?.thumbnail_url
    || project.clips.find(c => c.generated_media_url)?.generated_media_url
    || project.cover_image_url;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      v.pause();
      v.currentTime = 0;
      setPlaying(false);
    }
  }, [active]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const doubleTap = () => {
    onLike(project.id);
    setShowHeart(true);
    if (heartRef.current) {
      gsap.fromTo(heartRef.current,
        { scale: 0, opacity: 1 },
        { scale: 1.6, opacity: 0, duration: 0.7, ease: 'back.out(1.5)', onComplete: () => setShowHeart(false) }
      );
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          loop
          muted={muted}
          playsInline
          poster={thumbSrc || undefined}
          className="absolute inset-0 w-full h-full object-cover"
          onClick={togglePlay}
          onDoubleClick={doubleTap}
        />
      ) : thumbSrc ? (
        <img src={thumbSrc} alt={project.title} className="absolute inset-0 w-full h-full object-cover" onDoubleClick={doubleTap} />
      ) : (
        <div className="absolute inset-0" style={{ background: coverGradient(project.title) }} onDoubleClick={doubleTap} />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

      {/* Double-tap heart */}
      {showHeart && (
        <div ref={heartRef} className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <Heart size={96} className="text-[#a855f7] fill-[#a855f7]" />
        </div>
      )}

      {/* Play / pause indicator */}
      {!playing && videoSrc && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center border-2 border-white/40">
            <Play size={28} className="text-white ml-1" />
          </div>
        </div>
      )}

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-14 p-5 z-10 pointer-events-none">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-[#a855f7] flex items-center justify-center text-white text-xs font-bold">
            {(project.author || project.title)[0].toUpperCase()}
          </div>
          <span className="text-white/80 text-sm font-medium">{project.author || 'Anonymous'}</span>
        </div>
        <h2 className="text-white text-xl font-black mb-1 leading-tight" style={MANGA_TITLE}>
          {project.title}
        </h2>
        {project.description && (
          <p className="text-white/60 text-xs line-clamp-2">{project.description}</p>
        )}
        {project.music_track?.name && (
          <div className="flex items-center gap-1 mt-2 text-white/50 text-[0.65rem]">
            <span style={{ display: 'inline-block', animationDuration: '3s' }} className="animate-spin">♪</span>
            <span className="truncate max-w-[200px]">{project.music_track.name}</span>
          </div>
        )}
      </div>

      {/* Right action bar */}
      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5 z-10">
        <button onClick={() => onLike(project.id)} className="flex flex-col items-center gap-1 group">
          <Heart size={28} className={`transition-all group-hover:scale-125 ${project.liked ? 'text-[#a855f7] fill-[#a855f7]' : 'text-white'}`} />
          <span className="text-white text-xs">{fmtNum(project.likeCount)}</span>
        </button>
        <div className="flex flex-col items-center gap-1">
          <Eye size={24} className="text-white" />
          <span className="text-white text-xs">{fmtNum(project.viewCount)}</span>
        </div>
        <Link href={`/project/${project.id}`} className="flex flex-col items-center gap-1 group">
          <Film size={24} className="text-white group-hover:text-[#a855f7] transition-colors" />
          <span className="text-white text-xs">Open</span>
        </Link>
        <button
          onClick={() => setShowBorrow(b => !b)}
          className="flex flex-col items-center gap-1 group"
          title="Borrow this book"
        >
          <Library size={22} className={`transition-colors ${showBorrow ? 'text-[#a855f7]' : 'text-white group-hover:text-[#a855f7]'}`} />
          <span className="text-white text-xs">Borrow</span>
        </button>
        <button onClick={() => setMuted(m => !m)} className="flex flex-col items-center gap-1">
          {muted ? <VolumeX size={22} className="text-white" /> : <Volume2 size={22} className="text-white" />}
        </button>
      </div>

      {/* Borrow panel — slides up from bottom */}
      {showBorrow && (
        <div
          ref={borrowRef}
          className="absolute bottom-0 left-0 right-14 z-20"
        >
          <BookAvailability
            title={project.title}
            author={project.author}
            variant="reel"
            onClose={() => setShowBorrow(false)}
          />
        </div>
      )}

      {/* Compiled badge */}
      {project.compiled_url && (
        <div className="absolute top-4 left-4 bg-[#a855f7]/80 text-white text-[0.55rem] px-2 py-0.5 uppercase tracking-widest z-10 flex items-center gap-1">
          <Film size={8} /> Compiled
        </div>
      )}
    </div>
  );
}

// ─── Browse Card ──────────────────────────────────────────────────────────────

function BrowseCard({ project, onLike }: { project: TrailerProject; onLike: (id: string) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cover = project.cover_image_url
    || project.clips.find(c => c.thumbnail_url)?.thumbnail_url
    || project.clips.find(c => c.generated_media_url)?.generated_media_url;

  return (
    <div
      ref={cardRef}
      className="group relative cursor-pointer"
      onMouseEnter={() => cardRef.current && gsap.to(cardRef.current, { y: -6, rotation: -1.5, duration: 0.25, ease: 'power2.out' })}
      onMouseLeave={() => cardRef.current && gsap.to(cardRef.current, { y: 0, rotation: 0, duration: 0.3, ease: 'elastic.out(1,0.5)' })}
    >
      {/* Spine */}
      <div className="absolute left-0 top-1 bottom-1 w-2 border border-[#bbb] z-10" style={{ background: coverGradient(project.title) }} />

      {/* Cover */}
      <div className="relative ml-2 border-2 border-[#ccc] overflow-hidden" style={{ aspectRatio: '2/3' }}>
        {cover ? (
          <img src={cover} alt={project.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-3" style={{ background: coverGradient(project.title) }}>
            <span className="text-center text-sm font-black leading-tight" style={{ ...MANGA_TITLE, fontSize: 14 }}>
              {project.title}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2">
          <Link
            href={`/project/${project.id}`}
            className="bg-[#a855f7] text-white text-[0.6rem] px-3 py-1.5 font-bold hover:bg-[#9333ea] transition-colors w-full text-center"
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            OPEN
          </Link>
          <button
            onClick={e => { e.stopPropagation(); onLike(project.id); }}
            className={`flex items-center gap-1 text-[0.6rem] px-3 py-1 w-full justify-center border transition-colors ${project.liked ? 'bg-[#a855f7]/20 border-[#a855f7] text-[#a855f7]' : 'border-white/40 text-white hover:border-[#a855f7]'}`}
          >
            <Heart size={10} className={project.liked ? 'fill-[#a855f7] text-[#a855f7]' : ''} />
            {project.liked ? 'Liked' : 'Like'}
          </button>
          {/* Quick borrow links — no API call needed */}
          <a
            href={`https://www.worldcat.org/search?q=${encodeURIComponent([project.title, project.author].filter(Boolean).join(' '))}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-[0.6rem] px-3 py-1 w-full justify-center border border-sky-400/60 text-sky-300 hover:border-sky-300 transition-colors"
          >
            <Library size={9} /> Library
          </a>
          <a
            href={`https://openlibrary.org/search?title=${encodeURIComponent(project.title)}${project.author ? `&author=${encodeURIComponent(project.author)}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-[0.6rem] px-3 py-1 w-full justify-center border border-emerald-400/60 text-emerald-300 hover:border-emerald-300 transition-colors"
          >
            <BookOpen size={9} /> Read Online
          </a>
        </div>

        {/* Compiled badge */}
        {project.compiled_url && (
          <div className="absolute top-1.5 left-1.5 bg-[#a855f7]/90 text-white text-[0.45rem] px-1.5 py-0.5 flex items-center gap-0.5">
            <Film size={7} /> VIDEO
          </div>
        )}
      </div>

      {/* Info */}
      <div className="ml-2 mt-1.5 px-0.5">
        <p className="text-[#111] text-xs font-black leading-tight truncate" style={{ fontFamily: 'var(--font-manga)', WebkitTextStroke: '0.3px #111' }}>
          {project.title}
        </p>
        <p className="text-[#888] text-[0.6rem] truncate">{project.author || 'Anonymous'}</p>
        <div className="flex items-center gap-2 mt-1 text-[0.55rem] text-[#aaa]">
          <span className="flex items-center gap-0.5"><Heart size={9} />{fmtNum(project.likeCount)}</span>
          <span className="flex items-center gap-0.5"><Eye size={9} />{fmtNum(project.viewCount)}</span>
          {project.clips.length > 0 && <span className="flex items-center gap-0.5"><Film size={9} />{project.clips.length}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'reels' | 'browse';
type SortBy = 'recent' | 'popular' | 'clips';

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>('reels');
  const [projects, setProjects] = useState<TrailerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReel, setActiveReel] = useState(0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const reelsContainerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/community')
      .then(r => r.json())
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        const enriched: TrailerProject[] = rows.map(p => ({
          ...p,
          likeCount: (p.id.charCodeAt(0) * 17 + p.id.charCodeAt(1) * 7) % 900 + 12,
          viewCount: (p.id.charCodeAt(0) * 43 + p.id.charCodeAt(2) * 13) % 4800 + 100,
          liked: false,
        }));
        setProjects(enriched);
      })
      .catch(() => setProjects([]))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mainRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.comm-header', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' });
      gsap.fromTo('.comm-tabs', { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, delay: 0.15, ease: 'power2.out' });
    }, mainRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (tab !== 'browse') return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.browse-card', { y: 20, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.4, stagger: 0.04, ease: 'power2.out', delay: 0.05 });
    }, mainRef);
    return () => ctx.revert();
  }, [tab, projects]);

  const handleLike = useCallback((id: string) => {
    setProjects(ps => ps.map(p =>
      p.id === id ? { ...p, liked: !p.liked, likeCount: p.likeCount + (p.liked ? -1 : 1) } : p
    ));
  }, []);

  const scrollReel = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(reelProjects.length - 1, activeReel + dir));
    setActiveReel(next);
    const container = reelsContainerRef.current;
    if (container) {
      container.scrollTo({ top: next * container.clientHeight, behavior: 'smooth' });
    }
  };

  // For reels: prefer compiled, fall back to any clip with media
  const reelProjects = projects.filter(p =>
    p.compiled_url || p.clips.some(c => c.generated_media_url || c.thumbnail_url) || p.cover_image_url
  );

  const filtered = projects
    .filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()) || (p.author || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'popular') return b.likeCount - a.likeCount;
      if (sortBy === 'clips') return b.clips.length - a.clips.length;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

  return (
    <div ref={mainRef} className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="comm-header h-12 border-b-2 border-[#ccc] flex items-center px-4 gap-3 shrink-0 bg-white/90 backdrop-blur-sm z-20">
        <Link href="/dashboard" className="text-[#888] hover:text-[#111] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <Users size={18} className="text-[#111]" />
        <span className="font-black text-xl" style={MANGA_TITLE}>COMMUNITY</span>
        <div className="ml-auto text-[#aaa] text-xs">{projects.length} published</div>
      </div>

      {/* Tabs */}
      <div className="comm-tabs flex shrink-0 border-b-2 border-[#ccc] bg-white z-10">
        {(['reels', 'browse'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-bold tracking-widest uppercase transition-colors relative ${tab === t ? 'text-[#111]' : 'text-[#aaa] hover:text-[#666]'}`}
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            {t === 'reels'
              ? <><Film size={13} className="inline mr-1.5 mb-0.5" />Reels</>
              : <><BookOpen size={13} className="inline mr-1.5 mb-0.5" />Browse</>
            }
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#a855f7]" />}
          </button>
        ))}
      </div>

      {/* ── REELS ── */}
      {tab === 'reels' && (
        <div className="flex-1 relative overflow-hidden bg-black">
          {loading ? (
            <div className="h-full flex items-center justify-center text-white/40 text-sm gap-2">
              <Sparkles size={16} className="animate-spin" /> Loading…
            </div>
          ) : reelProjects.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-white/40">
              <Film size={40} />
              <p className="text-sm">No published trailers yet.</p>
              <Link href="/dashboard" className="bg-[#a855f7] text-white text-xs px-4 py-2 mt-2 hover:bg-[#9333ea]">
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <>
              <div
                ref={reelsContainerRef}
                className="h-full overflow-y-auto snap-y snap-mandatory"
                style={{ scrollbarWidth: 'none' }}
                onScroll={e => {
                  const el = e.currentTarget;
                  setActiveReel(Math.round(el.scrollTop / el.clientHeight));
                }}
              >
                {reelProjects.map((p, i) => (
                  <div key={p.id} className="snap-start h-full w-full shrink-0">
                    <ReelCard project={p} active={activeReel === i} onLike={handleLike} />
                  </div>
                ))}
              </div>

              {/* Counter */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-5 text-white/30 text-[0.6rem] uppercase tracking-widest z-30 pointer-events-none">
                {activeReel + 1} / {reelProjects.length}
              </div>

              {activeReel > 0 && (
                <button
                  onClick={() => scrollReel(-1)}
                  className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-black/40 hover:bg-black/70 text-white rounded-full p-1.5"
                >
                  <ChevronUp size={20} />
                </button>
              )}
              {activeReel < reelProjects.length - 1 && (
                <button
                  onClick={() => scrollReel(1)}
                  className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 bg-black/40 hover:bg-black/70 text-white rounded-full p-1.5"
                >
                  <ChevronDown size={20} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── BROWSE ── */}
      {tab === 'browse' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Filter bar */}
          <div className="px-4 py-2.5 border-b border-[#eee] flex items-center gap-3 shrink-0 bg-[#fafafa]">
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#aaa]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search titles, authors…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#ddd] focus:outline-none focus:border-[#111] bg-white"
              />
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <Filter size={12} className="text-[#aaa]" />
              {(['recent', 'popular', 'clips'] as SortBy[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`text-[0.6rem] px-2 py-1 border uppercase tracking-wide transition-colors ${sortBy === s ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-[#888] border-[#ddd] hover:border-[#111]'}`}
                  style={{ fontFamily: 'var(--font-manga)' }}
                >
                  {s === 'recent' ? <><Clock size={9} className="inline mr-0.5" />New</>
                    : s === 'popular' ? <><Heart size={9} className="inline mr-0.5" />Hot</>
                    : <><Film size={9} className="inline mr-0.5" />Clips</>}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-[#aaa] text-sm gap-2">
                <Sparkles size={16} className="animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-[#aaa] gap-2">
                <BookOpen size={32} />
                <p className="text-sm">{search ? 'No results found.' : 'No published trailers yet.'}</p>
              </div>
            ) : (
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                {filtered.map(p => (
                  <div key={p.id} className="browse-card">
                    <BrowseCard project={p} onLike={handleLike} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
