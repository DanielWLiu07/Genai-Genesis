'use client';

import { useState, useRef, useEffect } from 'react';
import { useTimelineStore } from '@/stores/timeline-store';
import { api } from '@/lib/api';
import { Send, Bot, User, ChevronRight } from 'lucide-react';
import gsap from 'gsap';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: { tool_name: string; arguments: Record<string, any> }[];
}

interface ChatPanelProps {
  projectId: string;
  onCollapse?: () => void;
}

export function ChatPanel({ projectId, onCollapse }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const clips = useTimelineStore((s) => s.clips);
  const musicTrack = useTimelineStore((s) => s.musicTrack);
  const settings = useTimelineStore((s) => s.settings);
  const addClip = useTimelineStore((s) => s.addClip);
  const removeClip = useTimelineStore((s) => s.removeClip);
  const updateClip = useTimelineStore((s) => s.updateClip);
  const reorderClips = useTimelineStore((s) => s.reorderClips);
  const setMusicTrack = useTimelineStore((s) => s.setMusicTrack);
  const updateSettings = useTimelineStore((s) => s.updateSettings);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Animate new messages sliding in
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = document.querySelector(`[data-msg-index="${messages.length - 1}"]`);
      if (lastMsg) {
        const isUser = messages[messages.length - 1].role === 'user';
        gsap.fromTo(
          lastMsg,
          { opacity: 0, x: isUser ? 30 : -30, scale: 0.95 },
          { opacity: 1, x: 0, scale: 1, duration: 0.3, ease: 'back.out(1.5)' }
        );

        // Stagger tool call badges if present
        const toolBadges = lastMsg.querySelectorAll('[data-tool-badge]');
        if (toolBadges.length > 0) {
          gsap.fromTo(
            toolBadges,
            { opacity: 0, scale: 0.5, y: 10 },
            { opacity: 1, scale: 1, y: 0, duration: 0.3, stagger: 0.08, ease: 'back.out(2)', delay: 0.2 }
          );
        }
      }
    }
  }, [messages.length]);

  // Empty state floating animation
  useEffect(() => {
    if (messages.length === 0 && emptyStateRef.current) {
      gsap.to(emptyStateRef.current, {
        y: -8,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }
    return () => {
      if (emptyStateRef.current) {
        gsap.killTweensOf(emptyStateRef.current);
      }
    };
  }, [messages.length]);

  // Thinking indicator pulse
  useEffect(() => {
    if (loading && thinkingRef.current) {
      gsap.to(thinkingRef.current, {
        scale: 1.05,
        duration: 0.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }
    return () => {
      if (thinkingRef.current) {
        gsap.killTweensOf(thinkingRef.current);
      }
    };
  }, [loading]);

  // Input focus glow
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const onFocus = () => {
      gsap.to(el, {
        boxShadow: '0 0 12px rgba(168,85,247,0.4)',
        duration: 0.3,
        ease: 'power2.out',
      });
    };
    const onBlur = () => {
      gsap.to(el, {
        boxShadow: '0 0 0px rgba(168,85,247,0)',
        duration: 0.3,
        ease: 'power2.out',
      });
    };

    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
    };
  }, []);

  const handleToolCall = (toolCall: { tool_name: string; arguments: Record<string, any> }) => {
    const { tool_name, arguments: args } = toolCall;
    switch (tool_name) {
      case 'add_clip':
        addClip({ type: args.type || 'image', duration_ms: args.duration_ms || 3000, prompt: args.prompt || '', gen_status: 'pending' });
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
        updateClip(args.clip_id, { transition_type: args.transition_type });
        break;
      case 'regenerate_clip':
        if (args.new_prompt) {
          updateClip(args.clip_id, { prompt: args.new_prompt, gen_status: 'pending' });
        } else {
          updateClip(args.clip_id, { gen_status: 'pending' });
        }
        break;
      case 'set_music':
        setMusicTrack({ url: args.url || '', name: args.name, duration_ms: args.duration_ms || 60000, volume: args.volume ?? 0.8 });
        break;
      case 'update_settings':
        updateSettings(args);
        break;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const timeline = { project_id: projectId, clips, music_track: musicTrack, settings };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const data = await api.chat(projectId, userMsg.content, timeline, history);

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.content || 'Done.',
        tool_calls: data.tool_calls?.length ? data.tool_calls : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (assistantMsg.tool_calls) {
        assistantMsg.tool_calls.forEach((tc, idx) => {
          handleToolCall(tc);
          // Flash tool badge green after applying
          setTimeout(() => {
            const badge = document.querySelector(`[data-msg-index="${messages.length + 1}"] [data-tool-badge="${idx}"]`);
            if (badge) {
              gsap.fromTo(
                badge,
                { backgroundColor: '#22c55e', color: '#fff' },
                { backgroundColor: '#0a0a0a', color: '#111', duration: 0.8, ease: 'power2.out' }
              );
            }
          }, 400);
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error processing request.';
      setMessages((prev) => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/80 border-l-3 border-[#ccc]">
      <div className="p-3 border-b-2 border-[#ccc] flex items-center justify-between">
        <h3 className="text-sm flex items-center gap-2">
          <Bot size={16} className="text-[#111]" />
          <span className="manga-accent-bar text-xs">AI Copilot</span>
        </h3>
        {onCollapse && (
          <button onClick={onCollapse} className="text-[#888] hover:text-[#111] transition-colors" title="Collapse panel">
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div ref={emptyStateRef} className="text-center text-[#555] text-sm mt-8">
            <Bot size={32} className="mx-auto mb-2 text-[#333]" />
            <p className="text-[#888]">Ask me to edit your trailer.</p>
            <p className="text-xs mt-1 text-[#555]">Try: &quot;Make the opening slower&quot; or &quot;Add more tension&quot;</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} data-msg-index={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && <Bot size={16} className="text-[#111] mt-1 shrink-0" />}
            <div
              className={`px-3 py-2 max-w-[85%] text-sm ${
                msg.role === 'user'
                  ? 'bg-[#111] text-white'
                  : 'bg-white border-2 border-[#ccc] text-[#111]'
              }`}
            >
              {msg.content}
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.tool_calls.map((tc, j) => (
                    <div key={j} data-tool-badge={j} className="text-xs bg-white/80 border border-[#ccc] px-2 py-1 font-mono text-[#111]">
                      {tc.tool_name}({JSON.stringify(tc.arguments)})
                    </div>
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && <User size={16} className="text-[#888] mt-1 shrink-0" />}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <Bot size={16} className="text-[#111] mt-1" />
            <div ref={thinkingRef} className="bg-white border-2 border-[#ccc] px-3 py-2 text-sm text-[#888]">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t-2 border-[#ccc]">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Edit your trailer..."
            className="manga-input flex-1 text-sm py-2"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="manga-btn bg-[#111] text-white px-3 py-2 disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
