'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FlowEditor } from '@/components/editor/FlowEditor';
import { ChatPanel } from '@/components/chat/ChatPanel';
import {
  Film, ArrowLeft, Play, Download, Loader2, Sparkles, BookOpen, Clapperboard,
  Lightbulb, Palette, Settings, Users, BarChart2, Plus, Trash2, Check,
  RotateCcw, RefreshCw, X, Edit2, Upload, ChevronLeft, ChevronRight, Zap,
} from 'lucide-react';
import { TransitionLink as Link } from '@/components/PageTransition';
import { api } from '@/lib/api';
import { useTimelineStore } from '@/stores/timeline-store';
import { useProjectStore, type CharacterEntry } from '@/stores/project-store';
import { ClipDetailPanel } from '@/components/editor/ClipDetailPanel';
import { TimelineStrip } from '@/components/editor/TimelineStrip';
import gsap from 'gsap';

type GenerationStep = 'idle' | 'analyzing' | 'planning' | 'done' | 'error';
type SidebarTab = 'story' | 'chars';

const STYLES = ['cinematic', 'manga', 'noir', 'horror', 'romance', 'fantasy', 'sci-fi', 'comic'];

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [genStep, setGenStep] = useState<GenerationStep>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [selectedStyle, setSelectedStyle] = useState('cinematic');
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Left sidebar tab state
  const [activeTab, setActiveTab] = useState<SidebarTab>('story');
  const [showSettings, setShowSettings] = useState(false);

  // Character editing state
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editCharName, setEditCharName] = useState('');
  const [editCharDesc, setEditCharDesc] = useState('');
  const [addingChar, setAddingChar] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharDesc, setNewCharDesc] = useState('');

  // Settings editing state
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStoryText, setEditStoryText] = useState('');
  const [editThumbnail, setEditThumbnail] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const setProjectId = useTimelineStore((s) => s.setProjectId);
  const clips = useTimelineStore((s) => s.clips);
  const updateClip = useTimelineStore((s) => s.updateClip);
  const { currentProject, setCurrentProject } = useProjectStore();
  const updateProject = useProjectStore((s) => s.updateProject);
  const addCharacter = useProjectStore((s) => s.addCharacter);
  const removeCharacter = useProjectStore((s) => s.removeCharacter);
  const updateCharacter = useProjectStore((s) => s.updateCharacter);
  const wsRef = useRef<WebSocket | null>(null);

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
        if (storedBookText && !project.book_text) project.book_text = storedBookText;
        const storedChars = sessionStorage.getItem(`characters_${id}`);
        if (storedChars) project.characters = JSON.parse(storedChars);
        if (!project.characters) project.characters = [];
        if (!project.uploaded_images) project.uploaded_images = [];
        setCurrentProject(project);
        setEditTitle(project.title || '');
        setEditDesc(project.description || '');
        setEditStoryText(project.book_text || project.story_text || sessionStorage.getItem(`book_text_${id}`) || '');
        // Prefer localStorage thumbnail (data URLs persist there; API only stores URLs)
        const localThumb = localStorage.getItem(`cover_image_${id}`);
        const thumb = localThumb || project.cover_image_url || '';
        setEditThumbnail(thumb);
        if (thumb && !project.cover_image_url) {
          project.cover_image_url = thumb;
        }
      }
      if (timeline) {
        loadTimeline(timeline);
        // If project has no cover, use the first generated clip's thumbnail
        if (project && !project.cover_image_url) {
          const firstThumb = (timeline.clips || []).find((c: any) => c.thumbnail_url)?.thumbnail_url;
          if (firstThumb) {
            updateProject(id, { cover_image_url: firstThumb });
            api.updateProject(id, { cover_image_url: firstThumb }).catch(() => {});
          }
        }
      }
    }).catch((err) => {
      console.error('Failed to load project:', err);
      setError('Failed to load project.');
    }).finally(() => setLoading(false));

    const wsUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/api/v1/ws/${id}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if ((msg.type === 'clip_update' || msg.type === 'clip_updated') && msg.clip_id) {
          const updates: Record<string, any> = {};
          if (msg.gen_status) updates.gen_status = msg.gen_status;
          if (msg.status) updates.gen_status = msg.status;
          if (msg.generated_media_url) updates.generated_media_url = msg.generated_media_url;
          if (msg.media_url) updates.generated_media_url = msg.media_url;
          if (msg.thumbnail_url) updates.thumbnail_url = msg.thumbnail_url;
          if (msg.gen_error || msg.error) updates.gen_error = msg.gen_error || msg.error;
          if (msg.updates) Object.assign(updates, msg.updates);
          if (Object.keys(updates).length > 0) updateClip(msg.clip_id, updates);

          // Auto-set project cover from first generated thumbnail
          if (msg.thumbnail_url) {
            const proj = useProjectStore.getState().currentProject;
            if (proj && !proj.cover_image_url) {
              updateProject(id, { cover_image_url: msg.thumbnail_url });
            }
          }
        }
      } catch { /* ignore */ }
    };
    return () => { ws.close(); wsRef.current = null; };
  }, [id, setProjectId, loadTimeline, setCurrentProject, updateClip]);

  useEffect(() => {
    if (loading || error) return;
    const ctx = gsap.context(() => {
      if (topBarRef.current) {
        gsap.fromTo(topBarRef.current, { y: -48, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
      }
    });
    return () => ctx.revert();
  }, [loading, error]);

  useEffect(() => {
    if (!onboardingCardRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(onboardingCardRef.current, { scale: 0.8, opacity: 0, rotation: -2 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(1.7)', delay: 0.2 });
    });
    return () => ctx.revert();
  }, [loading, clips.length, genStep]);

  useEffect(() => {
    if (!generateBtnRef.current) return;
    const ctx = gsap.context(() => {
      gsap.to(generateBtnRef.current, { boxShadow: '0 0 20px rgba(168, 85, 247, 0.6), 0 0 40px rgba(168, 85, 247, 0.3)', duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
    return () => ctx.revert();
  }, [loading, clips.length, genStep]);

  useEffect(() => {
    if (genStep === 'analyzing' || genStep === 'planning') {
      const activeIndicators = document.querySelectorAll('.step-indicator-active');
      gsap.fromTo(activeIndicators, { scale: 1 }, { scale: 1.05, duration: 0.5, ease: 'power1.inOut', yoyo: true, repeat: 2 });
    }
  }, [genStep]);

  useEffect(() => {
    if (genStep === 'done' && prevGenStepRef.current !== 'done') {
      if (flashOverlayRef.current) {
        gsap.fromTo(flashOverlayRef.current,
          { opacity: 0.8, display: 'block' },
          { opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => { if (flashOverlayRef.current) flashOverlayRef.current.style.display = 'none'; } }
        );
      }
    }
    prevGenStepRef.current = genStep;
  }, [genStep]);

  useEffect(() => {
    if (clips.length > 0 && !hadClipsRef.current) {
      hadClipsRef.current = true;
      if (editorHeaderRef.current) {
        const tl = gsap.timeline();
        tl.to(editorHeaderRef.current, { scale: 1.05, duration: 0.2, ease: 'power2.out' });
        tl.to(editorHeaderRef.current, { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.5)' });
        tl.fromTo(editorHeaderRef.current,
          { textShadow: '0 0 0px rgba(168, 85, 247, 0)' },
          { textShadow: '0 0 20px rgba(168, 85, 247, 0.8)', duration: 0.3, yoyo: true, repeat: 1 }, '<'
        );
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
      if (!jobId) { setExportStatus(null); alert('Export submitted.'); return; }
      setExportStatus('Rendering...');
      let attempts = 0;
      while (attempts < 120) {
        await new Promise((r) => setTimeout(r, 5000));
        attempts++;
        try {
          const status: any = await api.getRenderStatus(id, jobId);
          setExportStatus(`Rendering... ${status.progress || 0}%`);
          if (status.status === 'done') {
            setExportStatus('Done!');
            const outputUrl = status.output_url || '';
            if (outputUrl.startsWith('http')) window.open(outputUrl, '_blank');
            else alert('Render complete! Output: ' + outputUrl);
            break;
          } else if (status.status === 'error') {
            setExportStatus(null);
            alert('Render failed: ' + (status.error || 'Unknown error'));
            break;
          }
        } catch { /* keep polling */ }
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Check console for details.');
    } finally {
      setExporting(false);
      setTimeout(() => setExportStatus(null), 3000);
    }
  }, [id, exporting]);

  const handleGenerate = useCallback(async (forceRegen = false) => {
    if (!currentProject || !id) return;

    const bookText = editStoryText || currentProject.book_text || currentProject.story_text || sessionStorage.getItem(`book_text_${id}`);
    const existingAnalysis = forceRegen ? null : currentProject.analysis;
    const characters = currentProject.characters || [];
    const uploadedImages = currentProject.uploaded_images || [];

    try {
      let analysis = (!forceRegen && existingAnalysis?.key_scenes) ? existingAnalysis : null;

      if (!analysis) {
        if (!bookText) { setGenError('No story uploaded yet.'); setGenStep('error'); return; }
        setGenStep('analyzing');
        analysis = await api.analyzeStory(id, bookText, {
          characters: characters.length > 0 ? characters : undefined,
          uploaded_images: uploadedImages.length > 0 ? uploadedImages.map((i: any) => i.url) : undefined,
        });
        updateProject(id, { analysis, status: 'planning' });
      }

      setGenStep('planning');
      const timeline: any = await api.planTrailer(id, { analysis, style: selectedStyle });
      if (!timeline?.clips?.length) throw new Error('AI returned empty trailer plan.');

      loadTimeline(timeline);
      updateProject(id, { status: 'editing' });
      setGenStep('done');
      sessionStorage.removeItem(`book_text_${id}`);

      try {
        await api.updateTimeline(id, {
          clips: timeline.clips,
          music_track: timeline.music_track || null,
          settings: timeline.settings || { resolution: '1080p', aspect_ratio: '16:9', fps: 24 },
          total_duration_ms: timeline.total_duration_ms || 0,
        });
      } catch { /* non-fatal */ }
    } catch (err: any) {
      console.error('Generation failed:', err);
      setGenError(err.message || 'Failed to generate trailer.');
      setGenStep('error');
    }
  }, [currentProject, id, loadTimeline, updateProject, selectedStyle, editStoryText]);

  const handleReplan = useCallback(() => {
    // Keep analysis, just re-plan with current style
    handleGenerate(false);
  }, [handleGenerate]);

  const handleRegenFromScratch = useCallback(() => {
    // Clear analysis + re-analyze + re-plan
    if (currentProject && id) updateProject(id, { analysis: undefined });
    handleGenerate(true);
  }, [currentProject, id, updateProject, handleGenerate]);

  const handleSaveSettings = useCallback(async () => {
    if (!id) return;
    setSavingSettings(true);
    try {
      // Persist thumbnail locally — data URLs are too large for API body limits
      if (editThumbnail) {
        localStorage.setItem(`cover_image_${id}`, editThumbnail);
      } else {
        localStorage.removeItem(`cover_image_${id}`);
      }
      if (editStoryText) sessionStorage.setItem(`book_text_${id}`, editStoryText);

      // Update in-memory store immediately so dashboard reflects the change
      updateProject(id, {
        title: editTitle,
        description: editDesc,
        book_text: editStoryText,
        cover_image_url: editThumbnail || undefined,
      });

      // Persist text fields to API (skip cover_image_url if it's a data URL — too large)
      const apiPayload: Record<string, any> = { title: editTitle, description: editDesc };
      if (editThumbnail && !editThumbnail.startsWith('data:')) {
        apiPayload.cover_image_url = editThumbnail;
      }
      await api.updateProject(id, apiPayload).catch(() => {});
    } finally {
      setSavingSettings(false);
    }
  }, [id, editTitle, editDesc, editStoryText, editThumbnail, updateProject]);

  const handleGetSuggestions = useCallback(async () => {
    if (!id || loadingSuggestions) return;
    setLoadingSuggestions(true);
    try {
      const timeline = { clips, music_track: useTimelineStore.getState().musicTrack, settings: useTimelineStore.getState().settings };
      const result: any = await api.getSuggestions(id, timeline, currentProject?.analysis);
      setSuggestions(result.suggestions || []);
    } catch { setSuggestions([]); } finally { setLoadingSuggestions(false); }
  }, [id, clips, currentProject, loadingSuggestions]);

  const handleStartAddChar = () => { setAddingChar(true); setNewCharName(''); setNewCharDesc(''); };
  const handleConfirmAddChar = () => {
    if (!newCharName.trim()) return;
    addCharacter({ name: newCharName.trim(), description: newCharDesc.trim() });
    setAddingChar(false);
  };
  const handleStartEditChar = (c: CharacterEntry) => {
    setEditingCharId(c.id);
    setEditCharName(c.name);
    setEditCharDesc(c.description);
  };
  const handleConfirmEditChar = () => {
    if (!editingCharId) return;
    updateCharacter(editingCharId, { name: editCharName.trim(), description: editCharDesc.trim() });
    setEditingCharId(null);
  };

  const hasBook = currentProject && (
    currentProject.book_text || currentProject.story_text || currentProject.book_file_url ||
    (typeof window !== 'undefined' && sessionStorage.getItem(`book_text_${id}`))
  );
  const alreadyEditing = ['editing', 'rendering', 'done'].includes(currentProject?.status || '');
  const showOnboarding = !loading && !error && clips.length === 0 && hasBook && genStep !== 'done' && !alreadyEditing;
  const isGenerating = genStep === 'analyzing' || genStep === 'planning';

  // All characters: project characters + any AI-detected ones not already in the list
  const projectChars = currentProject?.characters || [];
  const aiChars: any[] = (currentProject?.analysis?.characters || []).filter(
    (ac: any) => !projectChars.some((pc) => pc.name.toLowerCase() === (ac.name || '').toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-3 text-[#111] animate-spin" />
          <p className="text-[#888]">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/dashboard" className="text-[#111] hover:text-[#555] underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div ref={flashOverlayRef} className="fixed inset-0 z-50 bg-[#111] pointer-events-none" style={{ display: 'none', opacity: 0 }} />

      {/* Top bar */}
      <header ref={topBarRef} className="h-12 border-b-2 border-[#ccc] flex items-center px-4 gap-3 shrink-0 bg-white/80 backdrop-blur-sm">
        <Link href="/dashboard" className="text-[#888] hover:text-[#111] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div ref={editorHeaderRef} className="flex items-center gap-2">
          <Film size={18} className="text-[#111]" />
          <span
            className="font-bold text-base truncate max-w-[280px]"
            style={{ fontFamily: 'var(--font-manga)', color: '#fff', WebkitTextStroke: '1.5px #111', paintOrder: 'stroke fill', textShadow: '2px 2px 0px #000' }}
          >
            {currentProject?.title || 'MangaMate Editor'}
          </span>
        </div>
        <div className="ml-auto flex items-stretch gap-2">
          {currentProject && (
            <button
              onClick={() => setShowSettings(true)}
              className={`manga-btn px-2.5 text-sm flex items-center gap-1.5 transition-colors ${showSettings ? 'bg-[#111] text-white' : 'bg-white text-[#111] hover:text-black'}`}
              title="Settings"
            >
              <Settings size={14} />
            </button>
          )}
          {clips.length > 0 && (
            <button onClick={handleGetSuggestions} disabled={loadingSuggestions} className="manga-btn bg-white text-[#111] px-3 py-1.5 text-sm flex items-center gap-1.5">
              {loadingSuggestions ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />} Suggestions
            </button>
          )}
          {clips.length > 0 && (
            <Link href={`/project/${id}/timeline`} className="manga-btn bg-white text-[#111] px-3 py-1.5 text-sm flex items-center gap-1.5">
              <Zap size={14} /> Edit
            </Link>
          )}
          <button className="manga-btn bg-white text-[#111] px-3 py-1.5 text-sm flex items-center gap-1.5">
            <Play size={14} /> Preview
          </button>
          <button onClick={handleExport} disabled={exporting} className="manga-btn bg-[#111] text-white px-3 py-1.5 text-sm flex items-center gap-1.5">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exportStatus || (exporting ? 'Exporting...' : 'Export')}
          </button>
          {!rightOpen && (
            <button onClick={() => setRightOpen(true)} className="text-[#888] hover:text-[#111] transition-colors" title="Open panel">
              <ChevronLeft size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Left sidebar — tabbed */}
        {currentProject && clips.length > 0 && (
          <>
            {/* Collapsed strip — proper sibling, takes own 24px */}
            {!leftOpen && (
              <button
                onClick={() => setLeftOpen(true)}
                className="shrink-0 w-6 border-r-2 border-[#ccc] bg-white hover:bg-[#f0f0f0] transition-colors flex items-center justify-center text-[#888] hover:text-[#111]"
                title="Expand sidebar"
              >
                <ChevronRight size={13} />
              </button>
            )}

            {/* Open sidebar */}
            {leftOpen && (
          <div className="shrink-0 w-[220px] border-r-2 border-[#ccc] bg-white flex flex-col overflow-hidden">
                {/* Tab buttons */}
                <div className="flex border-b-2 border-[#ccc] shrink-0">
                  <button
                    onClick={() => setLeftOpen(false)}
                    className="px-2 flex items-center justify-center text-[#888] hover:text-[#111] hover:bg-[#f0f0f0] transition-colors border-r border-[#eee]"
                    title="Collapse"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  {([
                    { key: 'story', icon: <BarChart2 size={12} />, label: 'STORY' },
                    { key: 'chars', icon: <Users size={12} />, label: 'CHARS' },
                  ] as const).map(({ key, icon, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[0.55rem] font-bold tracking-wider transition-colors ${
                        activeTab === key ? 'bg-[#111] text-white' : 'text-[#888] hover:bg-[#f0f0f0]'
                      }`}
                      style={{ fontFamily: 'var(--font-manga)' }}
                    >
                      {icon}{label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-3 space-y-4">

                  {/* STORY TAB */}
                  {activeTab === 'story' && (
                    <>
                      <div>
                        <span className="manga-accent-bar text-[0.6rem]">PROJECT</span>
                        <h3 className="text-sm font-bold mt-2 text-[#111] leading-snug">{currentProject.title}</h3>
                        {currentProject.description && (
                          <p className="text-[0.7rem] text-[#888] mt-1 leading-relaxed">{currentProject.description}</p>
                        )}
                      </div>

                      {currentProject.analysis && (
                        <div>
                          <span className="manga-accent-bar text-[0.6rem]">ANALYSIS</span>
                          <div className="mt-2 space-y-1">
                            {currentProject.analysis.genre && (
                              <p className="text-xs text-[#666]"><span className="font-medium text-[#111]">Genre:</span> {currentProject.analysis.genre}</p>
                            )}
                            {currentProject.analysis.mood && (
                              <p className="text-xs text-[#666]"><span className="font-medium text-[#111]">Mood:</span> {currentProject.analysis.mood}</p>
                            )}
                            {currentProject.analysis.themes && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(currentProject.analysis.themes as string[]).slice(0, 4).map((t: string) => (
                                  <span key={t} className="text-[0.6rem] bg-[#f0f0f0] border border-[#ccc] px-1.5 py-0.5 text-[#666]">{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        <span className="manga-accent-bar text-[0.6rem]">TIMELINE</span>
                        <div className="mt-2 text-xs text-[#666] space-y-0.5">
                          <p>{clips.length} clips</p>
                          <p>{(clips.reduce((s, c) => s + c.duration_ms, 0) / 1000).toFixed(1)}s total</p>
                          <p>{clips.filter(c => c.gen_status === 'done').length} generated</p>
                          <p>{clips.filter(c => c.gen_status === 'pending').length} pending</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* CHARS TAB */}
                  {activeTab === 'chars' && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="manga-accent-bar text-[0.6rem]">CHARACTERS</span>
                          {!addingChar && (
                            <button onClick={handleStartAddChar} className="text-[#888] hover:text-[#111] transition-colors" title="Add character">
                              <Plus size={14} />
                            </button>
                          )}
                        </div>

                        {/* Add new character form */}
                        {addingChar && (
                          <div className="mb-3 p-2 border-2 border-[#111] bg-[#f9f9f9] space-y-1.5">
                            <input
                              autoFocus
                              value={newCharName}
                              onChange={(e) => setNewCharName(e.target.value)}
                              placeholder="Name..."
                              className="manga-input w-full text-xs py-1"
                            />
                            <textarea
                              value={newCharDesc}
                              onChange={(e) => setNewCharDesc(e.target.value)}
                              placeholder="Description (role, appearance...)"
                              rows={2}
                              className="manga-input w-full text-xs resize-none"
                            />
                            <div className="flex gap-1">
                              <button onClick={handleConfirmAddChar} className="manga-btn bg-[#111] text-white px-2 py-1 text-xs flex items-center gap-1">
                                <Check size={10} /> Add
                              </button>
                              <button onClick={() => setAddingChar(false)} className="manga-btn bg-white text-[#888] px-2 py-1 text-xs">
                                <X size={10} />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Project characters (editable) */}
                        <div className="space-y-2">
                          {projectChars.length === 0 && aiChars.length === 0 && (
                            <p className="text-[0.65rem] text-[#aaa] italic">No characters yet. Add one or run analysis.</p>
                          )}
                          {projectChars.map((c) => (
                            <div key={c.id} className="border border-[#ddd] bg-white">
                              {editingCharId === c.id ? (
                                <div className="p-2 space-y-1.5">
                                  <input
                                    autoFocus
                                    value={editCharName}
                                    onChange={(e) => setEditCharName(e.target.value)}
                                    className="manga-input w-full text-xs py-1"
                                  />
                                  <textarea
                                    value={editCharDesc}
                                    onChange={(e) => setEditCharDesc(e.target.value)}
                                    rows={2}
                                    className="manga-input w-full text-xs resize-none"
                                  />
                                  <div className="flex gap-1">
                                    <button onClick={handleConfirmEditChar} className="manga-btn bg-[#111] text-white px-2 py-1 text-xs flex items-center gap-1">
                                      <Check size={10} /> Save
                                    </button>
                                    <button onClick={() => setEditingCharId(null)} className="manga-btn bg-white text-[#888] px-2 py-1 text-xs">
                                      <X size={10} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2 flex items-start justify-between gap-1">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-[#111] truncate">{c.name}</p>
                                    {c.description && <p className="text-[0.6rem] text-[#888] leading-snug mt-0.5 line-clamp-2">{c.description}</p>}
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => handleStartEditChar(c)} className="text-[#aaa] hover:text-[#111] transition-colors">
                                      <Edit2 size={11} />
                                    </button>
                                    <button onClick={() => removeCharacter(c.id)} className="text-[#aaa] hover:text-red-500 transition-colors">
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* AI-detected characters (read-only, from analysis) */}
                          {aiChars.length > 0 && (
                            <>
                              <p className="text-[0.55rem] text-[#aaa] uppercase tracking-wider mt-3 mb-1">AI Detected</p>
                              {aiChars.map((c: any, i: number) => (
                                <div key={i} className="border border-dashed border-[#ddd] bg-[#fafafa] p-2 flex items-start justify-between gap-1">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-[#666] truncate">{c.name}</p>
                                    {(c.description || c.role) && (
                                      <p className="text-[0.6rem] text-[#aaa] leading-snug mt-0.5 line-clamp-2">{c.description || c.role}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => addCharacter({ name: c.name, description: c.description || c.role || '' })}
                                    className="text-[#aaa] hover:text-[#111] transition-colors shrink-0"
                                    title="Add to project"
                                  >
                                    <Plus size={11} />
                                  </button>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* SETTINGS TAB */}
                  {activeTab === 'settings' && (
                    <>
                      <div className="space-y-3">
                        <div>
                          <span className="manga-accent-bar text-[0.6rem]">PROJECT INFO</span>
                          <div className="mt-2 space-y-2">

                            {/* Book Thumbnail */}
                            <div>
                              <label className="text-[0.6rem] text-[#888] uppercase tracking-wider block mb-1">Book Thumbnail</label>
                              <div
                                onClick={() => thumbnailInputRef.current?.click()}
                                className="relative group w-full h-28 border-2 border-dashed border-[#ccc] cursor-pointer hover:border-[#111] transition-colors overflow-hidden"
                              >
                                {editThumbnail ? (
                                  <img src={editThumbnail} alt="thumbnail" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 manga-halftone">
                                    <Upload size={18} className="text-[#aaa]" />
                                    <span className="text-[0.6rem] text-[#aaa]">Click to upload</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <span className="text-white text-[0.6rem] font-medium">Change Image</span>
                                </div>
                              </div>
                              {editThumbnail && (
                                <button
                                  onClick={() => setEditThumbnail('')}
                                  className="text-[0.55rem] text-red-400 hover:text-red-600 mt-0.5"
                                >
                                  Remove thumbnail
                                </button>
                              )}
                              <input
                                ref={thumbnailInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = () => setEditThumbnail(reader.result as string);
                                  reader.readAsDataURL(file);
                                  e.target.value = '';
                                }}
                              />
                            </div>

                            <div>
                              <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Title</label>
                              <input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="manga-input w-full text-xs mt-1 py-1"
                              />
                            </div>
                            <div>
                              <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Description</label>
                              <textarea
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                rows={2}
                                className="manga-input w-full text-xs mt-1 resize-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Original Story Prompt</label>
                          <textarea
                            value={editStoryText}
                            onChange={(e) => setEditStoryText(e.target.value)}
                            rows={5}
                            placeholder="Your story text or prompt..."
                            className="manga-input w-full text-xs mt-1 resize-none"
                          />
                          <p className="text-[0.55rem] text-[#aaa] mt-0.5">Used for regeneration</p>
                        </div>

                        <button
                          onClick={handleSaveSettings}
                          disabled={savingSettings}
                          className="manga-btn w-full bg-white text-[#111] py-1.5 text-xs flex items-center justify-center gap-1"
                        >
                          {savingSettings ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Save Settings
                        </button>
                      </div>

                      <div className="border-t-2 border-[#eee] pt-3 space-y-2">
                        <span className="manga-accent-bar text-[0.6rem]">TRAILER STYLE</span>
                        <div className="grid grid-cols-2 gap-1 mt-2">
                          {STYLES.map((s) => (
                            <button
                              key={s}
                              onClick={() => setSelectedStyle(s)}
                              className={`text-[0.6rem] py-1 px-1.5 border-2 transition-colors capitalize ${
                                selectedStyle === s ? 'border-[#111] bg-[#111] text-white' : 'border-[#ccc] text-[#666] hover:border-[#888]'
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="border-t-2 border-[#eee] pt-3 space-y-2">
                        <span className="manga-accent-bar text-[0.6rem]">REGENERATION</span>
                        <button
                          onClick={handleReplan}
                          disabled={isGenerating}
                          className="manga-btn w-full bg-white text-[#111] py-1.5 text-xs flex items-center justify-center gap-1.5"
                        >
                          {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          Re-plan with {selectedStyle} style
                        </button>
                        <button
                          onClick={handleRegenFromScratch}
                          disabled={isGenerating}
                          className="manga-btn w-full bg-[#111] text-white py-1.5 text-xs flex items-center justify-center gap-1.5"
                        >
                          {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                          Regenerate from Scratch
                        </button>
                        <p className="text-[0.55rem] text-[#aaa] text-center leading-snug">
                          Re-plan keeps analysis. Regen from scratch re-analyzes the story.
                        </p>
                      </div>
                    </>
                  )}

                </div>
              </div>
            )}
          </>
        )}

        {/* Center: React Flow + Timeline Strip */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1">
            <FlowEditor onNodeClick={(clipId) => setSelectedClipId(clipId)} />
          </div>
          <TimelineStrip selectedClipId={selectedClipId} onSelectClip={setSelectedClipId} />
        </div>

        {/* Right: Clip Detail Panel + Chat */}
        <div className={`shrink-0 flex flex-col transition-all duration-200 overflow-hidden ${rightOpen ? 'w-[320px] border-l-2 border-[#ccc]' : 'w-0'}`}>
          {rightOpen && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedClipId && clips.length > 0 ? (
                <ClipDetailPanel clipId={selectedClipId} onClose={() => setSelectedClipId(null)} />
              ) : (
                <ChatPanel projectId={id} onCollapse={() => setRightOpen(false)} />
              )}
            </div>
          )}
        </div>

        {/* Settings modal */}
        {showSettings && (
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 bg-black/30 backdrop-blur-[2px]" onClick={() => setShowSettings(false)}>
            <div className="manga-panel bg-white w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#ccc]">
                <span className="manga-accent-bar text-xs">PROJECT SETTINGS</span>
                <button onClick={() => setShowSettings(false)} className="text-[#888] hover:text-[#111] transition-colors"><X size={14} /></button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[0.6rem] text-[#888] uppercase tracking-wider block mb-1">Book Thumbnail</label>
                  <div onClick={() => thumbnailInputRef.current?.click()} className="relative group w-full h-32 border-2 border-dashed border-[#ccc] cursor-pointer hover:border-[#111] transition-colors overflow-hidden">
                    {editThumbnail ? (
                      <img src={editThumbnail} alt="thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 manga-halftone">
                        <Upload size={20} className="text-[#aaa]" />
                        <span className="text-xs text-[#aaa]">Click to upload</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-medium">Change Image</span>
                    </div>
                  </div>
                  {editThumbnail && <button onClick={() => setEditThumbnail('')} className="text-[0.6rem] text-red-400 hover:text-red-600 mt-0.5">Remove thumbnail</button>}
                  <input ref={thumbnailInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setEditThumbnail(reader.result as string); reader.readAsDataURL(file); e.target.value = ''; }} />
                </div>
                <div>
                  <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Title</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="manga-input w-full text-sm mt-1 py-1.5" />
                </div>
                <div>
                  <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Description</label>
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className="manga-input w-full text-sm mt-1 resize-none" />
                </div>
                <div>
                  <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Original Story Prompt</label>
                  <textarea value={editStoryText} onChange={(e) => setEditStoryText(e.target.value)} rows={4} placeholder="Your story text or prompt..." className="manga-input w-full text-sm mt-1 resize-none" />
                  <p className="text-[0.55rem] text-[#aaa] mt-0.5">Used for regeneration</p>
                </div>
                <button onClick={async () => { await handleSaveSettings(); setShowSettings(false); }} disabled={savingSettings} className="manga-btn w-full bg-[#111] text-white py-2 text-sm flex items-center justify-center gap-1.5">
                  {savingSettings ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Settings
                </button>
                <div className="border-t-2 border-[#eee] pt-3 space-y-2">
                  <span className="manga-accent-bar text-[0.6rem]">TRAILER STYLE</span>
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {STYLES.map((s) => (
                      <button key={s} onClick={() => setSelectedStyle(s)} className={`text-[0.6rem] py-1 px-1 border-2 transition-colors capitalize ${selectedStyle === s ? 'border-[#111] bg-[#111] text-white' : 'border-[#ccc] text-[#666] hover:border-[#888]'}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="border-t-2 border-[#eee] pt-3 space-y-2">
                  <span className="manga-accent-bar text-[0.6rem]">REGENERATION</span>
                  <button onClick={() => { handleReplan(); setShowSettings(false); }} disabled={isGenerating} className="manga-btn w-full bg-white text-[#111] py-1.5 text-sm flex items-center justify-center gap-1.5">
                    {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-plan with {selectedStyle} style
                  </button>
                  <button onClick={() => { handleRegenFromScratch(); setShowSettings(false); }} disabled={isGenerating} className="manga-btn w-full bg-[#111] text-white py-1.5 text-sm flex items-center justify-center gap-1.5">
                    {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Regenerate from Scratch
                  </button>
                  <p className="text-[0.55rem] text-[#aaa] text-center leading-snug">Re-plan keeps analysis. Regen from scratch re-analyzes the story.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Onboarding overlay */}
        {showOnboarding && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/90 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4">
              <div ref={onboardingCardRef} className="manga-panel-accent p-8">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-6">
                  <Sparkles size={28} className="text-[#111]" />
                </div>
                <h2 className="manga-title text-2xl text-center mb-2 text-[#111]">Ready to create your trailer</h2>
                <p className="text-[#888] text-sm text-center mb-8">
                  Our AI will analyze your story and generate a cinematic trailer plan.
                </p>

                {isGenerating && (
                  <div className="mb-6 space-y-3">
                    <StepIndicator icon={<BookOpen size={16} />} label="Analyzing story structure" status={genStep === 'analyzing' ? 'active' : 'done'} />
                    <StepIndicator icon={<Clapperboard size={16} />} label="Planning trailer scenes" status={genStep === 'planning' ? 'active' : genStep === 'analyzing' ? 'pending' : 'done'} />
                  </div>
                )}

                {!isGenerating && genStep !== 'error' && (
                  <div className="mb-6">
                    <label className="text-xs text-[#888] uppercase tracking-wider flex items-center gap-1 mb-2">
                      <Palette size={12} /> Trailer Style
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {STYLES.map((style) => (
                        <button
                          key={style}
                          onClick={() => setSelectedStyle(style)}
                          className={`text-xs py-1.5 px-2 border-2 transition-colors capitalize ${
                            selectedStyle === style ? 'border-[#111] bg-[#111] text-white' : 'border-[#ccc] bg-white text-[#666] hover:border-[#888]'
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
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
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating}
                  className="manga-btn w-full bg-[#111] text-white py-3 text-lg flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <><Loader2 size={18} className="animate-spin" />{genStep === 'analyzing' ? 'Analyzing...' : 'Planning scenes...'}</>
                  ) : genStep === 'error' ? 'Try Again'
                  : currentProject?.analysis?.key_scenes ? <><Clapperboard size={18} />Plan Trailer</>
                  : <><Sparkles size={18} />Generate Trailer</>}
                </button>

                {currentProject?.analysis?.key_scenes && genStep === 'idle' && (
                  <p className="text-xs text-[#555] text-center mt-3">Story already analyzed — will skip to planning</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* No story state */}
        {!loading && !error && clips.length === 0 && !hasBook && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/90 backdrop-blur-sm">
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

        {/* Suggestions modal */}
        {suggestions !== null && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setSuggestions(null)}>
            <div className="manga-panel p-6 max-w-lg w-full mx-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="manga-title text-lg text-[#111] flex items-center gap-2"><Lightbulb size={18} /> AI Suggestions</h3>
                <button onClick={() => setSuggestions(null)} className="text-[#888] hover:text-[#111]">&times;</button>
              </div>
              {suggestions.length === 0 ? (
                <p className="text-[#888] text-sm">No suggestions available. Your timeline looks good!</p>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((s: any, i: number) => (
                    <div key={i} className="p-3 bg-[#f5f5f5] border-2 border-[#ccc]">
                      <p className="text-sm text-[#111] font-medium">{s.title || s.suggestion || `Suggestion ${i + 1}`}</p>
                      {s.description && <p className="text-xs text-[#666] mt-1">{s.description}</p>}
                      {s.reason && <p className="text-xs text-[#888] mt-1 italic">{s.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function StepIndicator({ icon, label, status }: { icon: React.ReactNode; label: string; status: 'pending' | 'active' | 'done' }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${status === 'active' ? 'step-indicator-active' : ''} ${
      status === 'active' ? 'bg-[#111]/10 border-2 border-[#111]/30'
      : status === 'done' ? 'bg-emerald-500/10 border-2 border-emerald-500/30'
      : 'bg-white border-2 border-[#ccc]'
    }`}>
      <div className={`shrink-0 ${status === 'active' ? 'text-[#111]' : status === 'done' ? 'text-emerald-400' : 'text-[#555]'}`}>
        {status === 'active' ? <Loader2 size={16} className="animate-spin" /> : icon}
      </div>
      <span className={`text-sm ${status === 'active' ? 'text-[#555]' : status === 'done' ? 'text-emerald-300' : 'text-[#555]'}`}>
        {label}{status === 'done' && <span className="ml-1.5 text-emerald-400">done</span>}
      </span>
    </div>
  );
}
