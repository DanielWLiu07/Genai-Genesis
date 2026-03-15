'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTimelineStore, type Clip } from '@/stores/timeline-store';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import {
  X, Sparkles, RefreshCw, Clock, Type, ArrowRightLeft, Trash2, Upload,
  Film, ImageIcon, Play, Maximize2, ChevronUp, ChevronDown, Scissors, Zap,
} from 'lucide-react';
import gsap from 'gsap';

interface ClipDetailPanelProps {
  clipId: string;
  onClose: () => void;
}

const GROUP_COLORS = [
  '#a855f7', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

export function ClipDetailPanel({ clipId, onClose }: ClipDetailPanelProps) {
  const clip = useTimelineStore((s) => s.clips.find((c) => c.id === clipId));
  const clips = useTimelineStore((s) => s.clips);
  const updateClip = useTimelineStore((s) => s.updateClip);
  const removeClip = useTimelineStore((s) => s.removeClip);
  const reorderClips = useTimelineStore((s) => s.reorderClips);
  const currentProject = useProjectStore((s) => s.currentProject);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'details' | 'regen'>('details');
  const [mediaTab, setMediaTab] = useState<'image' | 'video'>('image');
  const [prompt, setPrompt] = useState(clip?.prompt || '');
  const [feedback, setFeedback] = useState('');
  const [durationMs, setDurationMs] = useState(clip?.duration_ms || 3000);
  const [text, setText] = useState(clip?.text || '');
  const [transition, setTransition] = useState<string>(clip?.transition_type || 'cut');
  const [shotType, setShotType] = useState<string>((clip as any)?.shot_type || 'cut');
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);

  const sortedClips = useMemo(() => [...clips].sort((a, b) => a.order - b.order), [clips]);
  const sceneIdx = useMemo(() => sortedClips.findIndex((c) => c.id === clipId), [sortedClips, clipId]);
  const sceneNum = String(sceneIdx + 1).padStart(2, '0');
  const sceneGroup = (clip as any)?.scene_group ?? clip?.order ?? 0;
  const groupColor = GROUP_COLORS[sceneGroup % GROUP_COLORS.length];

  const videoUrl = clip?.generated_media_url;
  const hasVideo = !!(videoUrl && (clip?.type === 'video' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(videoUrl)));
  const hasImage = !!clip?.thumbnail_url;
  const showMediaTabs = hasVideo && hasImage;

  // Slide in on mount
  useEffect(() => {
    if (panelRef.current) {
      gsap.fromTo(panelRef.current,
        { x: 300, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }
      );
    }
  }, []);

  // Sync local state when clip changes externally
  useEffect(() => {
    if (clip) {
      setPrompt(clip.prompt);
      setDurationMs(clip.duration_ms);
      setText(clip.text || '');
      setTransition(clip.transition_type || 'cut');
      setShotType((clip as any).shot_type || 'cut');
    }
  }, [clip]);

  const handleClose = useCallback(() => {
    if (panelRef.current) {
      gsap.to(panelRef.current, {
        x: 300, opacity: 0, duration: 0.2, ease: 'power2.in',
        onComplete: onClose,
      });
    } else {
      onClose();
    }
  }, [onClose]);

  const handleSave = useCallback(() => {
    updateClip(clipId, {
      prompt,
      duration_ms: durationMs,
      text: text || undefined,
      transition_type: transition as Clip['transition_type'],
      shot_type: shotType as 'cut' | 'continuous',
    });
  }, [clipId, prompt, durationMs, text, transition, shotType, updateClip]);

  const handleShotTypeChange = useCallback((newType: string) => {
    setShotType(newType);
    updateClip(clipId, { shot_type: newType as 'cut' | 'continuous' });
  }, [clipId, updateClip]);

  const handleMoveUp = useCallback(() => {
    if (sceneIdx <= 0) return;
    const ids = sortedClips.map((c) => c.id);
    [ids[sceneIdx], ids[sceneIdx - 1]] = [ids[sceneIdx - 1], ids[sceneIdx]];
    reorderClips(ids);
  }, [sceneIdx, sortedClips, reorderClips]);

  const handleMoveDown = useCallback(() => {
    if (sceneIdx >= sortedClips.length - 1) return;
    const ids = sortedClips.map((c) => c.id);
    [ids[sceneIdx], ids[sceneIdx + 1]] = [ids[sceneIdx + 1], ids[sceneIdx]];
    reorderClips(ids);
  }, [sceneIdx, sortedClips, reorderClips]);

  const handleRegenerate = useCallback(async () => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId) return;
    handleSave();
    updateClip(clipId, { gen_status: 'generating' });
    const combinedPrompt = feedback.trim()
      ? `${prompt}\n\nRefinement: ${feedback.trim()}`
      : prompt;
    try {
      const result: any = await api.generateClip(projectId, clipId, combinedPrompt, clip?.type || 'image');
      updateClip(clipId, {
        gen_status: 'done',
        generated_media_url: result.media_url,
        thumbnail_url: result.thumbnail_url,
      });
      setFeedback('');
    } catch (err) {
      updateClip(clipId, { gen_status: 'error', gen_error: String(err) });
    }
  }, [clipId, prompt, feedback, clip?.type, updateClip, handleSave]);

  const handleDelete = useCallback(() => {
    removeClip(clipId);
    onClose();
  }, [clipId, removeClip, onClose]);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updateClip(clipId, { gen_status: 'done', generated_media_url: dataUrl, thumbnail_url: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [clipId, updateClip]);

  const handleGenerateVideo = useCallback(async () => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId || !clip) return;
    setGeneratingVideo(true);
    updateClip(clipId, { gen_status: 'generating' });

    const analysis = currentProject?.analysis;
    const characters = (analysis?.characters as any[] || []).map((c: any) => ({
      name: c.name, description: c.description,
      visual_description: c.visual_description, appearance: c.appearance,
      image_url: c.image_url || c.reference_image_url,
    }));
    const clipOrder = sceneIdx;
    const prevClip = clipOrder > 0 ? sortedClips[clipOrder - 1] : null;
    const nextClip = clipOrder < sortedClips.length - 1 ? sortedClips[clipOrder + 1] : null;
    const isContinuous = (clip as any).shot_type === 'continuous';
    const startFrame = clip.thumbnail_url && !clip.thumbnail_url.startsWith('data:') ? clip.thumbnail_url : undefined;

    try {
      const result: any = await api.generateClip(projectId, clipId, clip.prompt, 'video', {
        clip_order: clipOrder, clip_total: sortedClips.length,
        scene_image_url: startFrame,
        characters: characters.length > 0 ? characters : undefined,
        mood: analysis?.mood, genre: analysis?.genre,
        themes: (analysis?.themes as string[] | undefined),
        shot_type: (clip as any).shot_type || 'cut',
        is_continuous: isContinuous,
        prev_scene_prompt: prevClip?.prompt, next_scene_prompt: nextClip?.prompt,
        feedback: feedback.trim() || undefined,
      });
      if (result.media_url) {
        updateClip(clipId, { gen_status: 'done', type: 'video' as any, generated_media_url: result.media_url, thumbnail_url: result.thumbnail_url || clip.thumbnail_url });
        setMediaTab('video');
      }
    } catch (err) {
      updateClip(clipId, { gen_status: 'error', gen_error: String(err) });
    } finally {
      setGeneratingVideo(false);
    }
  }, [clipId, clip, clips, sceneIdx, sortedClips, currentProject, updateClip, feedback]);

  if (!clip) return null;

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pending:    { label: 'Pending',      color: '#d97706', bg: '#fef3c7' },
    generating: { label: 'Generating…', color: '#2563eb', bg: '#dbeafe' },
    done:       { label: 'Generated',   color: '#059669', bg: '#d1fae5' },
    error:      { label: 'Error',       color: '#dc2626', bg: '#fee2e2' },
  };
  const status = statusConfig[clip.gen_status] || statusConfig.pending;

  return (
    <div ref={panelRef} className="w-full h-full bg-white overflow-y-auto flex flex-col">

      {/* Colored top accent bar */}
      <div style={{ height: 3, background: groupColor }} />

      {/* Header */}
      <div className="px-3 py-2.5 border-b-2 border-[#eee] flex items-center gap-2 bg-white shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="text-sm font-black text-[#111] tracking-wider"
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              SCENE {sceneNum}
            </span>
            {/* scene group dot */}
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: groupColor }} title={`Group ${sceneGroup}`} />
            <span
              className="text-[0.55rem] px-1.5 py-0.5 font-bold border"
              style={{ color: status.color, background: status.bg, borderColor: `${status.color}40`, fontFamily: 'var(--font-manga)' }}
            >
              {status.label}
            </span>
          </div>
          <p className="text-[0.55rem] text-[#bbb] mt-0.5 truncate" style={{ fontFamily: 'var(--font-manga)' }}>
            {clip.type.toUpperCase()} · {(clip.duration_ms / 1000).toFixed(1)}s
          </p>
        </div>

        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={handleMoveUp}
            disabled={sceneIdx <= 0}
            className="w-6 h-5 flex items-center justify-center bg-[#f5f5f5] border border-[#e0e0e0] hover:bg-[#eee] disabled:opacity-30 transition-colors"
            title="Move up"
          >
            <ChevronUp size={11} />
          </button>
          <button
            onClick={handleMoveDown}
            disabled={sceneIdx >= sortedClips.length - 1}
            className="w-6 h-5 flex items-center justify-center bg-[#f5f5f5] border border-[#e0e0e0] hover:bg-[#eee] disabled:opacity-30 transition-colors"
            title="Move down"
          >
            <ChevronDown size={11} />
          </button>
        </div>

        <button
          onClick={handleClose}
          className="w-7 h-7 flex items-center justify-center text-[#aaa] hover:text-[#111] hover:bg-[#f0f0f0] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Panel tabs */}
      <div className="flex border-b-2 border-[#eee] shrink-0">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[0.62rem] font-black tracking-wider transition-colors ${
            activeTab === 'details' ? 'bg-[#111] text-white' : 'text-[#888] hover:bg-[#f5f5f5]'
          }`}
          style={{ fontFamily: 'var(--font-manga)' }}
        >
          <Scissors size={10} /> SCENE
        </button>
        <button
          onClick={() => setActiveTab('regen')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[0.62rem] font-black tracking-wider transition-colors ${
            activeTab === 'regen' ? 'bg-[#a855f7] text-white' : 'text-[#888] hover:bg-[#f5f5f5]'
          }`}
          style={{ fontFamily: 'var(--font-manga)' }}
        >
          <Sparkles size={10} /> GENERATE
        </button>
      </div>

      {/* Media preview */}
      <div className="relative group shrink-0">
        {/* Media tab switcher */}
        {showMediaTabs && (
          <div className="absolute top-2 left-2 z-10 flex gap-1">
            <button
              onClick={() => setMediaTab('image')}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5rem] font-bold transition-all ${mediaTab === 'image' ? 'bg-[#111] text-white' : 'bg-white/80 text-[#555]'}`}
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              <ImageIcon size={8} /> IMG
            </button>
            <button
              onClick={() => setMediaTab('video')}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5rem] font-bold transition-all ${mediaTab === 'video' ? 'bg-blue-600 text-white' : 'bg-white/80 text-[#555]'}`}
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              <Film size={8} /> VID
            </button>
          </div>
        )}

        {(hasVideo && !hasImage) || (showMediaTabs && mediaTab === 'video') ? (
          <video
            key={videoUrl}
            src={videoUrl!}
            className="w-full object-cover bg-black"
            style={{ height: 180 }}
            controls autoPlay preload="metadata"
            poster={clip.thumbnail_url}
          />
        ) : clip.thumbnail_url || clip.generated_media_url ? (
          <img
            src={clip.thumbnail_url || clip.generated_media_url}
            alt=""
            className="w-full object-cover"
            style={{ height: 180 }}
          />
        ) : (
          <div className="w-full flex items-center justify-center bg-[#f5f5f5] manga-halftone" style={{ height: 180 }}>
            <div className="text-center">
              <ImageIcon size={24} className="text-[#ccc] mx-auto mb-1" />
              <span className="text-[0.6rem] text-[#bbb]" style={{ fontFamily: 'var(--font-manga)' }}>NO PREVIEW</span>
            </div>
          </div>
        )}

        {/* Upload overlay */}
        {(!showMediaTabs || mediaTab === 'image') && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-white/15 border border-white/30 flex items-center justify-center">
              <Upload size={16} className="text-white" />
            </div>
            <span className="text-white text-[0.6rem] font-bold" style={{ fontFamily: 'var(--font-manga)' }}>UPLOAD IMAGE</span>
          </button>
        )}

        {/* Fullscreen button */}
        {hasVideo && ((showMediaTabs && mediaTab === 'video') || !hasImage) && (
          <button
            onClick={() => setShowVideoModal(true)}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/90 text-white transition-colors opacity-0 group-hover:opacity-100"
          >
            <Maximize2 size={12} />
          </button>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── DETAILS TAB ── */}
        {activeTab === 'details' && (
          <div className="p-3 space-y-3.5">

            {/* Shot Type */}
            <div>
              <label className="text-[0.6rem] text-[#888] uppercase tracking-widest flex items-center gap-1 mb-1.5" style={{ fontFamily: 'var(--font-manga)' }}>
                <Scissors size={10} /> Shot Type
              </label>
              <div className="flex gap-1">
                {[
                  { val: 'cut', label: '✂ CUT', desc: 'New scene' },
                  { val: 'continuous', label: '∿ CONT', desc: 'Same scene flows' },
                ].map(({ val, label, desc }) => (
                  <button
                    key={val}
                    onClick={() => handleShotTypeChange(val)}
                    className={`flex-1 py-2 text-[0.58rem] font-black border-2 transition-all ${
                      shotType === val
                        ? val === 'cut'
                          ? 'bg-[#111] text-white border-[#111]'
                          : 'bg-emerald-500 text-white border-emerald-600'
                        : 'bg-white text-[#888] border-[#ddd] hover:border-[#bbb]'
                    }`}
                    style={{ fontFamily: 'var(--font-manga)' }}
                    title={desc}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div>
              <label className="text-[0.6rem] text-[#888] uppercase tracking-widest flex items-center gap-1 mb-1.5" style={{ fontFamily: 'var(--font-manga)' }}>
                <Sparkles size={10} /> Scene Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={handleSave}
                rows={4}
                className="manga-input w-full text-xs resize-none"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="text-[0.6rem] text-[#888] uppercase tracking-widest flex items-center gap-1 mb-1.5" style={{ fontFamily: 'var(--font-manga)' }}>
                <Clock size={10} /> Duration
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={500} max={10000} step={250}
                  value={durationMs}
                  onChange={(e) => setDurationMs(Number(e.target.value))}
                  onMouseUp={handleSave}
                  className="flex-1 accent-[#111]"
                />
                <span className="text-xs text-[#111] font-mono w-12 text-right font-bold">{(durationMs / 1000).toFixed(2)}s</span>
              </div>
            </div>

            {/* Text Overlay */}
            <div>
              <label className="text-[0.6rem] text-[#888] uppercase tracking-widest flex items-center gap-1 mb-1.5" style={{ fontFamily: 'var(--font-manga)' }}>
                <Type size={10} /> Text Overlay
              </label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={handleSave}
                placeholder="Optional overlay text..."
                className="manga-input w-full text-xs"
              />
            </div>

            {/* Transition */}
            <div>
              <label className="text-[0.6rem] text-[#888] uppercase tracking-widest flex items-center gap-1 mb-1.5" style={{ fontFamily: 'var(--font-manga)' }}>
                <ArrowRightLeft size={10} /> Transition
              </label>
              <div className="grid grid-cols-4 gap-1">
                {['cut', 'fade', 'dissolve', 'wipe'].map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTransition(t); setTimeout(handleSave, 0); }}
                    className={`py-1.5 text-[0.55rem] font-black border transition-all ${
                      transition === t ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-[#888] border-[#ddd] hover:border-[#bbb]'
                    }`}
                    style={{ fontFamily: 'var(--font-manga)' }}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Error message */}
            {clip.gen_status === 'error' && clip.gen_error && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-[0.65rem] text-red-600 leading-relaxed">
                {clip.gen_error}
              </div>
            )}
          </div>
        )}

        {/* ── GENERATE TAB ── */}
        {activeTab === 'regen' && (
          <div className="p-3 space-y-3.5">
            {/* Feedback / refinement */}
            {!(clip as any).manga_panel && (
              <div>
                <label className="text-[0.6rem] text-[#888] uppercase tracking-widest flex items-center gap-1 mb-1.5" style={{ fontFamily: 'var(--font-manga)' }}>
                  <Zap size={10} /> Refinement Notes
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="e.g. make it darker, add rain, more dramatic lighting..."
                  className="manga-input w-full text-xs resize-none"
                />
                <p className="text-[0.55rem] text-[#bbb] mt-1">These notes will be appended to the prompt for this regeneration only.</p>
              </div>
            )}

            {/* Current prompt display */}
            <div>
              <label className="text-[0.6rem] text-[#888] uppercase tracking-widest flex items-center gap-1 mb-1.5" style={{ fontFamily: 'var(--font-manga)' }}>
                <Sparkles size={10} /> Active Prompt
              </label>
              <div className="p-2 bg-[#f8f8f8] border border-[#eee] text-[0.6rem] text-[#555] leading-relaxed line-clamp-5">
                {prompt || <span className="text-[#ccc] italic">No prompt set</span>}
              </div>
            </div>

            {/* Generation buttons */}
            {!(clip as any).manga_panel && (
              <div className="space-y-2">
                <button
                  onClick={handleRegenerate}
                  disabled={clip.gen_status === 'generating'}
                  className="w-full py-2.5 text-sm font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                  style={{
                    background: '#111', color: '#fff',
                    border: '2px solid #111', boxShadow: '3px 3px 0px #555',
                    fontFamily: 'var(--font-manga)',
                  }}
                >
                  <RefreshCw size={13} />
                  {clip.gen_status === 'pending' ? 'GEN IMAGE' : 'REGEN IMAGE'}
                </button>

                {clip.type !== 'transition' && (
                  <button
                    onClick={handleGenerateVideo}
                    disabled={clip.gen_status === 'generating' || generatingVideo}
                    className="w-full py-2.5 text-sm font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                    style={{
                      background: '#1d4ed8', color: '#fff',
                      border: '2px solid #1d4ed8', boxShadow: '3px 3px 0px #1e3a8a',
                      fontFamily: 'var(--font-manga)',
                    }}
                  >
                    <Film size={13} />
                    {generatingVideo ? 'GENERATING…' : 'GEN VIDEO'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-3 border-t-2 border-[#eee] space-y-2 shrink-0">
        {hasVideo && (
          <button
            onClick={() => setShowVideoModal(true)}
            className="w-full py-2 text-sm font-black flex items-center justify-center gap-2 transition-all"
            style={{
              background: '#2563eb', color: '#fff',
              border: '2px solid #2563eb', boxShadow: '3px 3px 0px #1e40af',
              fontFamily: 'var(--font-manga)',
            }}
          >
            <Play size={13} /> WATCH VIDEO
          </button>
        )}
        <button
          onClick={handleDelete}
          className="w-full py-2 text-sm font-black flex items-center justify-center gap-2 transition-all hover:bg-red-50"
          style={{
            background: '#fff', color: '#dc2626',
            border: '2px solid #fca5a5', boxShadow: '3px 3px 0px #fee2e2',
            fontFamily: 'var(--font-manga)',
          }}
        >
          <Trash2 size={13} /> DELETE CLIP
        </button>
      </div>

      {/* Fullscreen video modal */}
      {showVideoModal && videoUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/92 flex flex-col items-center justify-center backdrop-blur-sm"
          onClick={() => setShowVideoModal(false)}
        >
          <button
            onClick={() => setShowVideoModal(false)}
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
          >
            <X size={28} />
          </button>
          <p className="text-[#666] text-[0.6rem] uppercase tracking-[0.3em] mb-3" style={{ fontFamily: 'var(--font-manga)' }}>
            SCENE {sceneNum}
          </p>
          <video
            src={videoUrl}
            className="max-w-4xl w-full max-h-[80vh] bg-black"
            controls autoPlay poster={clip.thumbnail_url}
            onClick={(e) => e.stopPropagation()}
          />
          <p className="text-white/40 text-[0.65rem] mt-3 max-w-2xl text-center leading-relaxed px-4">{clip.prompt}</p>
        </div>
      )}
    </div>
  );
}
