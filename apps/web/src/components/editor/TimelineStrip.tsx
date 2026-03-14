'use client';

import { useState } from 'react';
import { useTimelineStore } from '@/stores/timeline-store';
import { Film, X } from 'lucide-react';

const TRANSITION_LABELS: Record<string, string> = {
  fade: 'F',
  dissolve: 'D',
  wipe: 'W',
  cut: '/',
};

const TYPE_COLORS: Record<string, string> = {
  image: 'bg-[#444]',
  video: 'bg-[#111]',
  text_overlay: 'bg-[#888]',
  transition: 'bg-[#bbb]',
};

interface TimelineStripProps {
  selectedClipId: string | null;
  onSelectClip: (id: string) => void;
}

export function TimelineStrip({ selectedClipId, onSelectClip }: TimelineStripProps) {
  const clips = useTimelineStore((s) => s.clips);
  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const totalMs = sorted.reduce((s, c) => s + c.duration_ms, 0) || 1;
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);

  if (sorted.length === 0) return null;

  const previewClip = sorted.find((c) => c.id === previewClipId);

  return (
    <div className="shrink-0 border-t-2 border-[#ccc] bg-white">
      {/* Video preview panel */}
      {previewClip?.generated_media_url && (
        <div className="border-b-2 border-[#ccc] bg-[#111] flex items-center gap-3 px-3 py-2">
          <video
            key={previewClip.id}
            src={previewClip.generated_media_url}
            className="h-24 aspect-video object-cover border border-[#333]"
            controls
            autoPlay
            poster={previewClip.thumbnail_url}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[0.6rem] text-[#888] uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-manga)' }}>
              Scene {sorted.findIndex((c) => c.id === previewClip.id) + 1}
            </p>
            <p className="text-xs text-white line-clamp-3 leading-relaxed">{previewClip.prompt}</p>
          </div>
          <button onClick={() => setPreviewClipId(null)} className="text-[#666] hover:text-white transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Clip strip */}
      <div className="h-14 flex items-center px-3 gap-0 overflow-x-auto">
        {sorted.map((clip, i) => {
          const widthPct = (clip.duration_ms / totalMs) * 100;
          const isSelected = clip.id === selectedClipId;
          const isDone = clip.gen_status === 'done';
          const isPending = clip.gen_status === 'pending';
          const isGenerating = clip.gen_status === 'generating';
          const hasVideo = !!(clip.generated_media_url && clip.type === 'video');
          const isPreviewing = clip.id === previewClipId;

          return (
            <div key={clip.id} className="flex items-center shrink-0" style={{ width: `${Math.max(widthPct, 4)}%` }}>
              <button
                onClick={() => {
                  onSelectClip(clip.id);
                  if (hasVideo) setPreviewClipId(isPreviewing ? null : clip.id);
                }}
                className={`relative h-8 w-full border-2 flex items-center justify-center transition-all cursor-pointer overflow-hidden
                  ${isSelected ? 'border-[#111] ring-2 ring-[#111] ring-offset-1' : 'border-[#ccc] hover:border-[#888]'}
                  ${isPreviewing ? 'border-blue-500 ring-2 ring-blue-400 ring-offset-1' : ''}
                  ${TYPE_COLORS[clip.type] || 'bg-[#444]'}
                `}
                title={`${i + 1}. ${clip.type} — ${(clip.duration_ms / 1000).toFixed(1)}s${clip.transition_type ? ` → ${clip.transition_type}` : ''}${hasVideo ? ' · Click to preview video' : ''}`}
              >
                {clip.thumbnail_url && (
                  <img src={clip.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                )}
                <span className={`relative z-10 w-1.5 h-1.5 rounded-full ${
                  isDone ? 'bg-green-400' : isGenerating ? 'bg-blue-400 animate-pulse' : isPending ? 'bg-yellow-400' : 'bg-red-400'
                }`} />
                <span className="relative z-10 text-[0.5rem] text-white font-bold ml-1 leading-none">{i + 1}</span>
                {/* Video indicator */}
                {hasVideo && (
                  <span className="absolute bottom-0.5 right-0.5 z-10">
                    <Film size={8} className="text-blue-300" />
                  </span>
                )}
              </button>

              {i < sorted.length - 1 && (
                <div className="shrink-0 flex items-center justify-center w-4 h-8 border-y-2 border-[#ddd] bg-white text-[0.5rem] text-[#999] font-bold">
                  {TRANSITION_LABELS[clip.transition_type || 'cut'] ?? '/'}
                </div>
              )}
            </div>
          );
        })}

        <div className="ml-auto shrink-0 pl-3 text-[0.6rem] text-[#999] whitespace-nowrap">
          {(totalMs / 1000).toFixed(1)}s
        </div>
      </div>
    </div>
  );
}
