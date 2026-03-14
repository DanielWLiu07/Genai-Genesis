'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
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

  // Page entrance animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.new-project-header',
        { y: -80, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, ease: 'bounce.out' }
      );
      gsap.fromTo(
        '.new-project-title',
        { scale: 2, rotateZ: -5, opacity: 0 },
        { scale: 1, rotateZ: 0, opacity: 1, duration: 0.6, delay: 0.2, ease: 'back.out(1.4)' }
      );
      gsap.fromTo(
        '.new-project-subtitle',
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, delay: 0.5, ease: 'power2.out' }
      );
      gsap.fromTo(
        '.form-field',
        { x: -60, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, stagger: 0.1, delay: 0.4, ease: 'power3.out' }
      );
      gsap.fromTo(
        '.create-btn',
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, delay: 0.7, ease: 'back.out(1.7)' }
      );
    }, mainRef);

    // Decorative elements
    gsap.fromTo('.decor-item',
      { opacity: 0, scale: 0.7 },
      { opacity: 0.5, scale: 1, duration: 1, stagger: 0.12, delay: 0.3, ease: 'power2.out' }
    );
    gsap.fromTo('.decor-sun',
      { opacity: 0, scale: 0.5 },
      { opacity: 0.45, scale: 1, duration: 1.2, delay: 0.5, ease: 'power2.out' }
    );
    gsap.to('.decor-sun', { y: -20, duration: 1.4, delay: 1.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to('.decor-sun', { rotation: 360, duration: 30, delay: 1.5, repeat: -1, ease: 'none' });
    document.querySelectorAll('.decor-item').forEach((el, i) => {
      gsap.to(el, { rotation: '+=6', y: '+=5', duration: 2.8 + i * 0.6, delay: 1.2 + i * 0.35, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });

    return () => ctx.revert();
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;

    if (createBtnRef.current) {
      gsap.fromTo(
        createBtnRef.current,
        { scale: 1 },
        { scale: 1.08, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.inOut' }
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
    <main ref={mainRef} className="min-h-screen relative" style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {/* Decorative corner images */}
      <Image src="/stylized_imgs/stone2.png" alt="" width={160} height={220} className="decor-item fixed -top-6 -right-6 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.2))', transform: 'rotate(12deg)' }} />
      <Image src="/stylized_imgs/leaf4.png" alt="" width={140} height={120} className="decor-item fixed top-10 -left-8 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.15))', transform: 'rotate(-15deg)' }} />
      <Image src="/stylized_imgs/flower4.png" alt="" width={150} height={150} className="decor-item fixed -bottom-4 -left-4 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.15))', transform: 'rotate(-20deg)' }} />
      <Image src="/stylized_imgs/pine.png" alt="" width={120} height={200} className="decor-item fixed -bottom-10 -right-6 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.2))', transform: 'rotate(5deg)' }} />
      <Image src="/stylized_imgs/sun.png" alt="" width={180} height={170} className="decor-sun fixed top-24 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(0 0 25px rgba(255,200,50,0.5)) drop-shadow(0 0 50px rgba(255,180,30,0.2))' }} />
      <img src="/stylized_imgs/oni.png" alt="" className="fixed bottom-0 left-[53%] -translate-x-1/2 w-[900px] pointer-events-none select-none z-[3]" style={{ opacity: 0.15 }} />

      <div className="max-w-2xl mx-auto px-6 py-12 relative z-10">
        <div className="bg-white/85 backdrop-blur-sm border-2 border-[#e8e8e8] p-8 shadow-[6px_6px_0px_rgba(0,0,0,0.08)]">
        <Link href="/dashboard" className="text-[#888] hover:text-[#111] flex items-center gap-2 mb-8 text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        <div className="new-project-header manga-speedlines rounded-none p-8 mb-8">
          <h1 className="new-project-title manga-title text-4xl text-[#111]">
            <Sparkles className="inline mr-2 text-[#111]" size={28} />
            New Project
          </h1>
          <p className="new-project-subtitle text-[#888] mt-2">Create your trailer project, then upload your story content.</p>
        </div>

        <div className="space-y-6">
          <div className="form-field">
            <label className="manga-accent-bar text-sm mb-3 block">Project Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Book Trailer"
              className="manga-input w-full"
            />
          </div>

          <div className="form-field">
            <label className="manga-accent-bar text-sm mb-3 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your story..."
              rows={3}
              className="manga-input w-full resize-none"
            />
          </div>

          <button
            ref={createBtnRef}
            onClick={handleCreate}
            disabled={!title.trim() || loading}
            className="create-btn manga-btn w-full bg-[#111] text-white py-3 px-6 text-lg"
          >
            {loading ? 'Creating…' : 'Create Project'}
          </button>
        </div>
        </div>
      </div>
    </main>
  );
}
