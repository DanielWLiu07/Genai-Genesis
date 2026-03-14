'use client';

import { useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import gsap from 'gsap';
import { ArrowRight } from 'lucide-react';

const NOISE_DUR = '3.5s';
const NOISE_SPLINE = '0.2 0.8 0.3 1';

function NoiseMask({
  id,
  children,
  mode = 'reveal',
}: {
  id: string;
  children: React.ReactNode;
  mode?: 'reveal' | 'cover';
}) {
  // reveal: base=black (hidden), animated rect=white (shows content)
  // cover:  base=white (visible), animated rect=black (hides content)
  const baseFill = mode === 'reveal' ? 'black' : 'white';
  const animFill = mode === 'reveal' ? 'white' : 'black';

  return (
    <svg
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 w-full h-full"
      style={{ willChange: 'transform, filter', transform: 'translateZ(0)' }}
      data-noise-svg={id}
    >
      <defs>
        <filter id={`noiseFilter-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="200" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" values="200;490" dur={NOISE_DUR} begin="indefinite" calcMode="spline" keySplines={NOISE_SPLINE} fill="freeze" />
          </feDisplacementMap>
        </filter>
        <mask id={`noiseMask-${id}`}>
          <rect x="0" y="0" width="100%" height="100%" fill={baseFill} />
          <rect x="50%" y="50%" width="0%" height="0%" fill={animFill} filter={`url(#noiseFilter-${id})`}>
            <animate attributeName="x" values="50%;-25%" dur={NOISE_DUR} begin="indefinite" calcMode="spline" keySplines={NOISE_SPLINE} fill="freeze" />
            <animate attributeName="y" values="50%;-25%" dur={NOISE_DUR} begin="indefinite" calcMode="spline" keySplines={NOISE_SPLINE} fill="freeze" />
            <animate attributeName="width" values="0%;150%" dur={NOISE_DUR} begin="indefinite" calcMode="spline" keySplines={NOISE_SPLINE} fill="freeze" />
            <animate attributeName="height" values="0%;150%" dur={NOISE_DUR} begin="indefinite" calcMode="spline" keySplines={NOISE_SPLINE} fill="freeze" />
          </rect>
        </mask>
      </defs>
      <foreignObject width="100%" height="100%" mask={`url(#noiseMask-${id})`}>
        {children}
      </foreignObject>
    </svg>
  );
}

function triggerNoise(id: string) {
  const svg = document.querySelector(`[data-noise-svg="${id}"]`);
  if (!svg) return;
  svg.querySelectorAll('animate').forEach((anim) => {
    (anim as SVGAnimateElement).beginElement();
  });
}

export default function LandingPage() {
  const logoRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger the video reveal noise animation on mount
    triggerNoise('video-reveal');

    const ctx = gsap.context(() => {
      // Content fades in ~2s into 3.5s noise reveal
      gsap.fromTo(logoRef.current,
        { scale: 0, opacity: 0, rotation: -180 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.5, delay: 1.8, ease: 'back.out(1.2)' }
      );
      gsap.fromTo(titleRef.current,
        { scale: 2, opacity: 0, y: -100, rotateZ: -3 },
        { scale: 1, opacity: 1, y: 0, rotateZ: 0, duration: 0.4, delay: 2.0, ease: 'power4.out' }
      );
      gsap.fromTo(containerRef.current,
        { x: 0, y: 0 },
        { x: 4, y: -2, duration: 0.03, delay: 2.2, yoyo: true, repeat: 5, ease: 'power2.inOut' }
      );
      gsap.fromTo(lineRef.current,
        { scaleX: 0, transformOrigin: 'center' },
        { scaleX: 1, duration: 0.3, delay: 2.3, ease: 'power3.out' }
      );
      gsap.fromTo(subtitleRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, delay: 2.5, ease: 'power2.out' }
      );
      gsap.fromTo(ctaRef.current,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, delay: 2.7, ease: 'back.out(1.5)' }
      );
      // Idle float
      gsap.to(logoRef.current, { y: -8, duration: 2.5, delay: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to(logoRef.current, { rotation: 5, duration: 4, delay: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen flex items-center justify-end overflow-hidden relative bg-[#f5f0e8]">
      {/* Background video with noise reveal */}
      <div className="absolute inset-0 pointer-events-none">
        <NoiseMask id="video-reveal" mode="reveal">
          <div className="w-full h-full">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            >
              <source src="/bg-video.mp4" type="video/mp4" />
            </video>
          </div>
        </NoiseMask>
      </div>

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
              textTransform: 'uppercase' as const,
              color: '#fff',
              WebkitTextStroke: '3px #111',
              paintOrder: 'stroke fill',
              textShadow: '4px 4px 0px #000',
            }}
          >
            MangaMate
          </h1>
        </div>

        {/* Line */}
        <div
          ref={lineRef}
          className="h-[3px] w-56"
          style={{ background: 'linear-gradient(to left, #fff, transparent)' }}
        />

        {/* Subtitle */}
        <p
          ref={subtitleRef}
          className="text-base md:text-lg mt-5 max-w-md leading-relaxed select-none"
          style={{
            opacity: 0,
            fontFamily: 'var(--font-manga)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
            color: '#fff',
            WebkitTextStroke: '1.5px #111',
            paintOrder: 'stroke fill',
            textShadow: '3px 3px 0px #000',
          }}
        >
          Transform your stories into cinematic trailers
        </p>

        {/* CTA */}
        <div ref={ctaRef} className="mt-8" style={{ opacity: 0 }}>
          <Link
            href="/dashboard"
            className="manga-btn bg-white text-[#111] border-white px-7 py-3 text-base flex items-center gap-2"
          >
            Get Started
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}
