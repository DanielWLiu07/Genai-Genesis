'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
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
      // Header speedlines section slides down from top with bounce
      gsap.fromTo(
        '.new-project-header',
        { y: -80, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, ease: 'bounce.out' }
      );

      // Title slams in with scale and rotation
      gsap.fromTo(
        '.new-project-title',
        { scale: 2, rotateZ: -5, opacity: 0 },
        { scale: 1, rotateZ: 0, opacity: 1, duration: 0.6, delay: 0.2, ease: 'back.out(1.4)' }
      );

      // Subtitle fades in
      gsap.fromTo(
        '.new-project-subtitle',
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, delay: 0.5, ease: 'power2.out' }
      );

      // Form fields stagger in from left
      gsap.fromTo(
        '.form-field',
        { x: -60, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, stagger: 0.1, delay: 0.4, ease: 'power3.out' }
      );

      // Create button punches in from bottom
      gsap.fromTo(
        '.create-btn',
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, delay: 0.7, ease: 'back.out(1.7)' }
      );
    }, mainRef);

    return () => ctx.revert();
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;

    // Pulse animation on button before loading
    if (createBtnRef.current) {
      gsap.fromTo(
        createBtnRef.current,
        { scale: 1 },
        { scale: 1.08, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.inOut' }
      );
    }

    setLoading(true);
    try {
      const project: any = await api.createProject({ title: title.trim(), description: description.trim() || undefined });
      router.push(`/project/${project.id}/upload`);
    } catch (err) {
      console.error(err);
      alert('Failed to create project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main ref={mainRef} className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-2xl mx-auto px-6 py-12">
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
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </main>
  );
}
