'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import gsap from 'gsap';

export default function CommunityPage() {
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.community-back', { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'power2.out' });
      gsap.fromTo('.community-title', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.15, ease: 'back.out(1.3)' });
      gsap.fromTo('.community-panel', { y: 30, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, delay: 0.3, ease: 'power2.out' });
    }, mainRef);
    return () => ctx.revert();
  }, []);

  return (
    <main ref={mainRef} className="min-h-screen bg-white/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link href="/dashboard" className="community-back text-[#888] hover:text-[#111] flex items-center gap-2 mb-8 text-sm transition-colors">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        <div className="community-title flex items-center gap-3 mb-8">
          <Users size={24} className="text-[#111]" />
          <h1 className="manga-title text-3xl text-[#111]">Community</h1>
        </div>

        <div className="community-panel manga-panel p-12 text-center">
          <p className="text-[#888] text-lg mb-2">Coming soon</p>
          <p className="text-[#555] text-sm">Share your trailers, discover stories, and collaborate with other creators.</p>
        </div>
      </div>
    </main>
  );
}
