'use client';

import { useParams } from 'next/navigation';
import { FlowEditor } from '@/components/editor/FlowEditor';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Film, ArrowLeft, Play, Download } from 'lucide-react';
import Link from 'next/link';

export default function EditorPage() {
  const { id } = useParams();

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Top bar */}
      <header className="h-12 border-b border-zinc-800 flex items-center px-4 gap-4 shrink-0">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-2">
          <Film size={18} className="text-violet-400" />
          <span className="font-semibold text-sm">FrameFlow Editor</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors">
            <Play size={14} /> Preview
          </button>
          <button className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors">
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
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
