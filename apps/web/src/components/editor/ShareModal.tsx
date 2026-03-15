'use client';

import React, { useState } from 'react';
import { Film, X } from 'lucide-react';

interface ShareModalProps {
  projectId: string;
  outputUrl: string;
  onClose: () => void;
}

export function ShareModal({ projectId, outputUrl, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const isVideo = outputUrl.toLowerCase().includes('.mp4') || outputUrl.toLowerCase().includes('.webm');

  function handleCopy() {
    navigator.clipboard.writeText(outputUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handlePublish() {
    if (published || publishing) return;
    setPublishing(true);
    try {
      await fetch(`/api/projects/${projectId}/publish`, { method: 'POST' });
      setPublished(true);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md bg-white border-[3px] border-[#111] p-6 flex flex-col gap-5"
        style={{ boxShadow: '6px 6px 0 #111' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film size={20} color="#a855f7" strokeWidth={2.5} />
            <span
              className="text-xl tracking-[0.2em] text-[#111]"
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              RENDER COMPLETE
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 border border-[#111] text-[#111] hover:bg-[#111] hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Video preview */}
        <div className="border-[2px] border-[#111] overflow-hidden bg-[#f5f5f5] flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
          {isVideo ? (
            <video
              src={outputUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full h-full object-contain"
            />
          ) : (
            <span
              className="text-sm tracking-[0.15em] text-[#555]"
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              VIDEO READY
            </span>
          )}
        </div>

        {/* Share link */}
        <div className="flex flex-col gap-2">
          <span
            className="text-xs tracking-[0.2em] text-[#111]"
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            SHARE LINK
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={outputUrl}
              className="flex-1 min-w-0 border-[2px] border-[#111] px-3 py-2 text-xs text-[#111] bg-[#fafafa] focus:outline-none font-mono"
            />
            <button
              onClick={handleCopy}
              className="shrink-0 px-3 py-2 border-[2px] border-[#111] text-xs tracking-[0.15em] text-white bg-[#111] hover:bg-[#333] transition-colors"
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              {copied ? 'COPIED!' : 'COPY LINK'}
            </button>
          </div>
        </div>

        {/* Community publish */}
        <div className="border-[2px] border-[#111] p-4 flex flex-col gap-3">
          <span
            className="text-sm tracking-[0.2em] text-[#111]"
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            POST TO COMMUNITY
          </span>
          <p className="text-xs text-[#555] leading-relaxed">
            Share your trailer with other creators
          </p>
          {published ? (
            <div className="flex items-center gap-3">
              <span
                className="text-sm tracking-[0.15em] text-[#a855f7]"
                style={{ fontFamily: 'var(--font-manga)' }}
              >
                PUBLISHED
              </span>
              <a
                href="/community"
                className="text-xs tracking-[0.15em] text-[#111] underline hover:text-[#a855f7] transition-colors"
                style={{ fontFamily: 'var(--font-manga)' }}
              >
                VIEW IN COMMUNITY
              </a>
            </div>
          ) : (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="self-start px-4 py-2 border-[2px] border-[#a855f7] text-xs tracking-[0.2em] text-white bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: 'var(--font-manga)' }}
            >
              {publishing ? 'PUBLISHING...' : 'PUBLISH'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
