'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { TransitionLink as Link } from '@/components/PageTransition';
import Image from 'next/image';
import { api } from '@/lib/api';
import gsap from 'gsap';

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const createBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Chapter marker drop-in
      gsap.fromTo(
        '.chapter-marker',
        { y: -40, opacity: 0, skewX: -8 },
        { y: 0, opacity: 1, skewX: 0, duration: 0.5, ease: 'back.out(2)' }
      );
      // Title slam
      gsap.fromTo(
        '.new-project-title',
        { scale: 1.4, opacity: 0, letterSpacing: '0.3em' },
        { scale: 1, opacity: 1, letterSpacing: '0.05em', duration: 0.65, delay: 0.25, ease: 'expo.out' }
      );
      // Subtitle fade
      gsap.fromTo(
        '.new-project-subtitle',
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, delay: 0.55, ease: 'power2.out' }
      );
      // Divider expand
      gsap.fromTo(
        '.divider-line',
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 0.5, delay: 0.6, ease: 'power3.out', transformOrigin: 'left center' }
      );
      // Form fields slide up
      gsap.fromTo(
        '.form-field',
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, stagger: 0.1, delay: 0.65, ease: 'power3.out' }
      );
      // Button pop
      gsap.fromTo(
        '.create-btn',
        { y: 20, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 0.4, delay: 0.9, ease: 'back.out(2)' }
      );
    }, mainRef);

    // Decorative elements
    gsap.fromTo('.decor-item',
      { opacity: 0, scale: 0.6, rotation: 'random(-20, 20)' },
      { opacity: 0.55, scale: 1, duration: 1.1, stagger: 0.15, delay: 0.2, ease: 'power2.out' }
    );
    gsap.fromTo('.decor-oni',
      { opacity: 0, y: 40 },
      { opacity: 0.1, y: 0, duration: 1.5, delay: 0.4, ease: 'power2.out' }
    );
    // Float animations
    document.querySelectorAll('.decor-item').forEach((el, i) => {
      gsap.to(el, { y: '+=8', rotation: '+=5', duration: 3 + i * 0.7, delay: 1.5 + i * 0.3, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });

    return () => ctx.revert();
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;

    if (createBtnRef.current) {
      gsap.fromTo(
        createBtnRef.current,
        { scale: 1 },
        { scale: 1.06, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.inOut' }
      );
    }

    setLoading(true);
    try {
      const project: any = await api.createProject({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/project/${project.id}/upload`);
    } catch (err) {
      console.error(err);
      alert('Failed to create project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      ref={mainRef}
      className="min-h-screen relative flex items-center justify-center"
      style={{ backgroundImage: 'url(/hero-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center top' }}
    >
      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-black/30 z-[1]" />

      {/* Decorative elements — different set from other pages */}
      <Image src="/stylized_imgs/flowers.png" alt="" width={200} height={180} className="decor-item fixed -top-4 -left-6 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 4px 8px rgba(0,0,0,0.3))', transform: 'rotate(-18deg)' }} />
      <Image src="/stylized_imgs/leaf3.png" alt="" width={130} height={160} className="decor-item fixed top-8 -right-4 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 3px 5px rgba(0,0,0,0.25))', transform: 'rotate(22deg)' }} />
      <Image src="/stylized_imgs/stone1.png" alt="" width={150} height={130} className="decor-item fixed -bottom-6 -left-4 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.3))', transform: 'rotate(8deg)' }} />
      <Image src="/stylized_imgs/leaf2.png" alt="" width={110} height={180} className="decor-item fixed -bottom-8 -right-2 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 3px 5px rgba(0,0,0,0.25))', transform: 'rotate(-12deg)' }} />
      <Image src="/stylized_imgs/flower3.png" alt="" width={120} height={120} className="decor-item fixed bottom-32 left-8 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 2px 4px rgba(0,0,0,0.2))', transform: 'rotate(30deg)' }} />

      {/* Ghost oni */}
      <img src="/stylized_imgs/oni.png" alt="" className="decor-oni fixed bottom-0 right-[10%] w-[600px] pointer-events-none select-none z-[3] opacity-0" />

      {/* Back link */}
      <Link href="/dashboard" className="fixed top-6 left-6 z-20 text-white/80 hover:text-white flex items-center gap-2 text-sm transition-colors bg-black/30 backdrop-blur-sm px-3 py-2 border border-white/20">
        <ArrowLeft size={14} /> Dashboard
      </Link>

      {/* Card */}
      <div className="relative z-10 w-full max-w-lg mx-6">
        {/* Chapter marker */}
        <div className="chapter-marker inline-flex items-center gap-2 bg-[#111] text-white px-4 py-1.5 mb-0 text-xs tracking-widest uppercase font-mono">
          <BookOpen size={12} />
          Chapter 01 — Begin
        </div>

        <div className="bg-white/92 backdrop-blur-md border-4 border-[#111] shadow-[8px_8px_0px_rgba(0,0,0,0.85)]">
          {/* Header with speedlines */}
          <div className="manga-speedlines p-8 pb-6 border-b-4 border-[#111]">
            <h1 className="new-project-title manga-title text-5xl text-[#111] leading-none">
              New Project
            </h1>
            <p className="new-project-subtitle text-[#555] mt-3 text-sm leading-relaxed">
              Name your story. We'll handle the rest — analysis, scenes, and cinematic cuts.
            </p>
          </div>

          {/* Form */}
          <div className="p-8 space-y-6">
            <div className="divider-line w-full h-0.5 bg-[#111] mb-2" style={{ transformOrigin: 'left center' }} />

            <div className="form-field">
              <label className="manga-accent-bar text-xs mb-3 block tracking-widest uppercase">Project Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="My Book Trailer"
                className="manga-input w-full text-base"
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="manga-accent-bar text-xs mb-3 block tracking-widest uppercase">Description <span className="font-sans normal-case text-[#aaa] ml-1">(optional)</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief synopsis of your story…"
                rows={3}
                className="manga-input w-full resize-none text-sm"
              />
            </div>

            <div className="form-field pt-2">
              <button
                ref={createBtnRef}
                onClick={handleCreate}
                disabled={!title.trim() || loading}
                className="create-btn manga-btn w-full bg-[#111] text-white py-4 px-6 text-xl"
              >
                {loading ? 'Creating…' : 'Create Project →'}
              </button>
              <p className="text-center text-[#999] text-xs mt-3 font-mono">
                Next: upload your story content
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
