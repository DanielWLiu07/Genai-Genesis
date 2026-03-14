'use client';

import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Clip } from '@/stores/timeline-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { api } from '@/lib/api';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';

function SceneNodeInner({ data }: NodeProps) {
  const clip = data.clip as Clip;
  const updateClip = useTimelineStore((s) => s.updateClip);

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500',
    generating: 'bg-blue-500 animate-pulse',
    done: 'bg-green-500',
    error: 'bg-red-500',
  };

  const handleGenerate = useCallback(async () => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId) return;

    updateClip(clip.id, { gen_status: 'generating' });

    try {
      const result: any = await api.generateClip(projectId, clip.id, clip.prompt);
      updateClip(clip.id, {
        gen_status: 'done',
        generated_media_url: result.media_url,
        thumbnail_url: result.thumbnail_url,
      });
    } catch (err) {
      console.error('Clip generation failed:', err);
      updateClip(clip.id, { gen_status: 'error', gen_error: String(err) });
    }
  }, [clip.id, clip.prompt, updateClip]);

  return (
    <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-3 min-w-[200px] shadow-lg">
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />

      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${statusColors[clip.gen_status]}`} />
        <span className="text-xs text-zinc-400 uppercase">{clip.type}</span>
        <span className="text-xs text-zinc-500 ml-auto">{(clip.duration_ms / 1000).toFixed(1)}s</span>
      </div>

      <div className="relative">
        {clip.thumbnail_url ? (
          <img src={clip.thumbnail_url} alt="" className="w-full h-24 object-cover rounded mb-2" />
        ) : (
          <div className="w-full h-24 bg-zinc-700 rounded mb-2 flex items-center justify-center">
            <span className="text-zinc-500 text-xs">No preview</span>
          </div>
        )}

        {clip.gen_status === 'pending' && (
          <button
            onClick={handleGenerate}
            className="absolute inset-0 mb-2 bg-black/60 rounded flex flex-col items-center justify-center gap-1 hover:bg-violet-600/40 transition-colors cursor-pointer"
          >
            <Sparkles size={18} className="text-violet-400" />
            <span className="text-xs font-medium text-violet-300">Generate</span>
          </button>
        )}

        {clip.gen_status === 'generating' && (
          <div className="absolute inset-0 mb-2 bg-black/60 rounded flex flex-col items-center justify-center gap-1">
            <Loader2 size={18} className="text-blue-400 animate-spin" />
            <span className="text-xs text-blue-300">Generating...</span>
          </div>
        )}

        {clip.gen_status === 'error' && (
          <button
            onClick={handleGenerate}
            className="absolute inset-0 mb-2 bg-black/60 rounded flex flex-col items-center justify-center gap-1 hover:bg-red-600/30 transition-colors cursor-pointer"
          >
            <AlertCircle size={18} className="text-red-400" />
            <span className="text-xs text-red-300">Retry</span>
          </button>
        )}
      </div>

      <p className="text-xs text-zinc-300 line-clamp-2">{clip.prompt}</p>

      {clip.text && (
        <p className="text-xs text-violet-400 mt-1 italic">&quot;{clip.text}&quot;</p>
      )}

      <Handle type="source" position={Position.Right} className="!bg-violet-500" />
    </div>
  );
}

export const SceneNode = memo(SceneNodeInner);
