'use client';

import { useTimelineStore } from '@/stores/timeline-store';

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

  if (sorted.length === 0) return null;

  return (
    <div className="shrink-0 h-14 border-t-2 border-[#ccc] bg-white flex items-center px-3 gap-0 overflow-x-auto">
      {sorted.map((clip, i) => {
        const widthPct = (clip.duration_ms / totalMs) * 100;
        const isSelected = clip.id === selectedClipId;
        const isDone = clip.gen_status === 'done';
        const isPending = clip.gen_status === 'pending';
        const isGenerating = clip.gen_status === 'generating';

        return (
          <div key={clip.id} className="flex items-center shrink-0" style={{ width: `${Math.max(widthPct, 4)}%` }}>
            {/* Clip bar */}
            <button
              onClick={() => onSelectClip(clip.id)}
              className={`relative h-8 w-full border-2 flex items-center justify-center transition-all cursor-pointer overflow-hidden
                ${isSelected ? 'border-[#111] ring-2 ring-[#111] ring-offset-1' : 'border-[#ccc] hover:border-[#888]'}
                ${TYPE_COLORS[clip.type] || 'bg-[#444]'}
              `}
              title={`${i + 1}. ${clip.type} — ${(clip.duration_ms / 1000).toFixed(1)}s${clip.transition_type ? ` → ${clip.transition_type}` : ''}`}
            >
              {/* Thumbnail strip */}
              {clip.thumbnail_url && (
                <img src={clip.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
              )}
              {/* Status dot */}
              <span className={`relative z-10 w-1.5 h-1.5 rounded-full ${
                isDone ? 'bg-green-400' : isGenerating ? 'bg-blue-400 animate-pulse' : isPending ? 'bg-yellow-400' : 'bg-red-400'
              }`} />
              {/* Clip number */}
              <span className="relative z-10 text-[0.5rem] text-white font-bold ml-1 leading-none">{i + 1}</span>
            </button>

            {/* Transition arrow between clips */}
            {i < sorted.length - 1 && (
              <div className="shrink-0 flex items-center justify-center w-4 h-8 border-y-2 border-[#ddd] bg-white text-[0.5rem] text-[#999] font-bold">
                {TRANSITION_LABELS[clip.transition_type || 'cut'] ?? '/'}
              </div>
            )}
          </div>
        );
      })}

      {/* Total duration */}
      <div className="ml-auto shrink-0 pl-3 text-[0.6rem] text-[#999] whitespace-nowrap">
        {(totalMs / 1000).toFixed(1)}s
      </div>
    </div>
  );
}
