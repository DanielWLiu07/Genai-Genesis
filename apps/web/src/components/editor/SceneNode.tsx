'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Clip } from '@/stores/timeline-store';

function SceneNodeInner({ data }: NodeProps) {
  const clip = data.clip as Clip;

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500',
    generating: 'bg-blue-500 animate-pulse',
    done: 'bg-green-500',
    error: 'bg-red-500',
  };

  return (
    <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-3 min-w-[200px] shadow-lg">
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />

      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${statusColors[clip.gen_status]}`} />
        <span className="text-xs text-zinc-400 uppercase">{clip.type}</span>
        <span className="text-xs text-zinc-500 ml-auto">{(clip.duration_ms / 1000).toFixed(1)}s</span>
      </div>

      {clip.thumbnail_url ? (
        <img src={clip.thumbnail_url} alt="" className="w-full h-24 object-cover rounded mb-2" />
      ) : (
        <div className="w-full h-24 bg-zinc-700 rounded mb-2 flex items-center justify-center">
          <span className="text-zinc-500 text-xs">No preview</span>
        </div>
      )}

      <p className="text-xs text-zinc-300 line-clamp-2">{clip.prompt}</p>

      {clip.text && (
        <p className="text-xs text-violet-400 mt-1 italic">&quot;{clip.text}&quot;</p>
      )}

      <Handle type="source" position={Position.Right} className="!bg-violet-500" />
    </div>
  );
}

export const SceneNode = memo(SceneNodeInner);
