'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
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

    // Decorative elements — fade in to final opacity
    gsap.fromTo('.decor-item',
      { opacity: 0, scale: 0.85 },
      { opacity: 0.5, scale: 1, duration: 1, stagger: 0.12, delay: 0.3, ease: 'power2.out' }
    );
    gsap.fromTo('.decor-oni',
      { opacity: 0, y: 30 },
      { opacity: 0.22, y: 0, duration: 1.5, delay: 0.5, ease: 'power2.out' }
    );
    // Gentle flowing float — y only, very subtle rotation
    const floatParams = [
      { y: 10, rot: 2, dur: 3.2 },
      { y: 8,  rot: -2, dur: 3.8 },
      { y: 12, rot: 1.5, dur: 2.9 },
      { y: 9,  rot: -1.5, dur: 3.5 },
    ];
    document.querySelectorAll('.decor-item').forEach((el, i) => {
      const p = floatParams[i % floatParams.length];
      gsap.to(el, { y: `+=${p.y}`, rotation: `+=${p.rot}`, duration: p.dur, delay: 1.2 + i * 0.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
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
      style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* One decorative element per corner, upright */}
      {/* top-left */}
      <Image src="/stylized_imgs/leaf5.png" alt="" width={220} height={195} className="decor-item fixed -top-6 -left-10 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 2px 4px rgba(0,0,0,0.15))', transform: 'rotate(-95deg)' }} />
      {/* top-right */}
      <Image src="/stylized_imgs/leaf6.png" alt="" width={200} height={170} className="decor-item fixed -top-6 -right-10 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 2px 4px rgba(0,0,0,0.15))', transform: 'rotate(-75deg)' }} />
      {/* bottom-left */}
      <Image src="/stylized_imgs/stone3.png" alt="" width={220} height={195} className="decor-item fixed -bottom-8 -left-8 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 3px 5px rgba(0,0,0,0.2))' }} />
      {/* bottom-right */}
      <Image src="/stylized_imgs/pine.png" alt="" width={155} height={265} className="decor-item fixed -bottom-10 -right-6 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 3px 5px rgba(0,0,0,0.2))' }} />

      {/* Ghost oni */}
      <img src="/stylized_imgs/oni.png" alt="" className="decor-oni fixed bottom-0 left-[53%] -translate-x-1/2 w-[900px] pointer-events-none select-none z-[3] opacity-0" />

      {/* Back link */}
      <Link href="/dashboard" className="fixed top-6 left-6 z-20 text-[#555] hover:text-[#111] flex items-center gap-2 text-sm transition-colors bg-white/70 backdrop-blur-sm px-3 py-2 border border-[#ddd]">
        <ArrowLeft size={14} /> Dashboard
      </Link>

      {/* Card */}
      <div className="relative z-10 w-full max-w-lg mx-6">
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
