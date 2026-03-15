'use client';

import { useEffect, useRef, useState } from 'react';
import { TransitionLink as Link } from '@/components/PageTransition';
import Image from 'next/image';
import { Plus, Clock, Loader2, Users, X, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useProjectStore, type Project } from '@/stores/project-store';
import { api } from '@/lib/api';
import { hasLocalAuth } from '@/lib/local-auth';
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
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // project id
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!hasLocalAuth()) {
      router.replace('/auth');
      return;
    }
    setAuthReady(true);
  }, [router]);

  useEffect(() => {
    if (!authReady) return;
    setLoading(true);
    api.getProjects()
      .then((data: Project[] | { projects?: Project[] }) => setProjects(Array.isArray(data) ? data : data.projects || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [authReady, setProjects, setLoading]);

  useEffect(() => {
    if (!authReady) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.hero-title', { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
      gsap.fromTo('.hero-cta', { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4, delay: 0.2, ease: 'power2.out' });

      // Decorative elements fade in
      gsap.fromTo('.decor-item',
        { opacity: 0, scale: 0.7 },
        { opacity: 0.5, scale: 1, duration: 1, stagger: 0.12, delay: 0.3, ease: 'power2.out' }
      );
      // Sun fades in then bobs up and down slowly
      gsap.fromTo('.decor-sun',
        { opacity: 0, scale: 0.5 },
        { opacity: 0.6, scale: 1, duration: 1.2, delay: 0.5, ease: 'power2.out' }
      );
      gsap.to('.decor-sun', {
        y: -22,
        duration: 1.4,
        delay: 1.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
      gsap.to('.decor-sun', {
        rotation: 360,
        duration: 30,
        delay: 1.5,
        repeat: -1,
        ease: 'none',
      });
      // Oni bob
      gsap.to('.decor-oni', { y: 18, duration: 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 0.5 });
      // Gentle sway — relative rotation so it rocks around its current CSS transform
      document.querySelectorAll('.decor-item').forEach((el, i) => {
        const dur = 2.8 + i * 0.6;
        gsap.to(el, {
          rotation: '+=7',
          y: '+=6',
          duration: dur,
          delay: 1.2 + i * 0.35,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });
    }, mainRef);
    return () => ctx.revert();
  }, [authReady]);

  useEffect(() => {
    if (!authReady) return;
    if (!loading && projects.length > 0) {
      gsap.fromTo('.project-card', { opacity: 0, y: 24 }, { opacity: 0.9, y: 0, duration: 0.35, stagger: 0.07, delay: 0.55, ease: 'power2.out' });
      gsap.fromTo('.shelf-line', { opacity: 0, scaleX: 0, transformOrigin: 'left' }, { opacity: 1, scaleX: 1, duration: 0.5, stagger: 0.15, delay: 0.65, ease: 'power2.out' });

      const controller = new AbortController();
      const { signal } = controller;

      const cards = document.querySelectorAll('.project-card');
      cards.forEach((card) => {
        const el = card as HTMLElement;
        const tiltEl = el.querySelector('.book-tilt') as HTMLElement;
        const bookEl = el.querySelector('.book-card') as HTMLElement;
        if (!tiltEl || !bookEl) return;
        el.addEventListener('mouseenter', () => {
          gsap.to(el, { opacity: 1, duration: 0.2 });
          gsap.to(tiltEl, { y: -8, rotation: -2, duration: 0.25, ease: 'power2.out' });
          gsap.to(bookEl, { boxShadow: '6px 12px 0px rgba(0,0,0,0.3)', duration: 0.25 });
        }, { signal });
        el.addEventListener('mouseleave', () => {
          gsap.to(el, { opacity: 0.9, duration: 0.25 });
          gsap.to(tiltEl, { y: 0, rotation: 0, duration: 0.25, ease: 'power2.out' });
          gsap.to(bookEl, { boxShadow: '3px 3px 0px #000', duration: 0.25 });
        }, { signal });
        const linkEl = el.querySelector('a.book-link') as HTMLAnchorElement | null;
        linkEl?.addEventListener('click', (e) => {
          e.preventDefault();
          const href = linkEl.getAttribute('href');
          gsap.killTweensOf(tiltEl);
          gsap.to(tiltEl, {
            x: 180, y: -40, rotation: 25, opacity: 0, duration: 0.45, ease: 'power2.in',
            onComplete: () => { if (href) window.location.href = href; },
          });
        }, { signal });
      });

      return () => controller.abort();
    }
  }, [authReady, projects, loading]);

  async function handleDeleteConfirmed() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteProject(confirmDelete);
      setProjects(projects.filter((p) => p.id !== confirmDelete));
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  const sorted = [...projects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const shelfRows = chunkArray(sorted, 5);

  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <Loader2 size={28} className="text-[#444] animate-spin" />
      </main>
    );
  }

  return (
    <main ref={mainRef} className="h-screen flex flex-col">
      {/* Decorative elements — fixed to viewport, outside scroll+overflow containers so stacking context doesn't trap them. z-[5] puts them above bg but below navbar (z-[20]). */}
      <Image src="/stylized_imgs/flower3.png" alt="" width={140} height={260} className="decor-item fixed -top-8 -right-4 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.2))', transform: 'rotate(-25deg) scaleX(-1)' }} />
      <Image src="/stylized_imgs/leaf7.png" alt="" width={150} height={134} className="decor-item fixed top-8 -left-10 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.15))', transform: 'rotate(-10deg)' }} />
      <Image src="/stylized_imgs/flowers.png" alt="" width={160} height={160} className="decor-item fixed -bottom-6 -left-6 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.15))', transform: 'rotate(-15deg)' }} />
      <Image src="/stylized_imgs/stone1.png" alt="" width={180} height={250} className="decor-item fixed -bottom-16 -right-10 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.2))', transform: 'rotate(8deg)' }} />
      <Image src="/stylized_imgs/sun.png" alt="" width={200} height={190} className="decor-sun fixed top-28 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(0 0 25px rgba(255,200,50,0.5)) drop-shadow(0 0 50px rgba(255,180,30,0.2))' }} />
      <img src="/stylized_imgs/oni.png" alt="" className="decor-oni fixed bottom-0 left-[53%] -translate-x-1/2 w-[1100px] pointer-events-none select-none z-[3]" style={{ opacity: 0.22 }} />

      {/* Top bar */}
      <div className="shrink-0 border-b-2 border-[#ddd] relative overflow-hidden bg-white/90 backdrop-blur-sm z-[20]">
        <div className="absolute inset-0 manga-speedlines opacity-10 pointer-events-none" />
        <div className="relative z-10 px-6 py-3 flex items-center max-w-6xl mx-auto w-full">
          <div className="hero-title flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Image src="/logo.png" alt="" width={40} height={40} className="drop-shadow-[0_0_8px_rgba(0,0,0,0.15)]" />
              <h1
                className="manga-title text-2xl"
                style={{ color: '#fff', WebkitTextStroke: '2px #111', paintOrder: 'stroke fill', textShadow: '3px 3px 0px #000' }}
              >MangaMate</h1>
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative" style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="max-w-6xl mx-auto px-6 pt-8 pb-12 relative z-[1]">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={24} className="text-[#444] animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <Link href="/project/new" className="group flex items-center justify-center h-[70vh]">
              <div className="flex flex-col items-center gap-3 px-12 py-8 border-2 border-[#111] bg-white/70 backdrop-blur-sm group-hover:bg-white/90 transition-all" style={{ boxShadow: '4px 4px 0px #111' }}>
                <p className="manga-title text-2xl" style={{ WebkitTextStroke: '2px #111', color: '#fff', paintOrder: 'stroke fill', textShadow: '3px 3px 0px #000' }}>NO STORIES YET</p>
                <p className="text-xs text-[#555] border-t border-[#ccc] pt-3">Upload your first manga to generate a cinematic trailer.</p>
                <span className="manga-btn bg-[#111] text-white px-4 py-1.5 text-xs flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus size={12} /> New Project
                </span>
              </div>
            </Link>
          ) : (
            <div className="space-y-0">
              {shelfRows.map((row, rowIdx) => (
                <div key={rowIdx}>
                  {/* Books on shelf */}
                  <div className="flex gap-5 px-4 pb-3 pt-6">
                    {row.map((project) => (
                      <div
                        key={project.id}
                        className="project-card group flex-shrink-0 relative"
                        style={{ width: 'calc((100% - 80px) / 5)', opacity: 0 }}
                      >
                        <div className="book-tilt relative" style={{ transformOrigin: 'bottom center' }}>
                        <Link
                          href={`/project/${project.id}`}
                          className="block book-link"
                        >
                        <div
                          className="book-card relative aspect-[2/3] overflow-hidden border-2 border-[#111]"
                          style={{ boxShadow: '3px 3px 0px #000' }}
                        >
                          {/* Cover image — check localStorage for data URL thumbnails */}
                          {(() => {
                            const localThumb = typeof window !== 'undefined'
                              ? localStorage.getItem(`cover_image_${project.id}`)
                              : null;
                            const src = localThumb || project.cover_image_url;
                            const focusRaw = typeof window !== 'undefined' ? localStorage.getItem(`cover_focus_${project.id}`) : null;
                            const focus = focusRaw ? JSON.parse(focusRaw) as { x: number; y: number } : { x: 50, y: 50 };
                            return src ? (
                              <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} />
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
                            {/* Top row: status badge */}
                            <div className="flex items-start">
                              <span className="manga-badge text-[0.5rem] text-white bg-black/50 border-black/30" style={{ textShadow: '0 1px 2px #000' }}>
                                {project.status}
                              </span>
                            </div>

                            <div className="flex-1" />

                            {/* Title at bottom */}
                            <h3
                              className="text-sm font-bold leading-tight"
                              style={{ fontFamily: 'var(--font-manga)', letterSpacing: '0.03em', color: '#fff', WebkitTextStroke: '0.6px #000', paintOrder: 'stroke fill', textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}
                            >
                              {project.title}
                            </h3>
                            {project.description && (
                              <p className="text-[0.6rem] line-clamp-2 mt-0.5 leading-snug" style={{ color: '#fff', textShadow: '0 1px 3px #000, 0 0 6px #000' }}>
                                {project.description}
                              </p>
                            )}
                            <div className="flex items-center gap-1 text-[0.55rem] mt-1" style={{ color: '#fff', textShadow: '0 1px 2px #000' }}>
                              <Clock size={8} />
                              {new Date(project.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        </Link>
                        {/* Delete button inside tilt wrapper so it moves with the book */}
                        <button
                          className="manga-badge text-[0.5rem] bg-red-600/80 text-white border-red-800 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 px-1.5 py-0.5 absolute top-2 right-2 z-10"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(project.id); }}
                        >
                          ✕ DEL
                        </button>
                        </div>{/* end book-tilt */}
                      </div>
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

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white border-2 border-[#111] p-6 w-80 shadow-[4px_4px_0px_#000]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Trash2 size={16} className="text-red-500" />
              <h3 className="font-bold text-sm text-[#111]">Delete project?</h3>
            </div>
            <p className="text-xs text-[#666] mb-5 leading-relaxed">
              This will permanently delete the project and all its data. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 text-xs border border-[#ccc] text-[#666] hover:bg-[#f5f5f5] transition-colors"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-xs bg-red-500 text-white border border-red-600 hover:bg-red-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                onClick={handleDeleteConfirmed}
                disabled={deleting}
              >
                {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
