'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Clock, Loader2, Users } from 'lucide-react';
import { useProjectStore, type Project } from '@/stores/project-store';
import { api } from '@/lib/api';
import gsap from 'gsap';

const STATUS_STYLES: Record<Project['status'], string> = {
  uploading: 'text-[#666] bg-[#666]/10',
  uploaded: 'text-[#666] bg-[#666]/10',
  analyzing: 'text-[#111] bg-[#111]/10',
  planning: 'text-[#111] bg-[#111]/10',
  editing: 'text-[#111] bg-[#e0e0e0]/10',
  rendering: 'text-[#111] bg-[#111]/10',
  done: 'text-[#444] bg-[#444]/10',
};

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
      gsap.fromTo('.hero-cta', { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4, delay: 0.2, ease: 'back.out(1.5)' });
    }, mainRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (projects.length > 0) {
      gsap.fromTo('.project-card', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.06, ease: 'power2.out' });

      // Add hover lift animations to project cards
      const cards = document.querySelectorAll('.project-card');
      cards.forEach((card) => {
        const el = card as HTMLElement;
        el.addEventListener('mouseenter', () => {
          gsap.to(el.querySelector('.book-card'), { y: -4, boxShadow: '6px 8px 0px #000', duration: 0.2, ease: 'power2.out' });
        });
        el.addEventListener('mouseleave', () => {
          gsap.to(el.querySelector('.book-card'), { y: 0, boxShadow: '4px 4px 0px #000', duration: 0.2, ease: 'power2.out' });
        });
      });
    }
  }, [projects]);

  return (
    <main ref={mainRef} className="h-screen flex flex-col bg-[#f5f5f5]">
      {/* Top bar — centered logo + subtitle + new project button */}
      <div className="shrink-0 border-b-2 border-[#ddd] relative overflow-hidden">
        <div className="absolute inset-0 manga-speedlines opacity-10 pointer-events-none" />
        <div className="relative z-10 px-6 py-3 flex items-center max-w-6xl mx-auto w-full">
          {/* Left — logo + title + description */}
          <div className="hero-title flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Image src="/logo.png" alt="" width={28} height={28} className="drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]" />
              <h1 className="manga-title text-xl text-[#111]">
                <span className="text-[#111]">Manga</span>Mate
              </h1>
            </Link>
            <div className="h-4 w-px bg-[#333]" />
            <p className="text-[0.7rem] text-[#555]">Upload stories. AI builds cinematic trailers. You edit with a visual copilot.</p>
          </div>

          {/* Right — community + new project */}
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

      {/* Scrollable project grid — fills remaining space */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={24} className="text-[#444] animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-[#444]">
              <p className="text-sm">No projects yet. Create your first book trailer.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/project/${project.id}`}
                  className="project-card group"
                >
                  {/* Book-like card */}
                  <div className="book-card relative aspect-[2/3] bg-white border-2 border-[#111] overflow-hidden"
                    style={{ boxShadow: '4px 4px 0px #000' }}
                  >
                    {/* Spine accent */}
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#111]" />

                    {/* Cover art area */}
                    <div className="absolute inset-0 manga-halftone opacity-5" />

                    {/* Content */}
                    <div className="relative h-full flex flex-col p-3 pl-4">
                      {/* Status badge */}
                      <span className={`manga-badge text-[0.55rem] self-end ${STATUS_STYLES[project.status] || 'text-[#444] bg-[#444]/10'}`}>
                        {project.status}
                      </span>

                      {/* Title — centered vertically */}
                      <div className="flex-1 flex flex-col items-center justify-center px-1">
                        <h3 className="text-center text-sm font-bold text-[#111] group-hover:text-[#111] transition-colors leading-tight"
                          style={{ fontFamily: 'var(--font-manga)', letterSpacing: '0.03em' }}
                        >
                          {project.title}
                        </h3>
                        {project.description && (
                          <p className="text-[0.65rem] text-[#555] text-center line-clamp-3 mt-2 leading-relaxed">
                            {project.description}
                          </p>
                        )}
                      </div>

                      {/* Bottom — date */}
                      <div className="flex items-center justify-center gap-1 text-[0.6rem] text-[#bbb]">
                        <Clock size={9} />
                        {new Date(project.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
