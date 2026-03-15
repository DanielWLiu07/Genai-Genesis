'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTimelineStore, type Clip } from '@/stores/timeline-store';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { X, Sparkles, RefreshCw, Clock, Type, ArrowRightLeft, Trash2, Upload, Film, ImageIcon, Play, Maximize2 } from 'lucide-react';
import gsap from 'gsap';

interface ClipDetailPanelProps {
  clipId: string;
  onClose: () => void;
}

export function ClipDetailPanel({ clipId, onClose }: ClipDetailPanelProps) {
  const clip = useTimelineStore((s) => s.clips.find((c) => c.id === clipId));
  const clips = useTimelineStore((s) => s.clips);
  const updateClip = useTimelineStore((s) => s.updateClip);
  const removeClip = useTimelineStore((s) => s.removeClip);
  const currentProject = useProjectStore((s) => s.currentProject);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState(clip?.prompt || '');
  const [feedback, setFeedback] = useState('');
  const [durationMs, setDurationMs] = useState(clip?.duration_ms || 3000);
  const [text, setText] = useState(clip?.text || '');
  const [transition, setTransition] = useState<string>(clip?.transition_type || 'fade');
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);

  const videoUrl = clip?.generated_media_url;
  const hasVideo = !!(videoUrl && (clip?.type === 'video' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(videoUrl)));
  const hasImage = !!clip?.thumbnail_url;
  const showTabs = hasVideo && hasImage;

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
      setTransition(clip.transition_type || 'fade');
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
    });
  }, [clipId, prompt, durationMs, text, transition, updateClip]);

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
      updateClip(clipId, {
        gen_status: 'done',
        generated_media_url: dataUrl,
        thumbnail_url: dataUrl,
      });
    };
    reader.readAsDataURL(file);
    // reset so the same file can be re-selected
    e.target.value = '';
  }, [clipId, updateClip]);

  const handleGenerateVideo = useCallback(async () => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId || !clip) return;
    setGeneratingVideo(true);
    updateClip(clipId, { gen_status: 'generating' });

    const analysis = currentProject?.analysis;
    const characters = (analysis?.characters as any[] || []).map((c: any) => ({
      name: c.name,
      description: c.description,
      visual_description: c.visual_description,
      appearance: c.appearance,
      image_url: c.image_url || c.reference_image_url,
    }));
    const sortedClips = [...clips].sort((a, b) => a.order - b.order);
    const clipOrder = sortedClips.findIndex((c) => c.id === clipId);
    const prevClip = clipOrder > 0 ? sortedClips[clipOrder - 1] : null;
    const nextClip = clipOrder < sortedClips.length - 1 ? sortedClips[clipOrder + 1] : null;
    const isContinuous = (clip as any).shot_type === 'continuous';
    const startFrame = clip.thumbnail_url && !clip.thumbnail_url.startsWith('data:') ? clip.thumbnail_url : undefined;

    try {
      const result: any = await api.generateClip(projectId, clipId, clip.prompt, 'video', {
        clip_order: clipOrder,
        clip_total: sortedClips.length,
        scene_image_url: startFrame,
        characters: characters.length > 0 ? characters : undefined,
        mood: analysis?.mood,
        genre: analysis?.genre,
        themes: (analysis?.themes as string[] | undefined),
        shot_type: (clip as any).shot_type || 'cut',
        is_continuous: isContinuous,
        prev_scene_prompt: prevClip?.prompt,
        next_scene_prompt: nextClip?.prompt,
        feedback: feedback.trim() || undefined,
      });
      if (result.media_url) {
        updateClip(clipId, { gen_status: 'done', type: 'video' as any, generated_media_url: result.media_url, thumbnail_url: result.thumbnail_url || clip.thumbnail_url });
        setActiveTab('video');
      }
    } catch (err) {
      updateClip(clipId, { gen_status: 'error', gen_error: String(err) });
    } finally {
      setGeneratingVideo(false);
    }
  }, [clipId, clip, clips, currentProject, updateClip]);

  if (!clip) return null;

  const statusLabel: Record<string, string> = {
    pending: 'Pending',
    generating: 'Generating...',
    done: 'Generated',
    error: 'Error',
  };
  const statusColor: Record<string, string> = {
    pending: 'text-yellow-600',
    generating: 'text-blue-600',
    done: 'text-green-600',
    error: 'text-red-600',
  };

  return (
    <div ref={panelRef} className="w-full h-full bg-white overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-3 border-b-2 border-[#ccc] flex items-center justify-between">
        <span className="manga-accent-bar text-xs">CLIP DETAILS</span>
        <button onClick={handleClose} className="text-[#888] hover:text-[#111] transition-colors flex items-center gap-1 text-xs">
          <X size={12} /> Chat
        </button>
      </div>

      <div className="p-3 space-y-4 flex-1">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#888] uppercase tracking-wider font-bold" style={{ fontFamily: 'var(--font-manga)' }}>
            {clip.type}
          </span>
          <span className={`text-xs font-medium ${statusColor[clip.gen_status]}`}>
            {statusLabel[clip.gen_status]}
          </span>
        </div>

        {/* Preview + upload */}
        <div>
          {/* Tabs */}
          {showTabs && (
            <div className="flex border-b-2 border-[#ccc] mb-0">
              <button
                onClick={() => setActiveTab('image')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'image' ? 'bg-[#111] text-white' : 'text-[#888] hover:text-[#111]'}`}
                style={{ fontFamily: 'var(--font-manga)' }}
              >
                <ImageIcon size={11} /> IMAGE
              </button>
              <button
                onClick={() => setActiveTab('video')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'video' ? 'bg-blue-600 text-white' : 'text-[#888] hover:text-[#111]'}`}
                style={{ fontFamily: 'var(--font-manga)' }}
              >
                <Film size={11} /> VIDEO
              </button>
            </div>
          )}

          <div className="relative group">
            {(hasVideo && !hasImage) || (showTabs && activeTab === 'video') ? (
              <video
                key={videoUrl}
                src={videoUrl!}
                className="w-full h-48 object-cover border-2 border-[#ccc] bg-black"
                controls
                autoPlay
                preload="metadata"
                poster={clip.thumbnail_url}
              />
            ) : clip.thumbnail_url || clip.generated_media_url ? (
              <img
                src={clip.thumbnail_url || clip.generated_media_url}
                alt=""
                className="w-full h-48 object-cover border-2 border-[#ccc]"
              />
            ) : (
              <div className="w-full h-48 bg-[#eee] border-2 border-[#ccc] flex items-center justify-center manga-halftone">
                <span className="text-[#888] text-xs">No preview</span>
              </div>
            )}

            {/* Upload overlay — image tab only */}
            {(!showTabs || activeTab === 'image') && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <Upload size={20} className="text-white" />
                <span className="text-white text-xs font-medium">Upload Image</span>
              </button>
            )}
            {/* Fullscreen button — video tab */}
            {hasVideo && ((showTabs && activeTab === 'video') || !hasImage) ? (
              <button
                onClick={() => setShowVideoModal(true)}
                className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/90 text-white transition-colors opacity-0 group-hover:opacity-100"
                title="Watch fullscreen"
              >
                <Maximize2 size={13} />
              </button>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
          </div>
        </div>

        {/* Prompt */}
        <div>
          <label className="text-xs text-[#888] uppercase tracking-wider flex items-center gap-1 mb-1">
            <Sparkles size={12} /> Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={handleSave}
            rows={4}
            className="manga-input w-full text-xs resize-none"
          />
        </div>

        {/* Feedback / Refinement — hidden for manga panels */}
        {!(clip as any).manga_panel && (
          <div>
            <label className="text-xs text-[#888] uppercase tracking-wider flex items-center gap-1 mb-1">
              <Sparkles size={12} /> Feedback
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={2}
              placeholder="e.g. make it darker, add rain..."
              className="manga-input w-full text-xs resize-none"
            />
          </div>
        )}

        {/* Duration */}
        <div>
          <label className="text-xs text-[#888] uppercase tracking-wider flex items-center gap-1 mb-1">
            <Clock size={12} /> Duration
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1000}
              max={10000}
              step={500}
              value={durationMs}
              onChange={(e) => setDurationMs(Number(e.target.value))}
              onMouseUp={handleSave}
              className="flex-1 accent-[#111]"
            />
            <span className="text-xs text-[#111] font-mono w-10 text-right">{(durationMs / 1000).toFixed(1)}s</span>
          </div>
        </div>

        {/* Text Overlay */}
        <div>
          <label className="text-xs text-[#888] uppercase tracking-wider flex items-center gap-1 mb-1">
            <Type size={12} /> Text Overlay
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
          <label className="text-xs text-[#888] uppercase tracking-wider flex items-center gap-1 mb-1">
            <ArrowRightLeft size={12} /> Transition
          </label>
          <select
            value={transition}
            onChange={(e) => { setTransition(e.target.value); setTimeout(handleSave, 0); }}
            className="manga-input w-full text-xs"
          >
            <option value="fade">Fade</option>
            <option value="dissolve">Dissolve</option>
            <option value="wipe">Wipe</option>
            <option value="cut">Cut</option>
          </select>
        </div>

        {/* Error message */}
        {clip.gen_status === 'error' && clip.gen_error && (
          <div className="p-2 bg-red-50 border border-red-200 text-xs text-red-600">
            {clip.gen_error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 border-t-2 border-[#ccc] space-y-2">
        {/* Watch video button — prominent when video exists */}
        {hasVideo && (
          <button
            onClick={() => setShowVideoModal(true)}
            className="manga-btn w-full bg-blue-600 text-white border-blue-700 py-2 text-sm flex items-center justify-center gap-2 hover:bg-blue-700"
          >
            <Play size={14} /> Watch Video
          </button>
        )}
        {!(clip as any).manga_panel && (
          <div className="flex gap-2">
            <button
              onClick={handleRegenerate}
              disabled={clip.gen_status === 'generating'}
              className="manga-btn flex-1 bg-[#111] text-white py-2 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={13} />
              {clip.gen_status === 'pending' ? 'Gen Image' : 'Regen Image'}
            </button>
            {clip.type !== 'transition' && (
              <button
                onClick={handleGenerateVideo}
                disabled={clip.gen_status === 'generating' || generatingVideo}
                className="manga-btn flex-1 bg-[#111] text-white py-2 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Film size={13} />
                {generatingVideo ? 'Generating...' : 'Gen Video'}
              </button>
            )}
          </div>
        )}
        <button
          onClick={handleDelete}
          className="manga-btn w-full bg-white text-red-600 border-red-300 py-2 text-sm flex items-center justify-center gap-2 hover:bg-red-50"
        >
          <Trash2 size={14} /> Delete Clip
        </button>
      </div>

      {/* Fullscreen video modal */}
      {showVideoModal && videoUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center"
          onClick={() => setShowVideoModal(false)}
        >
          <button
            onClick={() => setShowVideoModal(false)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
          >
            <X size={28} />
          </button>
          <p className="text-[#888] text-xs uppercase tracking-widest mb-3" style={{ fontFamily: 'var(--font-manga)' }}>
            Scene {clips.sort((a, b) => a.order - b.order).findIndex((c) => c.id === clipId) + 1}
          </p>
          <video
            src={videoUrl}
            className="max-w-4xl w-full max-h-[80vh] bg-black"
            controls
            autoPlay
            poster={clip.thumbnail_url}
            onClick={(e) => e.stopPropagation()}
          />
          <p className="text-white/60 text-xs mt-3 max-w-2xl text-center leading-relaxed">{clip.prompt}</p>
        </div>
      )}
    </div>
  );
}
