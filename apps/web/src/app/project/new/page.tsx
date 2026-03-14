'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Music, X, Upload } from 'lucide-react';
import { TransitionLink as Link } from '@/components/PageTransition';
import { api } from '@/lib/api';
import gsap from 'gsap';

const ACCEPTED_AUDIO = '.mp3,.wav,.ogg,.flac,.aac,.m4a';

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDragging, setAudioDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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

    return () => ctx.revert();
  }, []);

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setAudioDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) setAudioFile(file);
  };

  const handleAudioInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAudioFile(file);
  };

  const formatFileSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

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
      setLoadingStep('Creating project…');
      const project: any = await api.createProject({
        title: title.trim(),
        description: description.trim() || undefined,
      });

      if (audioFile) {
        setLoadingStep('Analysing audio…');
        try {
          await api.uploadAudio(project.id, audioFile);
        } catch (err) {
          console.error('Audio analysis failed (continuing):', err);
        }
      }

      router.push(`/project/${project.id}/upload`);
    } catch (err) {
      console.error(err);
      alert('Failed to create project. Please try again.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <main ref={mainRef} className="min-h-screen bg-white/80 backdrop-blur-sm">
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

          {/* Audio upload */}
          <div className="form-field">
            <label className="manga-accent-bar text-sm mb-3 block">
              Trailer Audio <span className="text-[#aaa] font-normal ml-1">(optional)</span>
            </label>
            <p className="text-xs text-[#888] mb-3">
              Upload a music clip and we'll extract BPM, beats, energy curve, and section boundaries to sync your trailer.
            </p>

            {audioFile ? (
              <div className="border-2 border-[#111] p-4 flex items-center gap-3 bg-[#f9f9f9]">
                <Music size={20} className="text-[#a855f7] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#111] truncate">{audioFile.name}</p>
                  <p className="text-xs text-[#888]">{formatFileSize(audioFile.size)}</p>
                </div>
                <button
                  onClick={() => { setAudioFile(null); if (audioInputRef.current) audioInputRef.current.value = ''; }}
                  className="text-[#888] hover:text-[#111] transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setAudioDragging(true); }}
                onDragLeave={() => setAudioDragging(false)}
                onDrop={handleAudioDrop}
                onClick={() => audioInputRef.current?.click()}
                className={`border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                  audioDragging
                    ? 'border-[#a855f7] bg-purple-50'
                    : 'border-[#ccc] hover:border-[#111] hover:bg-[#f9f9f9]'
                }`}
              >
                <Upload size={24} className="mx-auto mb-2 text-[#aaa]" />
                <p className="text-sm text-[#666]">Drop an audio file here or <span className="underline">browse</span></p>
                <p className="text-xs text-[#aaa] mt-1">MP3, WAV, OGG, FLAC, AAC, M4A</p>
              </div>
            )}

            <input
              ref={audioInputRef}
              type="file"
              accept={ACCEPTED_AUDIO}
              className="hidden"
              onChange={handleAudioInput}
            />
          </div>

          <button
            ref={createBtnRef}
            onClick={handleCreate}
            disabled={!title.trim() || loading}
            className="create-btn manga-btn w-full bg-[#111] text-white py-3 px-6 text-lg"
          >
            {loading ? loadingStep : 'Create Project'}
          </button>
        </div>
      </div>
    </main>
  );
}
