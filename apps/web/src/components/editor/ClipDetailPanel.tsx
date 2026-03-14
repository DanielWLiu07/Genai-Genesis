'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTimelineStore, type Clip } from '@/stores/timeline-store';
import { api } from '@/lib/api';
import { X, Sparkles, RefreshCw, Clock, Type, ArrowRightLeft, Trash2 } from 'lucide-react';
import gsap from 'gsap';

interface ClipDetailPanelProps {
  clipId: string;
  onClose: () => void;
}

export function ClipDetailPanel({ clipId, onClose }: ClipDetailPanelProps) {
  const clip = useTimelineStore((s) => s.clips.find((c) => c.id === clipId));
  const updateClip = useTimelineStore((s) => s.updateClip);
  const removeClip = useTimelineStore((s) => s.removeClip);
  const panelRef = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState(clip?.prompt || '');
  const [durationMs, setDurationMs] = useState(clip?.duration_ms || 3000);
  const [text, setText] = useState(clip?.text || '');
  const [transition, setTransition] = useState(clip?.transition_type || 'fade');

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
    try {
      const result: any = await api.generateClip(projectId, clipId, prompt, clip?.type || 'image');
      updateClip(clipId, {
        gen_status: 'done',
        generated_media_url: result.media_url,
        thumbnail_url: result.thumbnail_url,
      });
    } catch (err) {
      updateClip(clipId, { gen_status: 'error', gen_error: String(err) });
    }
  }, [clipId, prompt, clip?.type, updateClip, handleSave]);

  const handleDelete = useCallback(() => {
    removeClip(clipId);
    onClose();
  }, [clipId, removeClip, onClose]);

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
    <div ref={panelRef} className="w-[300px] shrink-0 border-l-2 border-[#ccc] bg-white overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-3 border-b-2 border-[#ccc] flex items-center justify-between">
        <span className="manga-accent-bar text-xs">Clip Details</span>
        <button onClick={handleClose} className="text-[#888] hover:text-[#111] transition-colors">
          <X size={16} />
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

        {/* Preview */}
        {clip.thumbnail_url || clip.generated_media_url ? (
          <img src={clip.thumbnail_url || clip.generated_media_url} alt="" className="w-full h-32 object-cover border-2 border-[#ccc]" />
        ) : (
          <div className="w-full h-32 bg-[#eee] border-2 border-[#ccc] flex items-center justify-center manga-halftone">
            <span className="text-[#888] text-xs">No preview</span>
          </div>
        )}

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
        <button
          onClick={handleRegenerate}
          disabled={clip.gen_status === 'generating'}
          className="manga-btn w-full bg-[#111] text-white py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} />
          {clip.gen_status === 'pending' ? 'Generate' : 'Regenerate'}
        </button>
        <button
          onClick={handleDelete}
          className="manga-btn w-full bg-white text-red-600 border-red-300 py-2 text-sm flex items-center justify-center gap-2 hover:bg-red-50"
        >
          <Trash2 size={14} /> Delete Clip
        </button>
      </div>
    </div>
  );
}
