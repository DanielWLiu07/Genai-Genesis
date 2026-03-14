'use client';

import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { FlowEditor } from '@/components/editor/FlowEditor';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Film, ArrowLeft, Play, Download } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useTimelineStore } from '@/stores/timeline-store';
import { useProjectStore } from '@/stores/project-store';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const setProjectId = useTimelineStore((s) => s.setProjectId);
  const { currentProject, setCurrentProject } = useProjectStore();
  const wsRef = useRef<WebSocket | null>(null);
  const updateClip = useTimelineStore((s) => s.updateClip);

  useEffect(() => {
    if (!id) return;
    setProjectId(id);

    // Load project + timeline in parallel
    Promise.all([
      api.getProject(id).catch(() => null),
      api.getTimeline(id).catch(() => null),
    ]).then(([project, timeline]) => {
      if (project) setCurrentProject(project as any);
      if (timeline) loadTimeline(timeline);
    });

    // WebSocket for real-time generation updates
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
      .replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/api/v1/ws/${id}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'clip_update' && msg.clip_id) {
          updateClip(msg.clip_id, msg.updates || {});
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [id, setProjectId, loadTimeline, setCurrentProject, updateClip]);

  const handleRender = async () => {
    if (!id) return;
    try {
      await api.renderTrailer(id);
    } catch (err) {
      console.error('Render failed', err);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Top bar */}
      <header className="h-12 border-b border-zinc-800 flex items-center px-4 gap-4 shrink-0">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-2">
          <Film size={18} className="text-violet-400" />
          <span className="font-semibold text-sm">
            {currentProject?.title || 'FrameFlow Editor'}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors">
            <Play size={14} /> Preview
          </button>
          <button
            onClick={handleRender}
            className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* React Flow Editor */}
        <div className="flex-1">
          <FlowEditor />
        </div>

        {/* Chat Panel */}
        <div className="w-[350px] shrink-0">
          <ChatPanel projectId={id} />
        </div>
      </div>
    </div>
  );
}
