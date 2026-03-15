'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTimelineStore, type Effect, type EffectType } from '@/stores/timeline-store';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { Send, Bot, User, ChevronRight, Zap } from 'lucide-react';
import gsap from 'gsap';

// Module-level registry so the timeline page can cancel in-flight clip generation
const _clipAbortControllers = new Map<string, AbortController>();

export function cancelClipGeneration(clipId: string) {
  const ctrl = _clipAbortControllers.get(clipId);
  if (ctrl) { ctrl.abort(); _clipAbortControllers.delete(clipId); }
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: { tool_name: string; arguments: Record<string, any> }[];
}

interface ChatPanelProps {
  projectId: string;
  onCollapse?: () => void;
  dark?: boolean;
  mode?: 'general' | 'effects';
}

export function ChatPanel({ projectId, onCollapse, dark = false, mode = 'general' }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);

  const clips        = useTimelineStore((s) => s.clips);
  const musicTrack   = useTimelineStore((s) => s.musicTrack);
  const settings     = useTimelineStore((s) => s.settings);
  const effects      = useTimelineStore((s) => s.effects);
  const beatMap      = useTimelineStore((s) => s.beatMap);
  const addClip      = useTimelineStore((s) => s.addClip);
  const removeClip   = useTimelineStore((s) => s.removeClip);
  const updateClip   = useTimelineStore((s) => s.updateClip);
  const reorderClips = useTimelineStore((s) => s.reorderClips);
  const setMusicTrack  = useTimelineStore((s) => s.setMusicTrack);
  const updateSettings = useTimelineStore((s) => s.updateSettings);
  const addEffect    = useTimelineStore((s) => s.addEffect);
  const removeEffect = useTimelineStore((s) => s.removeEffect);
  const updateEffect = useTimelineStore((s) => s.updateEffect);
  const setBeatMap   = useTimelineStore((s) => s.setBeatMap);
  const setEffects   = useTimelineStore((s) => s.setEffects);
  const clearEffects = useTimelineStore((s) => s.clearEffects);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Animate new messages
  useEffect(() => {
    if (messages.length === 0) return;
    const last = document.querySelector(`[data-msg-idx="${messages.length - 1}"]`);
    if (last) {
      const isUser = messages[messages.length - 1].role === 'user';
      gsap.fromTo(last, { opacity: 0, x: isUser ? 20 : -20, scale: 0.97 }, { opacity: 1, x: 0, scale: 1, duration: 0.25, ease: 'back.out(1.5)' });
    }
  }, [messages.length]);

  // Empty state float
  useEffect(() => {
    if (messages.length === 0 && emptyStateRef.current) {
      gsap.to(emptyStateRef.current, { y: -6, duration: 2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }
    return () => { if (emptyStateRef.current) gsap.killTweensOf(emptyStateRef.current); };
  }, [messages.length]);

  // Thinking pulse
  useEffect(() => {
    if (loading && thinkingRef.current) {
      gsap.to(thinkingRef.current, { scale: 1.03, duration: 0.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }
    return () => { if (thinkingRef.current) gsap.killTweensOf(thinkingRef.current); };
  }, [loading]);

  const buildBeatMap = useCallback((bpmValue: number) => {
    const totalMs = useTimelineStore.getState().clips.reduce((sum, clip) => sum + (clip.duration_ms || 3000), 0) || 30000;
    const interval = (60 / bpmValue) * 1000;
    const beats: number[] = [];
    for (let t = 0; t <= totalMs + interval; t += interval) beats.push(Math.round(t));
    return { bpm: bpmValue, offset_ms: 0, beats };
  }, []);

  const normalizeEffectType = useCallback((type?: string): EffectType | undefined => {
    if (!type) return undefined;
    return (type === 'flash_black' ? 'flash_white' : type) as EffectType;
  }, []);

  const handleToolCall = useCallback((tc: { tool_name: string; arguments: Record<string, any> }) => {
    const { tool_name: name, arguments: args } = tc;

    switch (name) {
      case 'add_clip':
        if (args.type === 'text_overlay') break;
        addClip({ type: args.type || 'image', duration_ms: args.duration_ms || 3000, prompt: args.prompt || '', gen_status: 'pending', text: args.text });
        break;
      case 'remove_clip':
        removeClip(args.clip_id);
        break;
      case 'update_clip': {
        const { clip_id, ...updates } = args;
        updateClip(clip_id, updates);
        break;
      }
      case 'reorder_clips':
        reorderClips(args.clip_ids);
        break;
      case 'update_scene_duration':
        updateClip(args.scene_id, { duration_ms: args.duration_sec * 1000 });
        break;
      case 'set_transition':
        if (mode !== 'effects') updateClip(args.clip_id, { transition_type: args.transition_type });
        break;
      case 'regenerate_clip':
        if (args.new_prompt) updateClip(args.clip_id, { prompt: args.new_prompt, gen_status: 'pending' });
        else updateClip(args.clip_id, { gen_status: 'pending' });
        break;
      case 'set_music':
        setMusicTrack({ url: args.url || '', name: args.name, duration_ms: args.duration_ms || 60000, volume: args.volume ?? 0.8 });
        break;
      case 'update_settings':
        updateSettings(args);
        break;
      case 'set_shot_type':
        updateClip(args.clip_id, { shot_type: args.shot_type } as any);
        break;
      case 'add_amv_effect':
        addEffect({
          id: crypto.randomUUID(),
          type: normalizeEffectType(args.type) || 'flash_white',
          timestamp_ms: args.timestamp_ms,
          duration_ms: args.duration_ms || 200,
          intensity: args.intensity ?? 0.8,
          ...(args.params && Object.keys(args.params).length > 0 ? { params: args.params } : {}),
        });
        break;
      case 'update_amv_effect': {
        const { effect_id, type, params: newParams, ...updates } = args;
        const existing = useTimelineStore.getState().effects.find((e) => e.id === effect_id);
        updateEffect(effect_id, {
          ...updates,
          ...(type ? { type: normalizeEffectType(type) } : {}),
          ...(newParams ? { params: { ...(existing?.params || {}), ...newParams } } : {}),
        });
        break;
      }
      case 'remove_amv_effect':
        removeEffect(args.effect_id);
        break;
      case 'clear_amv_effects': {
        const state = useTimelineStore.getState();
        const targetType = normalizeEffectType(args.type);
        const startMs = Number.isFinite(args.start_ms) ? args.start_ms : Number.NEGATIVE_INFINITY;
        const endMs = Number.isFinite(args.end_ms) ? args.end_ms : Number.POSITIVE_INFINITY;
        if (!targetType && !Number.isFinite(args.start_ms) && !Number.isFinite(args.end_ms)) {
          clearEffects();
          break;
        }
        setEffects(state.effects.filter((effect) => {
          const effectType = normalizeEffectType(effect.type);
          const matchesType = !targetType || effectType === targetType;
          const matchesRange = effect.timestamp_ms >= startMs && effect.timestamp_ms <= endMs;
          return !(matchesType && matchesRange);
        }));
        break;
      }
      case 'set_bpm': {
        setBeatMap(buildBeatMap(args.bpm));
        break;
      }
      case 'add_amv_effect_range': {
        const state = useTimelineStore.getState();
        const startMs = Math.max(0, Math.min(args.start_ms, args.end_ms));
        const endMs = Math.max(args.start_ms, args.end_ms);
        const intervalMs = args.interval_ms && args.interval_ms > 0 ? args.interval_ms : null;
        const count = args.count && args.count > 0 ? args.count : null;
        const timestamps: number[] = [];

        if (intervalMs) {
          for (let t = startMs; t <= endMs; t += intervalMs) timestamps.push(Math.round(t));
        } else if (count && count > 1) {
          const span = endMs - startMs;
          const step = span / (count - 1);
          for (let i = 0; i < count; i += 1) timestamps.push(Math.round(startMs + (step * i)));
        } else {
          timestamps.push(Math.round(startMs));
        }

        setEffects([
          ...state.effects,
          ...timestamps.map((timestampMs) => ({
            id: crypto.randomUUID(),
            type: normalizeEffectType(args.type) || 'flash_white',
            timestamp_ms: timestampMs,
            duration_ms: args.duration_ms || 200,
            intensity: args.intensity ?? 0.8,
            ...(args.params && Object.keys(args.params).length > 0 ? { params: args.params } : {}),
          })),
        ]);
        break;
      }
      case 'add_amv_effects_on_beats': {
        const state = useTimelineStore.getState();
        let nextBeatMap = state.beatMap;
        if ((!nextBeatMap || nextBeatMap.beats.length === 0) && args.bpm) {
          nextBeatMap = buildBeatMap(args.bpm);
          setBeatMap(nextBeatMap);
        }
        if (!nextBeatMap || nextBeatMap.beats.length === 0) break;

        const totalMs = state.clips.reduce((sum, clip) => sum + (clip.duration_ms || 3000), 0) || 30000;
        const startMs = Number.isFinite(args.start_ms) ? args.start_ms : 0;
        const endMs = Number.isFinite(args.end_ms) ? args.end_ms : totalMs;
        const everyNBeats = Math.max(1, args.every_n_beats || 1);
        const timestamps = nextBeatMap.beats.filter((beatMs, index) => (
          beatMs >= startMs && beatMs <= endMs && index % everyNBeats === 0
        ));

        setEffects([
          ...state.effects,
          ...timestamps.map((timestampMs) => ({
            id: crypto.randomUUID(),
            type: normalizeEffectType(args.type) || 'flash_white',
            timestamp_ms: timestampMs,
            duration_ms: args.duration_ms || 200,
            intensity: args.intensity ?? 0.8,
            ...(args.params && Object.keys(args.params).length > 0 ? { params: args.params } : {}),
          })),
        ]);
        break;
      }
      case 'auto_amv': {
        const state = useTimelineStore.getState();
        const totalMs = state.clips.reduce((s, c) => s + (c.duration_ms || 3000), 0) || 30000;
        const bpmVal = args.bpm || state.beatMap?.bpm || 128;
        const interval = (60 / bpmVal) * 1000;
        const beats: number[] = [];
        for (let t = 0; t <= totalMs; t += interval) beats.push(Math.round(t));
        const style = args.style || 'aggressive';
        const step = style === 'aggressive' ? 1 : style === 'smooth' ? 2 : 4;
        const beatTypes: EffectType[] = ['flash_white', 'zoom_burst', 'shake', 'chromatic', 'flicker', 'red_flash', 'contrast_punch'];
        const strongTypes: EffectType[] = ['zoom_burst', 'panel_split', 'heavy_shake', 'neon', 'manga_ink', 'overexpose', 'vignette'];
        const eighthTypes: EffectType[] = ['echo', 'time_echo', 'freeze', 'blur_out', 'zoom_out', 'glitch', 'letterbox', 'reverse'];
        const newEffects: Effect[] = [];
        beats.forEach((ms, idx) => {
          if (ms > totalMs || idx % step !== 0 || idx === 0) return;
          const intensity = 0.4 + Math.random() * 0.6;
          if (idx % (step * 8) === 0) {
            const t = eighthTypes[Math.floor(Math.random() * eighthTypes.length)];
            newEffects.push({ id: crypto.randomUUID(), type: t, timestamp_ms: ms, duration_ms: 400, intensity });
          } else if (idx % (step * 4) === 0) {
            const t = strongTypes[Math.floor(Math.random() * strongTypes.length)];
            newEffects.push({ id: crypto.randomUUID(), type: t, timestamp_ms: ms, duration_ms: 300, intensity: Math.min(1, intensity + 0.2) });
          } else {
            const t = beatTypes[Math.floor(Math.random() * beatTypes.length)];
            newEffects.push({ id: crypto.randomUUID(), type: t, timestamp_ms: ms, duration_ms: 150, intensity });
            const halfMs = ms + interval / 2;
            if (halfMs < totalMs && Math.random() > 0.4) {
              const t2 = beatTypes[Math.floor(Math.random() * beatTypes.length)];
              newEffects.push({ id: crypto.randomUUID(), type: t2, timestamp_ms: Math.round(halfMs), duration_ms: 100, intensity: intensity * 0.7 });
            }
          }
        });
        setBeatMap({ bpm: bpmVal, offset_ms: 0, beats });
        setEffects(newEffects);
        break;
      }
      case 'trigger_generate_clip': {
        const clip = useTimelineStore.getState().clips.find((c) => c.id === args.clip_id);
        if (!clip) break;
        if (args.new_prompt) updateClip(args.clip_id, { prompt: args.new_prompt });
        const prompt = args.new_prompt || clip.prompt;
        const analysis = useProjectStore.getState().currentProject?.analysis;
        const chars = ((analysis?.characters as any[]) || []).map((c: any) => ({
          name: c.name,
          description: c.description,
          visual_description: c.visual_description,
          appearance: c.appearance,
          image_url: c.image_url || c.reference_image_url,
        }));
        const sorted = [...useTimelineStore.getState().clips].sort((a, b) => a.order - b.order);
        const clipOrder = sorted.findIndex((c) => c.id === args.clip_id);
        const prevClip = clipOrder > 0 ? sorted[clipOrder - 1] : null;
        const nextClip = clipOrder < sorted.length - 1 ? sorted[clipOrder + 1] : null;
        const genType: 'image' | 'video' = args.media_type === 'video' ? 'video' : (clip.type === 'video' ? 'video' : 'image');
        const abortCtrl = new AbortController();
        _clipAbortControllers.set(args.clip_id, abortCtrl);
        updateClip(args.clip_id, { gen_status: 'generating' });
        const { beatMap, musicTrack } = useTimelineStore.getState();
        const clipStartMs = sorted.slice(0, clipOrder).reduce((s, c) => s + (c.duration_ms || 2000), 0);
        const musicEnergy = beatMap ? (() => {
          const beats = beatMap.beats.filter((b) => b >= clipStartMs && b < clipStartMs + (clip.duration_ms || 2000));
          return beats.length > 0 ? Math.min(1, beats.length / 4) : undefined;
        })() : undefined;
        api.generateClip(projectId, args.clip_id, prompt, genType, {
          clip_order: clipOrder,
          clip_total: sorted.length,
          characters: chars.length > 0 ? chars : undefined,
          mood: (analysis as any)?.mood,
          genre: (analysis as any)?.genre,
          themes: (analysis as any)?.themes,
          prev_scene_prompt: prevClip?.prompt || undefined,
          next_scene_prompt: nextClip?.prompt || undefined,
          start_frame_url: genType === 'video' ? (clip.thumbnail_url || undefined) : undefined,
          scene_image_url: genType === 'image' ? (prevClip?.generated_media_url || prevClip?.thumbnail_url || undefined) : undefined,
          music_timestamp_ms: clipStartMs,
          music_energy: musicEnergy,
          signal: abortCtrl.signal,
        }).then((result: any) => {
          _clipAbortControllers.delete(args.clip_id);
          const url = result.generated_media_url || result.media_url || result.output_url;
          updateClip(args.clip_id, { gen_status: 'done', generated_media_url: url, thumbnail_url: result.thumbnail_url || url });
        }).catch((err: any) => {
          _clipAbortControllers.delete(args.clip_id);
          if (err?.name === 'AbortError') {
            updateClip(args.clip_id, { gen_status: 'pending' });
          } else {
            updateClip(args.clip_id, { gen_status: 'error' });
          }
        });
        break;
      }
      case 'bulk_update_clips':
        (args.updates || []).forEach((upd: any) => {
          const { clip_id, ...updates } = upd;
          updateClip(clip_id, updates);
        });
        break;
    }
  }, [
    addClip,
    removeClip,
    updateClip,
    reorderClips,
    setMusicTrack,
    updateSettings,
    addEffect,
    removeEffect,
    updateEffect,
    setBeatMap,
    setEffects,
    clearEffects,
    projectId,
    mode,
    buildBeatMap,
    normalizeEffectType,
  ]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Build full context snapshot
    const state = useTimelineStore.getState();
    const analysis = useProjectStore.getState().currentProject?.analysis;
    const timeline = {
      project_id: projectId,
      editor_mode: mode,
      clips: state.clips,
      music_track: state.musicTrack,
      settings: state.settings,
      effects: state.effects,
      beat_map: state.beatMap,
      analysis,
    };
    const history = messages.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls }));

    try {
      const data = await api.chat(projectId, userMsg.content, timeline, history);
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.content || 'Done.',
        tool_calls: data.tool_calls?.length ? data.tool_calls : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (assistantMsg.tool_calls?.length) {
        assistantMsg.tool_calls.forEach((tc) => handleToolCall(tc));
        // Auto-save timeline after tool calls
        setTimeout(() => {
          const updated = useTimelineStore.getState();
          api.updateTimeline(projectId, {
            clips: updated.clips,
            music_track: updated.musicTrack,
            effects: updated.effects,
            beat_map: updated.beatMap,
            settings: updated.settings,
          }).catch(() => {});
        }, 200);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error processing request.';
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
    } finally {
      setLoading(false);
    }
  };

  // Theme tokens
  const bg      = dark ? 'bg-[#0f0f0f]' : 'bg-white/95';
  const border  = dark ? 'border-[#222]' : 'border-[#ccc]';
  const text    = dark ? 'text-white' : 'text-[#111]';
  const subtext = dark ? 'text-[#888]' : 'text-[#888]';
  const userBubble  = dark ? 'bg-[#2563eb] text-white' : 'bg-[#111] text-white';
  const botBubble   = dark ? 'bg-[#1a1a1a] border border-[#333] text-white' : 'bg-white border-2 border-[#ccc] text-[#111]';
  const inputBg     = dark ? 'bg-[#1a1a1a] border-[#333] text-white placeholder-[#555]' : 'border-[#ccc] text-[#111]';
  const sendBtn     = dark ? 'bg-[#2563eb] hover:bg-[#1d4ed8]' : 'bg-[#111] hover:bg-[#333]';
  const toolBadgeBg = dark ? 'bg-[#111] border-[#333] text-[#888]' : 'bg-white/80 border-[#ccc] text-[#111]';

  return (
    <div className={`flex flex-col h-full ${bg} border-l-2 ${border}`}>
      {/* Header */}
      <div className={`px-3 py-2 border-b-2 ${border} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2">
          <Bot size={15} className={dark ? 'text-[#2563eb]' : 'text-[#111]'} />
          <span className={`text-xs font-bold tracking-widest ${text}`} style={{ fontFamily: 'var(--font-manga)' }}>
            AI COPILOT
          </span>
          {effects.length > 0 && (
            <span className="text-[0.5rem] bg-[#fbbf24] text-black px-1.5 py-0.5 font-bold" style={{ fontFamily: 'var(--font-manga)' }}>
              {effects.length} FX
            </span>
          )}
        </div>
        {onCollapse && (
          <button onClick={onCollapse} className={`${subtext} hover:${text} transition-colors`}>
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div ref={emptyStateRef} className={`text-center mt-8 ${subtext}`}>
            <Zap size={28} className={`mx-auto mb-2 ${dark ? 'text-[#2563eb]' : 'text-[#555]'}`} />
            <p className="text-xs font-bold tracking-wider" style={{ fontFamily: 'var(--font-manga)' }}>AI COPILOT</p>
            <p className="text-[0.65rem] mt-1">{mode === 'effects' ? 'Edit FX, beats, timing' : 'Edit scenes, effects, pacing'}</p>
            <div className={`mt-3 text-[0.6rem] space-y-1 ${dark ? 'text-[#555]' : 'text-[#aaa]'}`}>
              {mode === 'effects' ? (
                <>
                  <p>&quot;Add flash on every beat from 0s to 8s at 140 bpm&quot;</p>
                  <p>&quot;Clear the current flashes and add shake every 2 beats&quot;</p>
                  <p>&quot;Make the last 5 seconds more intense with glitch and strobe&quot;</p>
                </>
              ) : (
                <>
                  <p>&quot;Make scene 3 more dramatic&quot;</p>
                  <p>&quot;Add flash cuts on every beat at 140bpm&quot;</p>
                  <p>&quot;Regenerate the opening scene&quot;</p>
                </>
              )}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} data-msg-idx={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && <Bot size={14} className={`${dark ? 'text-[#2563eb]' : 'text-[#111]'} mt-1 shrink-0`} />}
            <div className={`px-3 py-2 max-w-[88%] text-sm leading-relaxed ${msg.role === 'user' ? userBubble : botBubble}`}>
              {msg.content}
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.tool_calls.map((tc, j) => (
                    <div key={j} className={`text-[0.6rem] ${toolBadgeBg} border px-2 py-1 font-mono`}>
                      <span className={dark ? 'text-[#fbbf24]' : 'text-purple-600'}>{tc.tool_name}</span>
                      {Object.keys(tc.arguments).length > 0 && (
                        <span className={dark ? 'text-[#555]' : 'text-[#888]'}> {JSON.stringify(tc.arguments).slice(0, 60)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && <User size={14} className={`${subtext} mt-1 shrink-0`} />}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <Bot size={14} className={dark ? 'text-[#2563eb]' : 'text-[#111]'} />
            <div ref={thinkingRef} className={`${botBubble} px-3 py-2 text-sm`}>
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className={`p-3 border-t-2 ${border} shrink-0`}>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={
              mode === 'effects'
                ? 'Describe the FX edit you want...'
                : dark ? 'Add effects, edit scenes...' : 'Edit your trailer...'
            }
            className={`flex-1 text-sm px-3 py-2 border outline-none focus:ring-1 ${dark ? `${inputBg} focus:ring-[#2563eb] focus:border-[#2563eb]` : 'border-[#ccc] focus:ring-[#111] manga-input'}`}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className={`${sendBtn} text-white px-3 py-2 transition-colors disabled:opacity-40`}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
