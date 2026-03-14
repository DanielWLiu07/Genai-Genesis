'use client';

import { memo, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Clip } from '@/stores/timeline-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { api } from '@/lib/api';
import { Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import gsap from 'gsap';

function SceneNodeInner({ data }: NodeProps) {
  const clip = data.clip as Clip;
  const updateClip = useTimelineStore((s) => s.updateClip);
  const nodeRef = useRef<HTMLDivElement>(null);
  const statusDotRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef(clip.gen_status);

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500',
    generating: 'bg-blue-500 animate-pulse',
    done: 'bg-green-500',
    error: 'bg-red-500',
  };

  // Entrance animation
  useEffect(() => {
    if (nodeRef.current) {
      gsap.fromTo(
        nodeRef.current,
        { scale: 0.8, y: 15, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
      );
    }
  }, []);

  // Status change animations
  useEffect(() => {
    if (!nodeRef.current) return;

    if (prevStatus.current !== clip.gen_status) {
      if (clip.gen_status === 'done') {
        gsap.fromTo(
          nodeRef.current,
          { borderColor: '#22c55e', boxShadow: '0 0 20px rgba(34,197,94,0.5)' },
          { borderColor: '#333', boxShadow: 'none', duration: 1, ease: 'power2.out' }
        );
      }
      if (clip.gen_status === 'error') {
        gsap.fromTo(
          nodeRef.current,
          { x: -5 },
          {
            x: 5,
            duration: 0.05,
            repeat: 5,
            yoyo: true,
            ease: 'none',
            onComplete: () => { gsap.set(nodeRef.current, { x: 0 }); },
          }
        );
      }
      prevStatus.current = clip.gen_status;
    }
  }, [clip.gen_status]);

  // GSAP glow for status dot in 'generating' state
  useEffect(() => {
    if (!statusDotRef.current) return;

    if (clip.gen_status === 'generating') {
      gsap.to(statusDotRef.current, {
        boxShadow: '0 0 10px rgba(59,130,246,0.8)',
        duration: 0.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    } else {
      gsap.killTweensOf(statusDotRef.current);
      gsap.set(statusDotRef.current, { boxShadow: 'none' });
    }
  }, [clip.gen_status]);

  const handleGenerate = useCallback(async () => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId) return;

    // Shake animation before generation starts
    if (nodeRef.current) {
      await gsap.fromTo(
        nodeRef.current,
        { x: -3 },
        {
          x: 3,
          duration: 0.04,
          repeat: 3,
          yoyo: true,
          ease: 'none',
          onComplete: () => { gsap.set(nodeRef.current, { x: 0 }); },
        }
      );
    }

    updateClip(clip.id, { gen_status: 'generating' });

    try {
      const result: any = await api.generateClip(projectId, clip.id, clip.prompt, clip.type);
      updateClip(clip.id, {
        gen_status: 'done',
        generated_media_url: result.media_url,
        thumbnail_url: result.thumbnail_url,
      });
    } catch (err) {
      console.error('Clip generation failed:', err);
      updateClip(clip.id, { gen_status: 'error', gen_error: String(err) });
    }
  }, [clip.id, clip.prompt, clip.type, updateClip]);

  return (
    <div ref={nodeRef} className="manga-panel p-4" style={{ width: 260 }}>
      <Handle type="target" position={Position.Left} className="!bg-[#111]" />

      <div className="flex items-center gap-2 mb-2">
        <div ref={statusDotRef} className={`w-2 h-2 rounded-full ${statusColors[clip.gen_status]}`} />
        <span className="text-xs text-[#888] uppercase font-bold tracking-wider" style={{ fontFamily: 'var(--font-manga)' }}>{clip.type}</span>
        <span className="text-xs text-[#555] ml-auto">{(clip.duration_ms / 1000).toFixed(1)}s</span>
      </div>

      <div className="relative group">
        {clip.generated_media_url && clip.type === 'video' ? (
          <video
            src={clip.generated_media_url}
            className="w-full h-32 object-cover mb-2 bg-black"
            controls
            preload="metadata"
            poster={clip.thumbnail_url}
          />
        ) : clip.thumbnail_url ? (
          <img src={clip.thumbnail_url} alt="" className="w-full h-32 object-cover mb-2" />
        ) : (
          <div className="w-full h-32 bg-[#eee] mb-2 flex items-center justify-center manga-halftone">
            <span className="text-[#555] text-xs">No preview</span>
          </div>
        )}

        {clip.gen_status === 'pending' && (
          <button
            onClick={handleGenerate}
            className="absolute inset-0 mb-2 bg-black/60 flex flex-col items-center justify-center gap-1 hover:bg-[#111]/30 transition-colors cursor-pointer"
          >
            <Sparkles size={18} className="text-white" />
            <span className="text-xs font-medium text-white" style={{ fontFamily: 'var(--font-manga)' }}>Generate</span>
          </button>
        )}

        {clip.gen_status === 'generating' && (
          <div className="absolute inset-0 mb-2 bg-black/60 flex flex-col items-center justify-center gap-1">
            <Loader2 size={18} className="text-blue-400 animate-spin" />
            <span className="text-xs text-blue-300">Generating...</span>
          </div>
        )}

        {clip.gen_status === 'error' && (
          <button
            onClick={handleGenerate}
            className="absolute inset-0 mb-2 bg-black/60 flex flex-col items-center justify-center gap-1 hover:bg-red-600/30 transition-colors cursor-pointer"
          >
            <AlertCircle size={18} className="text-red-400" />
            <span className="text-xs text-red-300">Retry</span>
          </button>
        )}

        {clip.gen_status === 'done' && (
          <button
            onClick={handleGenerate}
            className="absolute inset-0 mb-2 bg-black/0 group-hover:bg-black/60 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
          >
            <RefreshCw size={16} className="text-white" />
            <span className="text-xs text-white" style={{ fontFamily: 'var(--font-manga)' }}>Regenerate</span>
          </button>
        )}
      </div>

      <p className="text-xs text-[#666] line-clamp-3 leading-relaxed">{clip.prompt}</p>

      {clip.text && (
        <p className="text-xs text-[#111] mt-1 italic">&quot;{clip.text}&quot;</p>
      )}

      <Handle type="source" position={Position.Right} className="!bg-[#111]" />
    </div>
  );
}

export const SceneNode = memo(SceneNodeInner);
