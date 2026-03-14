'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import gsap from 'gsap';
import { ArrowRight } from 'lucide-react';

export default function LandingPage() {
  const logoRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bgFlashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(logoRef.current,
        { scale: 0, opacity: 0, rotation: -360 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.7, ease: 'back.out(1.2)' }
      );
      gsap.fromTo(titleRef.current,
        { scale: 3, opacity: 0, y: -200, rotateZ: -5 },
        { scale: 1, opacity: 1, y: 0, rotateZ: 0, duration: 0.5, delay: 0.3, ease: 'power4.out' }
      );
      gsap.fromTo(bgFlashRef.current,
        { opacity: 0 },
        { opacity: 0.3, duration: 0.06, delay: 0.6, yoyo: true, repeat: 1, ease: 'none' }
      );
      gsap.fromTo(containerRef.current,
        { x: 0, y: 0 },
        { x: 4, y: -2, duration: 0.03, delay: 0.65, yoyo: true, repeat: 5, ease: 'power2.inOut' }
      );
      gsap.fromTo(lineRef.current,
        { scaleX: 0, transformOrigin: 'center' },
        { scaleX: 1, duration: 0.4, delay: 0.7, ease: 'power3.out' }
      );
      gsap.fromTo(subtitleRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, delay: 0.9, ease: 'power2.out' }
      );
      gsap.fromTo(ctaRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, delay: 1.1, ease: 'back.out(1.5)' }
      );
      gsap.to(logoRef.current, { y: -8, duration: 2.5, delay: 1.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to(logoRef.current, { rotation: 5, duration: 4, delay: 1.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen flex items-center justify-end overflow-hidden relative bg-white">
      {/* Speed lines — manga page feel */}
      <div className="absolute inset-0 manga-speedlines opacity-40 pointer-events-none" />

      {/* Impact flash (black ink splash) */}
      <div ref={bgFlashRef} className="absolute inset-0 bg-black pointer-events-none z-30" style={{ opacity: 0 }} />

      {/* Halftone */}
      <div className="absolute inset-0 manga-halftone opacity-15 pointer-events-none" />

      {/* Content — right-aligned */}
      <div className="relative z-10 flex flex-col items-end text-right pr-[8vw]" style={{ marginTop: '-4vh' }}>
        {/* Logo + Title */}
        <div className="flex items-center gap-5 mb-4">
          <div ref={logoRef} style={{ opacity: 0 }}>
            <Image
              src="/logo.png"
              alt="MangaMate"
              width={140}
              height={140}
              className="drop-shadow-[0_0_20px_rgba(0,0,0,0.3)]"
              priority
            />
          </div>
          <h1
            ref={titleRef}
            className="select-none leading-[0.9]"
            style={{
              fontSize: 'clamp(3rem, 9vw, 7rem)',
              opacity: 0,
              fontFamily: 'var(--font-manga)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#fff',
              WebkitTextStroke: '3px #111',
              paintOrder: 'stroke fill',
              textShadow: '4px 4px 0px #000',
            }}
          >
            MangaMate
          </h1>
        </div>

        {/* Ink line */}
        <div
          ref={lineRef}
          className="h-[3px] w-56"
          style={{ background: 'linear-gradient(to left, #111, transparent)' }}
        />

        {/* Subtitle */}
        <p
          ref={subtitleRef}
          className="text-[#666] text-base md:text-lg mt-5 max-w-md leading-relaxed"
          style={{ opacity: 0 }}
        >
          Transform your stories into{' '}
          <span className="text-[#111] manga-title text-xl md:text-2xl">cinematic trailers</span>
        </p>

        {/* CTA */}
        <div ref={ctaRef} className="mt-8" style={{ opacity: 0 }}>
          <Link
            href="/dashboard"
            className="manga-btn bg-[#111] text-white px-7 py-3 text-base flex items-center gap-2"
          >
            Get Started
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}
