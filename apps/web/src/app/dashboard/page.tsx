'use client';

import { useEffect, useRef } from 'react';
import { TransitionLink as Link } from '@/components/PageTransition';
import Image from 'next/image';
import { Plus, Clock, Loader2, Users } from 'lucide-react';
import { useProjectStore, type Project } from '@/stores/project-store';
import { api } from '@/lib/api';
import gsap from 'gsap';

const STATUS_STYLES: Record<Project['status'], string> = {
  uploading: 'text-[#999] bg-[#999]/10',
  uploaded: 'text-[#666] bg-[#666]/10',
  analyzing: 'text-[#111] bg-[#111]/10',
  planning: 'text-[#111] bg-[#111]/10',
  editing: 'text-[#111] bg-[#111]/10',
  rendering: 'text-[#111] bg-[#111]/10',
  done: 'text-[#444] bg-[#444]/10',
};

// Generate a deterministic cover gradient from project title
function coverGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 15%, 85%) 0%, hsl(${(hue + 30) % 360}, 10%, 75%) 100%)`;
}

// Chunk projects into rows of N for shelf layout
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default function Dashboard() {
  const { projects, loading, setProjects, setLoading } = useProjectStore();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setLoading(true);
    api.getProjects()
      .then((data: any) => setProjects(Array.isArray(data) ? data : data.projects || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [setProjects, setLoading]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.hero-title', { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
      gsap.fromTo('.hero-cta', { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4, delay: 0.2, ease: 'power2.out' });
    }, mainRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (projects.length > 0) {
      // Delay matches page-transition reveal (~1s) so books animate in after overlay sweeps away
      gsap.fromTo('.project-card', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.07, delay: 0.55, ease: 'power2.out' });
      gsap.fromTo('.shelf-line', { opacity: 0, scaleX: 0, transformOrigin: 'left' }, { opacity: 1, scaleX: 1, duration: 0.5, stagger: 0.15, delay: 0.65, ease: 'power2.out' });

      const cards = document.querySelectorAll('.project-card');
      cards.forEach((card) => {
        const el = card as HTMLElement;
        const bookEl = el.querySelector('.book-card') as HTMLElement;
        if (!bookEl) return;
        el.addEventListener('mouseenter', () => {
          gsap.to(bookEl, { y: -8, rotation: -2, boxShadow: '6px 12px 0px rgba(0,0,0,0.3)', duration: 0.25, ease: 'power2.out' });
        });
        el.addEventListener('mouseleave', () => {
          gsap.to(bookEl, { y: 0, rotation: 0, boxShadow: '3px 3px 0px #000', duration: 0.25, ease: 'power2.out' });
        });
      });
    }
  }, [projects]);

  const shelfRows = chunkArray(projects, 5);

  return (
    <main ref={mainRef} className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 border-b-2 border-[#ddd] relative overflow-hidden bg-white/90 backdrop-blur-sm">
        <div className="absolute inset-0 manga-speedlines opacity-10 pointer-events-none" />
        <div className="relative z-10 px-6 py-3 flex items-center max-w-6xl mx-auto w-full">
          <div className="hero-title flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Image src="/logo.png" alt="" width={28} height={28} className="drop-shadow-[0_0_8px_rgba(0,0,0,0.15)]" />
              <h1 className="manga-title text-xl text-[#111]">MangaMate</h1>
            </Link>
            <div className="h-4 w-px bg-[#ccc]" />
            <p className="text-[0.7rem] text-[#888]">Upload stories. AI builds cinematic trailers. You edit with a visual copilot.</p>
          </div>
          <div className="hero-cta ml-auto flex items-center gap-3">
            <Link href="/community" className="text-[#888] hover:text-[#111] text-sm flex items-center gap-1.5 transition-colors">
              <Users size={14} /> Community
            </Link>
            <Link href="/project/new" className="manga-btn bg-[#111] text-white px-4 py-2 text-sm flex items-center gap-2">
              <Plus size={14} /> New Project
            </Link>
          </div>
        </div>
      </div>

      {/* Scrollable shelf area */}
      <div className="flex-1 overflow-y-auto" style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-6xl mx-auto px-6 pt-8 pb-12">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={24} className="text-[#444] animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-[#999]">
              <p className="text-sm">No projects yet. Create your first book trailer.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {shelfRows.map((row, rowIdx) => (
                <div key={rowIdx}>
                  {/* Books on shelf */}
                  <div className="flex gap-5 px-4 pb-3 pt-6">
                    {row.map((project) => (
                      <Link
                        key={project.id}
                        href={`/project/${project.id}`}
                        className="project-card group flex-shrink-0"
                        style={{ width: 'calc((100% - 80px) / 5)', opacity: 0 }}
                      >
                        <div
                          className="book-card relative aspect-[2/3] overflow-hidden border-2 border-[#111]"
                          style={{ boxShadow: '3px 3px 0px #000', transformOrigin: 'bottom center' }}
                        >
                          {/* Cover image — check localStorage for data URL thumbnails */}
                          {(() => {
                            const localThumb = typeof window !== 'undefined'
                              ? localStorage.getItem(`cover_image_${project.id}`)
                              : null;
                            const src = localThumb || project.cover_image_url;
                            return src ? (
                              <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
                            ) : (
                              <div className="absolute inset-0" style={{ background: coverGradient(project.title) }} />
                            );
                          })()}

                          {/* Halftone texture overlay */}
                          <div className="absolute inset-0 manga-halftone opacity-[0.08]" />

                          {/* Spine */}
                          <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#111]/30" />

                          {/* Content overlay */}
                          <div className="absolute inset-0 flex flex-col p-3 pl-4 bg-gradient-to-t from-black/60 via-transparent to-transparent">
                            {/* Status */}
                            <span className={`manga-badge text-[0.5rem] self-end ${STATUS_STYLES[project.status] || 'text-[#444] bg-[#444]/10'}`}>
                              {project.status}
                            </span>

                            <div className="flex-1" />

                            {/* Title at bottom */}
                            <h3
                              className="text-sm font-bold text-white leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                              style={{ fontFamily: 'var(--font-manga)', letterSpacing: '0.03em' }}
                            >
                              {project.title}
                            </h3>
                            {project.description && (
                              <p className="text-[0.6rem] text-white/70 line-clamp-2 mt-0.5 leading-snug">
                                {project.description}
                              </p>
                            )}
                            <div className="flex items-center gap-1 text-[0.55rem] text-white/50 mt-1">
                              <Clock size={8} />
                              {new Date(project.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>

                  {/* Shelf surface */}
                  <div className="shelf-line relative mx-2" style={{ opacity: 0 }}>
                    {/* Shelf plank */}
                    <div className="h-[6px] bg-gradient-to-b from-[#8B7355] to-[#6B5740] rounded-sm" />
                    {/* Shelf shadow */}
                    <div className="h-[8px] bg-gradient-to-b from-[#6B5740]/40 to-transparent" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
