'use client';

import { memo, useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Clip } from '@/stores/timeline-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { Loader2, Sparkles, AlertCircle, RefreshCw, Film, ImageIcon, Scissors } from 'lucide-react';
import gsap from 'gsap';

// Scene group color palette — cycles through 8 colors for visual grouping
const GROUP_COLORS = [
  '#a855f7', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

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

  const sortedClips = useMemo(() => [...clips].sort((a, b) => a.order - b.order), [clips]);
  const sceneIdx = useMemo(() => sortedClips.findIndex((c) => c.id === clip.id), [sortedClips, clip.id]);
  const sceneNum = String(sceneIdx + 1).padStart(2, '0');
  const sceneGroup = (clip as any).scene_group ?? clip.order;
  const groupColor = GROUP_COLORS[sceneGroup % GROUP_COLORS.length];
  const isContinuous = (clip as any).shot_type === 'continuous';

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-400',
    generating: 'bg-blue-500 animate-pulse',
    done: 'bg-emerald-500',
    error: 'bg-red-500',
  };

  // Entrance animation
  useEffect(() => {
    if (nodeRef.current) {
      gsap.fromTo(
        nodeRef.current,
        { scale: 0.85, y: 20, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.7)' }
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
          { borderColor: '#22c55e', boxShadow: `4px 4px 0px ${groupColor}, 0 0 24px rgba(34,197,94,0.4)` },
          { borderColor: '#111', boxShadow: `4px 4px 0px #111`, duration: 1.2, ease: 'power2.out' }
        );
      }
      if (clip.gen_status === 'error') {
        gsap.fromTo(
          nodeRef.current,
          { x: -5 },
          { x: 5, duration: 0.05, repeat: 5, yoyo: true, ease: 'none',
            onComplete: () => { gsap.set(nodeRef.current, { x: 0 }); } }
        );
      }
      prevStatus.current = clip.gen_status;
    }
  }, [clip.gen_status, groupColor]);

  // GSAP glow for status dot while generating
  useEffect(() => {
    if (!statusDotRef.current) return;
    if (clip.gen_status === 'generating') {
      gsap.to(statusDotRef.current, {
        boxShadow: '0 0 10px rgba(59,130,246,0.9)',
        duration: 0.6, repeat: -1, yoyo: true, ease: 'sine.inOut',
      });
    } else {
      gsap.killTweensOf(statusDotRef.current);
      gsap.set(statusDotRef.current, { boxShadow: 'none' });
    }
  }, [clip.gen_status]);

  const buildGenerationContext = useCallback(() => {
    const analysis = currentProject?.analysis;
    const characters = (analysis?.characters as any[] || []).map((c: any) => ({
      name: c.name, description: c.description,
      visual_description: c.visual_description, appearance: c.appearance,
      image_url: c.image_url || c.reference_image_url,
    }));
    const clipOrder = sceneIdx;
    const prevClip = clipOrder > 0 ? sortedClips[clipOrder - 1] : null;
    const nextClip = clipOrder < sortedClips.length - 1 ? sortedClips[clipOrder + 1] : null;
    const isCont = (clip as any).shot_type === 'continuous';
    const startFrame = isCont
      ? (prevClip?.thumbnail_url && !prevClip.thumbnail_url.startsWith('data:') ? prevClip.thumbnail_url : undefined)
      : (clip.thumbnail_url && !clip.thumbnail_url.startsWith('data:') ? clip.thumbnail_url : undefined);
    return { analysis, characters, clipOrder, prevClip, nextClip, isCont, startFrame };
  }, [clip, sceneIdx, sortedClips, currentProject]);

  const handleGenerate = useCallback(async () => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId) return;
    if (nodeRef.current) {
      await gsap.fromTo(nodeRef.current, { x: -3 },
        { x: 3, duration: 0.04, repeat: 3, yoyo: true, ease: 'none',
          onComplete: () => { gsap.set(nodeRef.current, { x: 0 }); } });
    }
    if (clip.type === 'transition') { updateClip(clip.id, { gen_status: 'done' }); return; }
    updateClip(clip.id, { gen_status: 'generating' });
    const { analysis, characters, clipOrder, prevClip, nextClip, isCont, startFrame } = buildGenerationContext();
    const genType = clip.type === 'text_overlay' ? 'text_overlay' : 'image';
    try {
      const result: any = await api.generateClip(projectId, clip.id, clip.prompt, genType, {
        clip_order: clipOrder, clip_total: sortedClips.length,
        scene_image_url: startFrame,
        characters: characters.length > 0 ? characters : undefined,
        mood: analysis?.mood, genre: analysis?.genre,
        themes: (analysis?.themes as string[] | undefined),
        shot_type: (clip as any).shot_type || 'cut',
        is_continuous: isCont,
        text: clip.text || undefined,
        prev_scene_prompt: prevClip?.prompt, next_scene_prompt: nextClip?.prompt,
      });
      updateClip(clip.id, { gen_status: 'done', generated_media_url: result.media_url, thumbnail_url: result.thumbnail_url });
    } catch (err) {
      updateClip(clip.id, { gen_status: 'error', gen_error: String(err) });
    }
  }, [clip, buildGenerationContext, updateClip, sortedClips]);

  const handleGenerateVideo = useCallback(async () => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId) return;
    updateClip(clip.id, { gen_status: 'generating' });
    const { analysis, characters, clipOrder, prevClip, nextClip, isCont, startFrame } = buildGenerationContext();
    try {
      const result: any = await api.generateClip(projectId, clip.id, clip.prompt, 'video', {
        clip_order: clipOrder, clip_total: sortedClips.length,
        scene_image_url: startFrame,
        characters: characters.length > 0 ? characters : undefined,
        mood: analysis?.mood, genre: analysis?.genre,
        themes: (analysis?.themes as string[] | undefined),
        shot_type: (clip as any).shot_type || 'cut',
        is_continuous: isCont,
        prev_scene_prompt: prevClip?.prompt, next_scene_prompt: nextClip?.prompt,
      });
      if (result.media_url) {
        updateClip(clip.id, { gen_status: 'done', type: 'video' as any, generated_media_url: result.media_url, thumbnail_url: result.thumbnail_url || clip.thumbnail_url });
      }
    } catch (err) {
      updateClip(clip.id, { gen_status: 'error', gen_error: String(err) });
    }
  }, [clip, buildGenerationContext, updateClip, sortedClips]);

  return (
    <div
      ref={nodeRef}
      className="overflow-hidden bg-white select-none"
      style={{
        width: 244,
        border: '2px solid #111',
        boxShadow: '4px 4px 0px #111',
        borderLeft: `4px solid ${groupColor}`,
      }}
      onMouseEnter={() => { if (nodeRef.current) gsap.to(nodeRef.current, { scale: 1.03, zIndex: 10, duration: 0.18, ease: 'back.out(1.5)' }); }}
      onMouseLeave={() => { if (nodeRef.current) gsap.to(nodeRef.current, { scale: 1, zIndex: 1, duration: 0.18, ease: 'power2.out' }); }}
    >
      <Handle type="target" position={Position.Left} className="!bg-[#111] !w-2 !h-2" />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[#e8e8e8] bg-white">
        <div ref={statusDotRef} className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[clip.gen_status]}`} />
        <span
          className="text-[0.62rem] font-black text-[#111] tracking-widest uppercase shrink-0"
          style={{ fontFamily: 'var(--font-manga)' }}
        >
          {sceneNum}
        </span>

        {/* Shot type badge */}
        {isContinuous ? (
          <span className="inline-flex items-center gap-0.5 text-[0.45rem] bg-emerald-50 border border-emerald-200 text-emerald-700 px-1 py-0.5 font-black leading-none uppercase">
            ∿ CONT
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[0.45rem] bg-[#f5f5f5] border border-[#ddd] text-[#888] px-1 py-0.5 font-black leading-none uppercase">
            <Scissors size={6} /> CUT
          </span>
        )}

        {/* Video badge */}
        {clip.type === 'video' && (
          <span className="text-[0.45rem] bg-blue-50 border border-blue-200 text-blue-600 px-1 py-0.5 font-black leading-none">
            ▶ VID
          </span>
        )}

        <span className="text-[0.55rem] text-[#aaa] font-mono ml-auto shrink-0">
          {(clip.duration_ms / 1000).toFixed(1)}s
        </span>
      </div>

      {/* Media area */}
      <div className="relative group" style={{ height: 164 }}>
        {/* Tab switcher (when both video + image exist) */}
        {showTabs && (
          <div className="absolute top-1.5 left-1.5 z-10 flex gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTab('image'); }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5rem] font-bold transition-all ${activeTab === 'image' ? 'bg-[#111] text-white' : 'bg-white/80 text-[#555] hover:bg-white'}`}
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              <ImageIcon size={7} /> IMG
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTab('video'); }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[0.5rem] font-bold transition-all ${activeTab === 'video' ? 'bg-blue-600 text-white' : 'bg-white/80 text-[#555] hover:bg-white'}`}
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              <Film size={7} /> VID
            </button>
          </div>
        )}

        {/* Media content */}
        {showTabs && activeTab === 'video' ? (
          <video
            src={clip.generated_media_url!}
            className="w-full h-full object-cover bg-black"
            controls preload="metadata" poster={clip.thumbnail_url}
          />
        ) : showTabs && activeTab === 'image' ? (
          <img src={clip.thumbnail_url!} alt="" className="w-full h-full object-cover" />
        ) : clip.generated_media_url && clip.type === 'video' ? (
          <video
            src={clip.generated_media_url}
            className="w-full h-full object-cover bg-black"
            controls preload="metadata" poster={clip.thumbnail_url}
          />
        ) : clip.thumbnail_url ? (
          <img
            src={clip.thumbnail_url}
            alt=""
            className={`w-full h-full object-cover ${['parallax-tl','parallax-br','parallax-zoom','parallax-pan'][clip.order % 4]}`}
          />
        ) : (
          <div className="w-full h-full bg-[#f0f0f0] flex items-center justify-center manga-halftone">
            <div className="text-center">
              <ImageIcon size={20} className="text-[#ccc] mx-auto mb-1" />
              <span className="text-[0.55rem] text-[#bbb]" style={{ fontFamily: 'var(--font-manga)' }}>NO PREVIEW</span>
            </div>
          </div>
        )}

        {/* Pending — generate overlay */}
        {clip.gen_status === 'pending' && clip.type !== 'transition' && !(clip as any).manga_panel && (
          <button
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 hover:bg-black/50 transition-colors cursor-pointer group/btn"
          >
            <div className="w-9 h-9 rounded-full bg-white/10 border border-white/30 flex items-center justify-center group-hover/btn:bg-white/20 transition-colors">
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="text-[0.6rem] font-bold text-white/90 tracking-widest uppercase" style={{ fontFamily: 'var(--font-manga)' }}>
              {clip.type === 'text_overlay' ? 'Scene + Text' : 'Generate'}
            </span>
          </button>
        )}

        {/* Generating overlay */}
        {clip.gen_status === 'generating' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
            <div className="relative">
              <div className="w-9 h-9 rounded-full border-2 border-blue-400/30 absolute inset-0 animate-ping" />
              <div className="w-9 h-9 rounded-full border-2 border-blue-400 flex items-center justify-center">
                <Loader2 size={14} className="text-blue-300 animate-spin" />
              </div>
            </div>
            <span className="text-[0.58rem] text-blue-300 tracking-widest font-bold animate-pulse" style={{ fontFamily: 'var(--font-manga)' }}>
              GENERATING…
            </span>
          </div>
        )}

        {/* Error overlay */}
        {clip.gen_status === 'error' && !(clip as any).manga_panel && (
          <button
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 hover:bg-red-950/70 transition-colors cursor-pointer"
          >
            <div className="w-9 h-9 rounded-full bg-red-500/20 border border-red-400/50 flex items-center justify-center">
              <AlertCircle size={16} className="text-red-400" />
            </div>
            <span className="text-[0.6rem] font-bold text-red-300 tracking-widest uppercase" style={{ fontFamily: 'var(--font-manga)' }}>Retry</span>
          </button>
        )}

        {/* Done — hover action overlay */}
        {clip.gen_status === 'done' && !(clip as any).manga_panel && (
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-end justify-center pb-3 gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
              className="flex flex-col items-center gap-1 px-3 py-1.5 bg-white/15 hover:bg-white/30 border border-white/25 backdrop-blur-sm transition-all"
            >
              <RefreshCw size={12} className="text-white" />
              <span className="text-[0.5rem] text-white/90 font-bold" style={{ fontFamily: 'var(--font-manga)' }}>REGEN IMG</span>
            </button>
            {clip.type !== 'transition' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleGenerateVideo(); }}
                className="flex flex-col items-center gap-1 px-3 py-1.5 bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400/40 backdrop-blur-sm transition-all"
              >
                <Film size={12} className="text-blue-200" />
                <span className="text-[0.5rem] text-blue-200 font-bold" style={{ fontFamily: 'var(--font-manga)' }}>
                  {clip.type === 'video' ? 'REGEN VID' : 'GEN VIDEO'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Prompt footer */}
      <div
        className="px-2.5 py-2"
        style={{ background: 'linear-gradient(135deg, #0d0d0d 0%, #111 100%)' }}
      >
        <p className="text-[0.6rem] text-white/80 line-clamp-2 leading-relaxed">
          {clip.prompt || <span className="italic text-white/40">No prompt</span>}
        </p>
        {clip.text && (
          <p className="text-[0.55rem] text-[#a855f7] mt-0.5 italic line-clamp-1">
            &ldquo;{clip.text}&rdquo;
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-[#111] !w-2 !h-2" />
    </div>
  );
}

export const SceneNode = memo(SceneNodeInner);
