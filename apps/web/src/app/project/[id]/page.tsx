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

  useEffect(() => {
    if (!id) return;
    setProjectId(id);

    // Load project + timeline in parallel
    Promise.all([
      api.getProject(id).catch(() => null),
      api.getTimeline(id).catch(() => ({ clips: [], music_track: null, settings: null })),
    ]).then(([project, timeline]: [any, any]) => {
      if (project) {
        // Try to recover book_text from sessionStorage
        const storedBookText = sessionStorage.getItem(`book_text_${id}`);
        if (storedBookText && !project.book_text) {
          project.book_text = storedBookText;
        }
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

      // Poll for completion
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

    const bookText = currentProject.book_text || sessionStorage.getItem(`book_text_${id}`);
    const existingAnalysis = currentProject.analysis;

    try {
      let analysis = existingAnalysis;

      if (!analysis) {
        if (!bookText) {
          setGenError('No book text found. Please re-upload your story file.');
          setGenStep('error');
          return;
        }
        setGenStep('analyzing');
        analysis = await api.analyzeStory(id, bookText);
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
    currentProject.book_file_url ||
    (typeof window !== 'undefined' && sessionStorage.getItem(`book_text_${id}`))
  );
  const showOnboarding = !loading && !error && clips.length === 0 && hasBook && genStep !== 'done';
  const isGenerating = genStep === 'analyzing' || genStep === 'planning';

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-3 text-violet-400 animate-spin" />
          <p className="text-zinc-400">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/" className="text-violet-400 hover:text-violet-300 underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Top bar */}
      <header className="h-12 border-b border-zinc-800 flex items-center px-4 gap-4 shrink-0">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-2">
          <Film size={18} className="text-violet-400" />
          <span className="font-semibold text-sm">
            {currentProject?.title || 'FrameFlow Editor'}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors">
            <Play size={14} /> Preview
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors"
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
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-violet-500/5">
                <div className="w-14 h-14 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
                  <Sparkles size={28} className="text-violet-400" />
                </div>

                <h2 className="text-xl font-bold text-center mb-2">
                  Ready to create your trailer
                </h2>
                <p className="text-zinc-400 text-sm text-center mb-8">
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
                  <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-red-400 text-sm">{genError}</p>
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
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
                  <p className="text-xs text-zinc-500 text-center mt-3">
                    Story already analyzed -- will skip to trailer planning
                  </p>
                )}
              </div>
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
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
      status === 'active'
        ? 'bg-violet-500/10 border border-violet-500/20'
        : status === 'done'
        ? 'bg-emerald-500/10 border border-emerald-500/20'
        : 'bg-zinc-800/50 border border-zinc-700/50'
    }`}>
      <div className={`shrink-0 ${
        status === 'active' ? 'text-violet-400' : status === 'done' ? 'text-emerald-400' : 'text-zinc-600'
      }`}>
        {status === 'active' ? <Loader2 size={16} className="animate-spin" /> : icon}
      </div>
      <span className={`text-sm ${
        status === 'active' ? 'text-violet-300' : status === 'done' ? 'text-emerald-300' : 'text-zinc-500'
      }`}>
        {label}
        {status === 'done' && <span className="ml-1.5 text-emerald-400">done</span>}
      </span>
    </div>
  );
}
