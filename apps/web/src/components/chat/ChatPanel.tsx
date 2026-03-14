'use client';

import { useState, useRef, useEffect } from 'react';
import { useTimelineStore } from '@/stores/timeline-store';
import { api } from '@/lib/api';
import { Send, Bot, User } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: { tool_name: string; arguments: Record<string, any> }[];
}

interface ChatPanelProps {
  projectId: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const clips = useTimelineStore((s) => s.clips);
  const musicTrack = useTimelineStore((s) => s.musicTrack);
  const settings = useTimelineStore((s) => s.settings);
  const addClip = useTimelineStore((s) => s.addClip);
  const removeClip = useTimelineStore((s) => s.removeClip);
  const updateClip = useTimelineStore((s) => s.updateClip);
  const reorderClips = useTimelineStore((s) => s.reorderClips);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

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
        assistantMsg.tool_calls.forEach(handleToolCall);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error processing request.';
      setMessages((prev) => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800">
      <div className="p-3 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Bot size={16} className="text-violet-400" />
          AI Copilot
        </h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 text-sm mt-8">
            <Bot size={32} className="mx-auto mb-2 text-zinc-600" />
            <p>Ask me to edit your trailer.</p>
            <p className="text-xs mt-1">Try: &quot;Make the opening slower&quot; or &quot;Add more tension&quot;</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && <Bot size={16} className="text-violet-400 mt-1 shrink-0" />}
            <div
              className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                msg.role === 'user'
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-200'
              }`}
            >
              {msg.content}
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.tool_calls.map((tc, j) => (
                    <div key={j} className="text-xs bg-zinc-700 rounded px-2 py-1 font-mono">
                      {tc.tool_name}({JSON.stringify(tc.arguments)})
                    </div>
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && <User size={16} className="text-zinc-400 mt-1 shrink-0" />}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <Bot size={16} className="text-violet-400 mt-1" />
            <div className="bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Edit your trailer..."
            className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500 placeholder:text-zinc-500"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg px-3 py-2 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
