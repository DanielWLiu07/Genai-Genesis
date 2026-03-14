'use client';

import { memo, useCallback, useRef, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Clip } from '@/stores/timeline-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { Loader2, Sparkles, AlertCircle, RefreshCw, Film, ImageIcon } from 'lucide-react';
import gsap from 'gsap';

function SceneNodeInner({ data }: NodeProps) {
  const clip = data.clip as Clip;
  const updateClip = useTimelineStore((s) => s.updateClip);
  const clips = useTimelineStore((s) => s.clips);
  const currentProject = useProjectStore((s) => s.currentProject);
  const nodeRef = useRef<HTMLDivElement>(null);
  const statusDotRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef(clip.gen_status);
  const hasVideo = !!(clip.generated_media_url && clip.type === 'video');
  const hasImage = !!clip.thumbnail_url;
  const showTabs = hasVideo && hasImage;
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('video');

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

    // transition clips don't need API generation — mark done immediately
    if (clip.type === 'transition') {
      updateClip(clip.id, { gen_status: 'done' });
      return;
    }

    updateClip(clip.id, { gen_status: 'generating' });

    // Build generation context
    const analysis = currentProject?.analysis;
    const characters = (analysis?.characters as any[] || []).map((c: any) => ({
      name: c.name,
      description: c.description,
      visual_description: c.visual_description,
      appearance: c.appearance,
      image_url: c.image_url || c.reference_image_url,
    }));
    const sortedClips = [...clips].sort((a, b) => a.order - b.order);
    const clipOrder = sortedClips.findIndex((c) => c.id === clip.id);
    const prevClip = clipOrder > 0 ? sortedClips[clipOrder - 1] : null;
    const nextClip = clipOrder < sortedClips.length - 1 ? sortedClips[clipOrder + 1] : null;
    const isContinuous = (clip as any).shot_type === 'continuous';

    // Continuous shot → use previous clip's frame as start frame (same scene flowing)
    // Cut → use this clip's own thumbnail if it exists (re-gen same scene different take)
    const startFrame = isContinuous
      ? (prevClip?.thumbnail_url && !prevClip.thumbnail_url.startsWith('data:') ? prevClip.thumbnail_url : undefined)
      : (clip.thumbnail_url && !clip.thumbnail_url.startsWith('data:') ? clip.thumbnail_url : undefined);

    const sceneImageUrl = startFrame;

    // For text_overlay: generate type stays 'image' but we pass the overlay text
    // so the render service can blend it into the scene cinematically
    const genType = clip.type === 'text_overlay' ? 'text_overlay' : 'image';

    try {
      const result: any = await api.generateClip(projectId, clip.id, clip.prompt, genType, {
        clip_order: clipOrder,
        clip_total: sortedClips.length,
        scene_image_url: sceneImageUrl,
        characters: characters.length > 0 ? characters : undefined,
        mood: analysis?.mood,
        genre: analysis?.genre,
        themes: (analysis?.themes as string[] | undefined),
        shot_type: (clip as any).shot_type || 'cut',
        is_continuous: isContinuous,
        text: clip.text || undefined,
        prev_scene_prompt: prevClip?.prompt,
        next_scene_prompt: nextClip?.prompt,
      });
      updateClip(clip.id, {
        gen_status: 'done',
        generated_media_url: result.media_url,
        thumbnail_url: result.thumbnail_url,
      });
    } catch (err) {
      console.error('Clip generation failed:', err);
      updateClip(clip.id, { gen_status: 'error', gen_error: String(err) });
    }
  }, [clip.id, clip.prompt, clip.type, clip.thumbnail_url, updateClip, clips, currentProject]);

  const handleGenerateVideo = useCallback(async () => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId) return;

    updateClip(clip.id, { gen_status: 'generating' });

    const analysis = currentProject?.analysis;
    const characters = (analysis?.characters as any[] || []).map((c: any) => ({
      name: c.name,
      description: c.description,
      visual_description: c.visual_description,
      appearance: c.appearance,
      image_url: c.image_url || c.reference_image_url,
    }));
    const sortedClips = [...clips].sort((a, b) => a.order - b.order);
    const clipOrder = sortedClips.findIndex((c) => c.id === clip.id);
    const prevClip = clipOrder > 0 ? sortedClips[clipOrder - 1] : null;
    const nextClip = clipOrder < sortedClips.length - 1 ? sortedClips[clipOrder + 1] : null;
    const isContinuous = (clip as any).shot_type === 'continuous';
    const startFrame = clip.thumbnail_url && !clip.thumbnail_url.startsWith('data:')
      ? clip.thumbnail_url : undefined;

    try {
      const result: any = await api.generateClip(projectId, clip.id, clip.prompt, 'video', {
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
      });
      // Video is async — WS will update gen_status; if result already has url, apply it
      if (result.media_url) {
        updateClip(clip.id, { gen_status: 'done', type: 'video' as any, generated_media_url: result.media_url, thumbnail_url: result.thumbnail_url || clip.thumbnail_url });
      }
    } catch (err) {
      updateClip(clip.id, { gen_status: 'error', gen_error: String(err) });
    }
  }, [clip.id, clip.prompt, clip.thumbnail_url, updateClip, clips, currentProject]);

  return (
    <div
      ref={nodeRef}
      className="manga-panel p-4"
      style={{ width: 260 }}
      onMouseEnter={() => { if (nodeRef.current) gsap.to(nodeRef.current, { scale: 1.04, zIndex: 10, duration: 0.2, ease: 'back.out(1.5)' }); }}
      onMouseLeave={() => { if (nodeRef.current) gsap.to(nodeRef.current, { scale: 1, zIndex: 1, duration: 0.2, ease: 'power2.out' }); }}
    >
      <Handle type="target" position={Position.Left} className="!bg-[#111]" />

      <div className="flex items-center gap-2 mb-2">
        <div ref={statusDotRef} className={`w-2 h-2 rounded-full ${statusColors[clip.gen_status]}`} />
        <span className="text-xs text-[#888] uppercase font-bold tracking-wider" style={{ fontFamily: 'var(--font-manga)' }}>
          {clip.type === 'video' ? 'scene' : clip.type}
        </span>
        {clip.type === 'video' && (
          <span className="text-[0.5rem] text-blue-500 bg-blue-50 border border-blue-200 px-1 py-0.5 leading-none" style={{ fontFamily: 'var(--font-manga)' }}>→ VID</span>
        )}
        {(clip as any).shot_type === 'continuous' && (
          <span className="text-[0.5rem] text-green-600 bg-green-50 border border-green-200 px-1 py-0.5 leading-none" style={{ fontFamily: 'var(--font-manga)' }}>∿</span>
        )}
        <span className="text-xs text-[#555] ml-auto">{(clip.duration_ms / 1000).toFixed(1)}s</span>
      </div>

      <div className="relative group">
        {/* Image / Video tabs */}
        {showTabs && (
          <div className="flex mb-1 border-b border-[#ccc]">
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTab('image'); }}
              className={`flex items-center gap-1 px-2 py-0.5 text-[0.55rem] font-bold transition-colors ${activeTab === 'image' ? 'bg-[#111] text-white' : 'text-[#888] hover:text-[#111]'}`}
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              <ImageIcon size={9} /> IMAGE
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTab('video'); }}
              className={`flex items-center gap-1 px-2 py-0.5 text-[0.55rem] font-bold transition-colors ${activeTab === 'video' ? 'bg-blue-600 text-white' : 'text-[#888] hover:text-[#111]'}`}
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              <Film size={9} /> VIDEO
            </button>
          </div>
        )}

        {/* Text overlay with generated scene — show image if generated, else text placeholder */}
        {clip.type === 'text_overlay' && clip.thumbnail_url ? (
          <div className="w-full h-32 overflow-hidden mb-2 relative">
            <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover" />
            {clip.text && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 px-2">
                <p className="text-white text-xs font-bold text-center leading-snug line-clamp-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                   style={{ fontFamily: 'var(--font-manga)', letterSpacing: '0.05em' }}>
                  {clip.text}
                </p>
              </div>
            )}
          </div>
        ) : clip.type === 'text_overlay' ? (
          <div className="w-full h-32 mb-2 bg-[#111] flex items-center justify-center px-3">
            <p className="text-white text-sm font-bold text-center leading-snug line-clamp-4"
               style={{ fontFamily: 'var(--font-manga)', letterSpacing: '0.05em' }}>
              {clip.text || clip.prompt || 'Text Overlay'}
            </p>
          </div>
        ) : showTabs && activeTab === 'video' ? (
          <video
            src={clip.generated_media_url!}
            className="w-full h-32 object-cover mb-2 bg-black"
            controls
            preload="metadata"
            poster={clip.thumbnail_url}
          />
        ) : showTabs && activeTab === 'image' ? (
          <div className="w-full h-32 overflow-hidden mb-2">
            <img src={clip.thumbnail_url!} alt="" className="w-full h-full object-cover" />
          </div>
        ) : clip.generated_media_url && clip.type === 'video' ? (
          <video
            src={clip.generated_media_url}
            className="w-full h-32 object-cover mb-2 bg-black"
            controls
            preload="metadata"
            poster={clip.thumbnail_url}
          />
        ) : clip.thumbnail_url ? (
          <div className="w-full h-32 overflow-hidden mb-2">
            <img
              src={clip.thumbnail_url}
              alt=""
              className={`w-full h-full object-cover ${
                ['parallax-tl','parallax-br','parallax-zoom','parallax-pan'][clip.order % 4]
              }`}
            />
          </div>
        ) : (
          <div className="w-full h-32 bg-[#eee] mb-2 flex items-center justify-center manga-halftone">
            <span className="text-[#555] text-xs">No preview</span>
          </div>
        )}

        {clip.gen_status === 'pending' && clip.type !== 'transition' && (
          <button
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            className="absolute inset-0 mb-2 bg-black/60 flex flex-col items-center justify-center gap-1 hover:bg-[#111]/30 transition-colors cursor-pointer"
          >
            <Sparkles size={18} className="text-white" />
            <span className="text-xs font-medium text-white" style={{ fontFamily: 'var(--font-manga)' }}>
              {clip.type === 'text_overlay' ? 'Scene + Text' : 'Scene Image'}
            </span>
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
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            className="absolute inset-0 mb-2 bg-black/60 flex flex-col items-center justify-center gap-1 hover:bg-red-600/30 transition-colors cursor-pointer"
          >
            <AlertCircle size={18} className="text-red-400" />
            <span className="text-xs text-red-300">Retry</span>
          </button>
        )}

        {clip.gen_status === 'done' && clip.type === 'video' && (
          <div className="absolute inset-0 mb-2 bg-black/0 group-hover:bg-black/70 flex items-center justify-center gap-2 transition-colors opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
              className="flex flex-col items-center gap-1 px-3 py-2 bg-white/10 hover:bg-white/25 border border-white/30 transition-colors"
            >
              <ImageIcon size={14} className="text-white" />
              <span className="text-[0.6rem] text-white" style={{ fontFamily: 'var(--font-manga)' }}>Regen Frame</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleGenerateVideo(); }}
              className="flex flex-col items-center gap-1 px-3 py-2 bg-blue-500/40 hover:bg-blue-500/60 border border-blue-400/50 transition-colors"
            >
              <Film size={14} className="text-blue-200" />
              <span className="text-[0.6rem] text-blue-200" style={{ fontFamily: 'var(--font-manga)' }}>Regen Video</span>
            </button>
          </div>
        )}

        {clip.gen_status === 'done' && clip.type !== 'video' && clip.type !== 'text_overlay' && (
          <div className="absolute inset-0 mb-2 bg-black/0 group-hover:bg-black/70 flex items-center justify-center gap-2 transition-colors opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
              className="flex flex-col items-center gap-1 px-3 py-2 bg-white/10 hover:bg-white/25 border border-white/30 transition-colors"
            >
              <RefreshCw size={14} className="text-white" />
              <span className="text-[0.6rem] text-white" style={{ fontFamily: 'var(--font-manga)' }}>Regen Frame</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleGenerateVideo(); }}
              className="flex flex-col items-center gap-1 px-3 py-2 bg-blue-500/40 hover:bg-blue-500/60 border border-blue-400/50 transition-colors"
            >
              <Film size={14} className="text-blue-200" />
              <span className="text-[0.6rem] text-blue-200" style={{ fontFamily: 'var(--font-manga)' }}>Gen Video</span>
            </button>
          </div>
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
