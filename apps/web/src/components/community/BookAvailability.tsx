'use client';

import { useState, useEffect } from 'react';
import {
  Library, Globe, BookOpen, ExternalLink, Loader2, X,
  BookMarked, MapPin, Navigation, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { BookAvailability } from '@/app/api/books/availability/route';
import type { NearbyLibrary } from '@/app/api/books/nearby-libraries/route';

interface Props {
  title: string;
  author?: string;
  variant?: 'reel' | 'browse';
  onClose?: () => void;
}

type FetchStatus = 'idle' | 'loading' | 'done' | 'error';
type GeoStatus = 'idle' | 'requesting' | 'loading' | 'done' | 'denied' | 'error';

export default function BookAvailability({ title, author, variant = 'reel', onClose }: Props) {
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [data, setData] = useState<BookAvailability | null>(null);

  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [libraries, setLibraries] = useState<NearbyLibrary[]>([]);
  const [showLibraries, setShowLibraries] = useState(false);

  // Fetch online availability on mount
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const params = new URLSearchParams({ title });
    if (author) params.set('author', author);
    fetch(`/api/books/availability?${params}`)
      .then(res => { if (!res.ok) throw new Error('failed'); return res.json(); })
      .then(json => { if (!cancelled) { setData(json); setStatus('done'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [title, author]);

  // Find libraries near the user
  const findNearby = () => {
    if (!navigator.geolocation) { setGeoStatus('error'); return; }
    setGeoStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGeoStatus('loading');
        fetch(`/api/books/nearby-libraries?lat=${coords.latitude}&lon=${coords.longitude}`)
          .then(res => { if (!res.ok) throw new Error('failed'); return res.json(); })
          .then((libs: NearbyLibrary[]) => {
            setLibraries(libs);
            setGeoStatus('done');
            setShowLibraries(true);
          })
          .catch(() => setGeoStatus('error'));
      },
      (err) => {
        setGeoStatus(err.code === 1 ? 'denied' : 'error');
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  };

  const isDark = variant === 'reel';
  const bg = isDark ? 'bg-black/90 border-[#333]' : 'bg-white border-[#ddd]';
  const titleColor = isDark ? 'text-white' : 'text-[#111]';
  const mutedColor = isDark ? 'text-white/50' : 'text-[#888]';
  const divider = isDark ? 'border-[#333]' : 'border-[#eee]';
  const cardBg = isDark ? 'bg-white/5 border-[#2a2a2a]' : 'bg-[#f9f9f9] border-[#e5e5e5]';

  // Build WorldCat URL — prefer ISBN for precise "libraries that own this book" view
  const worldcatUrl = data?.openLibrary?.isbn
    ? `https://www.worldcat.org/isbn/${data.openLibrary.isbn}`
    : data?.worldcatUrl ?? `https://www.worldcat.org/search?q=${encodeURIComponent(title)}`;

  return (
    <div className={`${bg} border-2 p-4 w-full relative`} style={{ fontFamily: 'var(--font-manga, monospace)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Library size={14} className="text-[#a855f7]" />
          <span className={`text-xs font-black uppercase tracking-widest ${titleColor}`}>
            Borrow This Book
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className={`${mutedColor} hover:text-[#a855f7] transition-colors`}>
            <X size={14} />
          </button>
        )}
      </div>
      <p className={`text-[0.6rem] ${mutedColor} mb-3 truncate`}>
        {title}{author ? ` · ${author}` : ''}
      </p>

      {/* ── Online sources ── */}
      <div className={`border-t ${divider} pt-3 space-y-1.5`}>
        {status === 'loading' && (
          <div className={`flex items-center gap-2 ${mutedColor} text-[0.65rem] py-1`}>
            <Loader2 size={11} className="animate-spin" /> Searching databases…
          </div>
        )}
        {status === 'error' && (
          <p className="text-[0.65rem] text-red-400 py-1">Could not reach library APIs.</p>
        )}

        {status === 'done' && data && (
          <>
            {data.openLibrary && (
              <BorrowLink
                href={data.openLibrary.url} isDark={isDark}
                icon={<BookOpen size={12} className="text-[#a855f7]" />}
                label={data.openLibrary.canBorrow ? 'Borrow Free Online' : 'Open Library'}
                badge={data.openLibrary.canBorrow ? 'FREE' : undefined}
                badgeColor="bg-[#a855f7]"
              />
            )}
            {data.gutenberg && (
              <BorrowLink
                href={data.gutenberg.readUrl} isDark={isDark}
                icon={<Globe size={12} className="text-emerald-500" />}
                label="Read Free — Public Domain"
                badge="FREE" badgeColor="bg-emerald-600"
              />
            )}
            {data.googleBooks && (
              <BorrowLink
                href={data.googleBooks.previewUrl ?? data.googleBooks.infoUrl} isDark={isDark}
                icon={<BookMarked size={12} className="text-orange-400" />}
                label={data.googleBooks.previewAvailable ? 'Preview on Google Books' : 'Google Books'}
              />
            )}
          </>
        )}
      </div>

      {/* ── Local library section ── */}
      <div className={`border-t ${divider} mt-3 pt-3`}>
        <div className="flex items-center gap-2 mb-2">
          <MapPin size={12} className="text-sky-400" />
          <span className={`text-[0.65rem] font-black uppercase tracking-wider ${titleColor}`}>
            Local Libraries
          </span>
        </div>

        {/* WorldCat "which libraries have this book" — always shown */}
        <BorrowLink
          href={worldcatUrl} isDark={isDark}
          icon={<Library size={12} className="text-sky-400" />}
          label="Check Library Availability"
          badge="WORLDCAT" badgeColor="bg-sky-700"
        />

        {/* Geolocation button */}
        {geoStatus === 'idle' && (
          <button
            onClick={findNearby}
            className={`mt-1.5 flex items-center gap-2 px-2.5 py-2 border w-full text-left transition-all group
              ${isDark
                ? 'border-[#333] hover:border-sky-400 text-white/70 hover:text-sky-300'
                : 'border-[#ddd] hover:border-sky-500 text-[#555] hover:text-sky-600'}`}
          >
            <Navigation size={12} className="text-sky-400 group-hover:animate-pulse" />
            <span className="text-[0.65rem] font-bold flex-1">Find Libraries Near Me</span>
          </button>
        )}

        {(geoStatus === 'requesting' || geoStatus === 'loading') && (
          <div className={`mt-1.5 flex items-center gap-2 ${mutedColor} text-[0.65rem] px-2.5 py-2`}>
            <Loader2 size={11} className="animate-spin text-sky-400" />
            {geoStatus === 'requesting' ? 'Waiting for location…' : 'Finding libraries nearby…'}
          </div>
        )}

        {geoStatus === 'denied' && (
          <p className="mt-1.5 text-[0.6rem] text-amber-400 px-1">
            Location access denied. Enable it in browser settings to find libraries near you.
          </p>
        )}
        {geoStatus === 'error' && (
          <p className="mt-1.5 text-[0.6rem] text-red-400 px-1">
            Could not detect location. Try again or search WorldCat above.
          </p>
        )}

        {/* Nearby library results */}
        {geoStatus === 'done' && libraries.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowLibraries(v => !v)}
              className={`flex items-center gap-1 text-[0.6rem] ${mutedColor} hover:text-sky-400 transition-colors mb-1.5`}
            >
              {showLibraries ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {libraries.length} librar{libraries.length === 1 ? 'y' : 'ies'} found nearby
            </button>

            {showLibraries && (
              <div className="space-y-1">
                {libraries.map(lib => (
                  <div key={lib.id} className={`border ${cardBg} px-2.5 py-2`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-[0.65rem] font-bold truncate ${titleColor}`}>{lib.name}</p>
                        <p className={`text-[0.55rem] ${mutedColor} truncate`}>{lib.address}</p>
                        <p className="text-[0.55rem] text-sky-400">{lib.distanceKm} km away</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <a
                          href={lib.directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-[0.55rem] text-sky-400 hover:text-sky-300 transition-colors"
                        >
                          <Navigation size={9} /> Directions
                        </a>
                        {lib.website && (
                          <a
                            href={lib.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-0.5 text-[0.55rem] ${mutedColor} hover:text-[#a855f7] transition-colors`}
                          >
                            <ExternalLink size={9} /> Website
                          </a>
                        )}
                      </div>
                    </div>
                    {/* WorldCat link for this specific book + this library's city */}
                    <a
                      href={`${worldcatUrl}${lib.address.includes(',') ? '' : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`mt-1.5 flex items-center gap-1 text-[0.55rem] ${mutedColor} hover:text-sky-400 transition-colors`}
                    >
                      <Library size={8} /> Check if they have this book →
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {geoStatus === 'done' && libraries.length === 0 && (
          <p className={`mt-1.5 text-[0.6rem] ${mutedColor} px-1`}>
            No libraries found within 8 km. Try WorldCat above.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── BorrowLink ───────────────────────────────────────────────────────────────

function BorrowLink({
  href, icon, label, badge, badgeColor, isDark,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeColor?: string;
  isDark: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 px-2.5 py-1.5 border transition-all group w-full text-left
        ${isDark
          ? 'border-[#333] hover:border-[#a855f7] text-white/80 hover:text-white'
          : 'border-[#ddd] hover:border-[#a855f7] text-[#333] hover:text-[#111]'}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-[0.65rem] font-bold flex-1">{label}</span>
      {badge && (
        <span className={`text-[0.5rem] px-1.5 py-0.5 ${badgeColor} text-white font-black tracking-wider`}>
          {badge}
        </span>
      )}
      <ExternalLink size={9} className="shrink-0 opacity-30 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}
