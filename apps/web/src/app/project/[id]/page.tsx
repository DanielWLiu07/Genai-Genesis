'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FlowEditor } from '@/components/editor/FlowEditor';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Film, ArrowLeft, Play, Download, Loader2, Sparkles, BookOpen, Clapperboard } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useTimelineStore } from '@/stores/timeline-store';
import { useProjectStore } from '@/stores/project-store';
import gsap from 'gsap';

type GenerationStep = 'idle' | 'analyzing' | 'planning' | 'done' | 'error';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [genStep, setGenStep] = useState<GenerationStep>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const setProjectId = useTimelineStore((s) => s.setProjectId);
  const clips = useTimelineStore((s) => s.clips);
  const updateClip = useTimelineStore((s) => s.updateClip);
  const { currentProject, setCurrentProject } = useProjectStore();
  const updateProject = useProjectStore((s) => s.updateProject);
  const wsRef = useRef<WebSocket | null>(null);

  // GSAP refs
  const topBarRef = useRef<HTMLElement>(null);
  const onboardingCardRef = useRef<HTMLDivElement>(null);
  const generateBtnRef = useRef<HTMLButtonElement>(null);
  const editorHeaderRef = useRef<HTMLDivElement>(null);
  const flashOverlayRef = useRef<HTMLDivElement>(null);
  const prevGenStepRef = useRef<GenerationStep>('idle');
  const hadClipsRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    setProjectId(id);

    Promise.all([
      api.getProject(id).catch(() => null),
      api.getTimeline(id).catch(() => ({ clips: [], music_track: null, settings: null })),
    ]).then(([project, timeline]: [any, any]) => {
      if (project) {
        const storedBookText = sessionStorage.getItem(`book_text_${id}`);
        if (storedBookText && !project.book_text) {
          project.book_text = storedBookText;
        }
        // Recover characters and images from sessionStorage
        const storedChars = sessionStorage.getItem(`characters_${id}`);
        if (storedChars) {
          project.characters = JSON.parse(storedChars);
        }
        if (!project.characters) project.characters = [];
        if (!project.uploaded_images) project.uploaded_images = [];
        setCurrentProject(project);
      }
      if (timeline) loadTimeline(timeline);
    })
      .catch((err) => {
        console.error('Failed to load project:', err);
        setError('Failed to load project.');
      })
      .finally(() => setLoading(false));

    // WebSocket for real-time generation updates
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
      .replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/api/v1/ws/${id}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if ((msg.type === 'clip_update' || msg.type === 'clip_updated') && msg.clip_id) {
          updateClip(msg.clip_id, msg.updates || { gen_status: msg.gen_status, generated_media_url: msg.generated_media_url });
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [id, setProjectId, loadTimeline, setCurrentProject, updateClip]);

  // ── GSAP: Top bar slides down on mount ──
  useEffect(() => {
    if (loading || error) return;
    const ctx = gsap.context(() => {
      // 1. Top bar slides down from top
      if (topBarRef.current) {
        gsap.fromTo(topBarRef.current,
          { y: -48, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }
        );
      }
    });
    return () => ctx.revert();
  }, [loading, error]);

  // ── GSAP: Onboarding card dramatic entrance ──
  useEffect(() => {
    if (!onboardingCardRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(onboardingCardRef.current,
        { scale: 0.8, opacity: 0, rotation: -2 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(1.7)', delay: 0.2 }
      );
    });
    return () => ctx.revert();
  }, [loading, clips.length, genStep]);

  // ── GSAP: Generate button idle glow pulse ──
  useEffect(() => {
    if (!generateBtnRef.current) return;
    const ctx = gsap.context(() => {
      gsap.to(generateBtnRef.current, {
        boxShadow: '0 0 20px rgba(168, 85, 247, 0.6), 0 0 40px rgba(168, 85, 247, 0.3)',
        duration: 1.2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    });
    return () => ctx.revert();
  }, [loading, clips.length, genStep]);

  // ── GSAP: Step indicator pulse on active ──
  useEffect(() => {
    if (genStep === 'analyzing' || genStep === 'planning') {
      const activeIndicators = document.querySelectorAll('.step-indicator-active');
      gsap.fromTo(activeIndicators,
        { scale: 1 },
        { scale: 1.05, duration: 0.5, ease: 'power1.inOut', yoyo: true, repeat: 2 }
      );
    }
  }, [genStep]);

  // ── GSAP: Flash screen when generation completes ──
  useEffect(() => {
    if (genStep === 'done' && prevGenStepRef.current !== 'done') {
      if (flashOverlayRef.current) {
        gsap.fromTo(flashOverlayRef.current,
          { opacity: 0.8, display: 'block' },
          {
            opacity: 0,
            duration: 0.6,
            ease: 'power2.out',
            onComplete: () => {
              if (flashOverlayRef.current) {
                flashOverlayRef.current.style.display = 'none';
              }
            },
          }
        );
      }
    }
    prevGenStepRef.current = genStep;
  }, [genStep]);

  // ── GSAP: Celebration on first clips load ──
  useEffect(() => {
    if (clips.length > 0 && !hadClipsRef.current) {
      hadClipsRef.current = true;
      if (editorHeaderRef.current) {
        const tl = gsap.timeline();
        tl.to(editorHeaderRef.current, {
          scale: 1.05,
          duration: 0.2,
          ease: 'power2.out',
        });
        tl.to(editorHeaderRef.current, {
          scale: 1,
          duration: 0.3,
          ease: 'elastic.out(1, 0.5)',
        });
        tl.fromTo(editorHeaderRef.current, {
          textShadow: '0 0 0px rgba(168, 85, 247, 0)',
        }, {
          textShadow: '0 0 20px rgba(168, 85, 247, 0.8)',
          duration: 0.3,
          yoyo: true,
          repeat: 1,
        }, '<');
      }
    }
  }, [clips.length]);

  const handleExport = useCallback(async () => {
    if (!id || exporting) return;
    setExporting(true);
    setExportStatus('Starting render...');
    try {
      const result: any = await api.renderTrailer(id);
      const jobId = result.job_id;
      if (!jobId) {
        setExportStatus(null);
        alert('Export submitted.');
        return;
      }

      setExportStatus('Rendering...');
      let attempts = 0;
      const maxAttempts = 120;
      while (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 5000));
        attempts++;
        try {
          const status: any = await api.getRenderStatus(id, jobId);
          const progress = status.progress || 0;
          setExportStatus(`Rendering... ${progress}%`);

          if (status.status === 'done') {
            setExportStatus('Done!');
            const outputUrl = status.output_url || '';
            if (outputUrl.startsWith('http')) {
              window.open(outputUrl, '_blank');
            } else {
              alert('Render complete! Output: ' + outputUrl);
            }
            break;
          } else if (status.status === 'error') {
            setExportStatus(null);
            alert('Render failed: ' + (status.error || 'Unknown error'));
            break;
          }
        } catch {
          // Keep polling on transient errors
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Check console for details.');
    } finally {
      setExporting(false);
      setTimeout(() => setExportStatus(null), 3000);
    }
  }, [id, exporting]);

  const handleGenerate = useCallback(async () => {
    if (!currentProject || !id) return;

    const bookText = currentProject.book_text || currentProject.story_text || sessionStorage.getItem(`book_text_${id}`);
    const existingAnalysis = currentProject.analysis;
    const characters = currentProject.characters || [];
    const uploadedImages = currentProject.uploaded_images || [];

    try {
      let analysis = existingAnalysis;

      if (!analysis) {
        if (!bookText) {
          setGenError('No story uploaded yet. Go to the upload page to add your story.');
          setGenStep('error');
          return;
        }
        setGenStep('analyzing');
        analysis = await api.analyzeStory(id, bookText, {
          characters: characters.length > 0 ? characters : undefined,
          uploaded_images: uploadedImages.length > 0 ? uploadedImages.map((i: any) => i.url) : undefined,
        });
        updateProject(id, { analysis, status: 'planning' });
      }

      setGenStep('planning');
      const timeline: any = await api.planTrailer(id, { analysis });

      loadTimeline(timeline);
      updateProject(id, { status: 'editing' });
      setGenStep('done');
      sessionStorage.removeItem(`book_text_${id}`);
    } catch (err: any) {
      console.error('Generation failed:', err);
      setGenError(err.message || 'Failed to generate trailer. Please try again.');
      setGenStep('error');
    }
  }, [currentProject, id, loadTimeline, updateProject]);

  const hasBook = currentProject && (
    currentProject.book_text ||
    currentProject.story_text ||
    currentProject.book_file_url ||
    (typeof window !== 'undefined' && sessionStorage.getItem(`book_text_${id}`))
  );
  const showOnboarding = !loading && !error && clips.length === 0 && hasBook && genStep !== 'done';
  const isGenerating = genStep === 'analyzing' || genStep === 'planning';

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-3 text-[#111] animate-spin" />
          <p className="text-[#888]">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/dashboard" className="text-[#111] hover:text-[#555] underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#f5f5f5]">
      {/* Flash overlay for generation complete */}
      <div
        ref={flashOverlayRef}
        className="fixed inset-0 z-50 bg-[#111] pointer-events-none"
        style={{ display: 'none', opacity: 0 }}
      />

      {/* Top bar */}
      <header ref={topBarRef} className="h-12 border-b-2 border-[#ccc] flex items-center px-4 gap-4 shrink-0 bg-[#f5f5f5]">
        <Link href="/dashboard" className="text-[#888] hover:text-[#111] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div ref={editorHeaderRef} className="flex items-center gap-2">
          <Film size={18} className="text-[#111]" />
          <span className="font-semibold text-sm text-[#111]" style={{ fontFamily: 'var(--font-manga)' }}>
            {currentProject?.title || 'MangaMate Editor'}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="manga-btn bg-white text-[#111] px-3 py-1.5 text-sm flex items-center gap-1.5">
            <Play size={14} /> Preview
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="manga-btn bg-[#111] text-white px-3 py-1.5 text-sm flex items-center gap-1.5"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exportStatus || (exporting ? 'Exporting...' : 'Export')}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* React Flow Editor */}
        <div className="flex-1">
          <FlowEditor />
        </div>

        {/* Onboarding overlay */}
        {showOnboarding && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#f5f5f5]/80 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4">
              <div ref={onboardingCardRef} className="manga-panel-accent p-8">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-6">
                  <Sparkles size={28} className="text-[#111]" />
                </div>

                <h2 className="manga-title text-2xl text-center mb-2 text-[#111]">
                  Ready to create your trailer
                </h2>
                <p className="text-[#888] text-sm text-center mb-8">
                  Our AI will analyze your story and generate a cinematic trailer plan with scenes, transitions, and pacing.
                </p>

                {isGenerating && (
                  <div className="mb-6 space-y-3">
                    <StepIndicator
                      icon={<BookOpen size={16} />}
                      label="Analyzing story structure"
                      status={genStep === 'analyzing' ? 'active' : 'done'}
                    />
                    <StepIndicator
                      icon={<Clapperboard size={16} />}
                      label="Planning trailer scenes"
                      status={genStep === 'planning' ? 'active' : genStep === 'analyzing' ? 'pending' : 'done'}
                    />
                  </div>
                )}

                {genStep === 'error' && genError && (
                  <div className="mb-6 p-3 bg-red-500/10 border-2 border-red-500/30">
                    <p className="text-red-400 text-sm">{genError}</p>
                    {!hasBook && (
                      <Link href={`/project/${id}/upload`} className="text-[#111] text-sm underline mt-2 block">
                        Go to Upload Page
                      </Link>
                    )}
                  </div>
                )}

                <button
                  ref={generateBtnRef}
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="manga-btn w-full bg-[#111] text-white py-3 text-lg flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {genStep === 'analyzing' ? 'Analyzing your story...' : 'Planning trailer scenes...'}
                    </>
                  ) : genStep === 'error' ? (
                    'Try Again'
                  ) : currentProject?.analysis ? (
                    <>
                      <Clapperboard size={18} />
                      Plan Trailer
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Generate Trailer
                    </>
                  )}
                </button>

                {currentProject?.analysis && genStep === 'idle' && (
                  <p className="text-xs text-[#555] text-center mt-3">
                    Story already analyzed -- will skip to trailer planning
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* No story uploaded state */}
        {!loading && !error && clips.length === 0 && !hasBook && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#f5f5f5]/80 backdrop-blur-sm">
            <div className="manga-panel-accent p-8 max-w-md text-center">
              <BookOpen size={32} className="mx-auto mb-4 text-[#111]" />
              <h2 className="manga-title text-xl mb-2 text-[#111]">No Story Content</h2>
              <p className="text-[#888] text-sm mb-6">Upload your story text, images, or character details to get started.</p>
              <Link href={`/project/${id}/upload`} className="manga-btn bg-[#111] text-white px-6 py-3 inline-block">
                Go to Upload
              </Link>
            </div>
          </div>
        )}

        {/* Chat Panel */}
        <div className="w-[350px] shrink-0">
          <ChatPanel projectId={id} />
        </div>
      </div>
    </div>
  );
}

function StepIndicator({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: 'pending' | 'active' | 'done';
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
      status === 'active' ? 'step-indicator-active' : ''
    } ${
      status === 'active'
        ? 'bg-[#111]/10 border-2 border-[#111]/30'
        : status === 'done'
        ? 'bg-emerald-500/10 border-2 border-emerald-500/30'
        : 'bg-white border-2 border-[#ccc]'
    }`}>
      <div className={`shrink-0 ${
        status === 'active' ? 'text-[#111]' : status === 'done' ? 'text-emerald-400' : 'text-[#555]'
      }`}>
        {status === 'active' ? <Loader2 size={16} className="animate-spin" /> : icon}
      </div>
      <span className={`text-sm ${
        status === 'active' ? 'text-[#555]' : status === 'done' ? 'text-emerald-300' : 'text-[#555]'
      }`}>
        {label}
        {status === 'done' && <span className="ml-1.5 text-emerald-400">done</span>}
      </span>
    </div>
  );
}
