'use client';

import { useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { ArrowRight } from 'lucide-react';
import { usePageTransition } from '@/components/PageTransition';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const LeafOverlay = dynamic(() => import('@/components/LeafOverlay'), { ssr: false });

const NOISE_DUR = '3.5s';
const NOISE_SPLINE = '0.1 0.6 0.3 1';

function NoiseMask({
  id,
  children,
  mode = 'reveal',
}: {
  id: string;
  children: React.ReactNode;
  mode?: 'reveal' | 'cover';
}) {
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
  const leavesRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const rightTreeRef = useRef<HTMLDivElement>(null);
  const holyRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const { navigate } = usePageTransition();
  const pathname = usePathname();

  useEffect(() => {
    // Reset all elements to hidden state before animating in
    gsap.set([logoRef.current, titleRef.current, subtitleRef.current, ctaRef.current], { opacity: 0 });
    gsap.set(lineRef.current, { scaleX: 0 });
    gsap.set(treeRef.current, { x: '-100%', opacity: 0 });
    gsap.set(rightTreeRef.current, { x: '100%', opacity: 0 });

    triggerNoise('video-reveal');

    const ctx = gsap.context(() => {
      // Left tree slides in from offscreen left
      gsap.fromTo(treeRef.current,
        { x: '-100%', opacity: 0 },
        { x: '0%', opacity: 1, duration: 1.8, delay: 0.4, ease: 'power2.out' }
      );

      // Right tree slides in from offscreen right
      gsap.fromTo(rightTreeRef.current,
        { x: '100%', opacity: 0 },
        { x: '0%', opacity: 1, duration: 1.8, delay: 0.4, ease: 'power2.out' }
      );

      // Holy glow — subtle white breathing in and out
      gsap.set(holyRef.current, { opacity: 0.1 });
      gsap.to(holyRef.current, {
        opacity: 0.25,
        duration: 4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });

      // Vignette — slow gentle pulse
      gsap.to(vignetteRef.current, {
        boxShadow: 'inset 0 0 120px 30px rgba(255,255,255,0.6)',
        duration: 5,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });

      // Leaves drop down from top
      gsap.fromTo(leavesRef.current,
        { y: '-100%', opacity: 0 },
        { y: '0%', opacity: 1, duration: 1.5, delay: 0.2, ease: 'power2.out' }
      );

      // Logo — much sooner
      gsap.fromTo(logoRef.current,
        { scale: 0.6, opacity: 0, rotation: -30 },
        { scale: 1, opacity: 1, rotation: 0, duration: 1.0, delay: 0.4, ease: 'power3.out' }
      );
      // Title
      gsap.fromTo(titleRef.current,
        { opacity: 0, x: 40 },
        { opacity: 1, x: 0, duration: 0.9, delay: 0.7, ease: 'power2.out' }
      );
      // Line
      gsap.fromTo(lineRef.current,
        { scaleX: 0, transformOrigin: 'right center' },
        { scaleX: 1, duration: 0.7, delay: 1.1, ease: 'power2.out' }
      );
      // Subtitle
      gsap.fromTo(subtitleRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.7, delay: 1.3, ease: 'power2.out' }
      );
      // CTA
      gsap.fromTo(ctaRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.6, delay: 1.6, ease: 'power2.out' }
      );
      // Idle float — bigger movement so it's clearly visible
      gsap.to(logoRef.current, { y: -18, duration: 2.5, delay: 2.0, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to(logoRef.current, { rotation: 10, duration: 4, delay: 2.0, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to(logoRef.current, { scale: 1.08, duration: 3, delay: 2.0, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });
    return () => ctx.revert();
  }, [pathname]);

  const handleGetStarted = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    navigate('/auth');
  };

  return (
    <div ref={containerRef} className="min-h-screen flex items-center justify-end overflow-hidden relative" style={{ background: `url('/hero-bg.png') center/cover no-repeat` }}>
      {/* Layer 1: Hero video — transparent VP9 WebM from main seq frames */}
      <div className="absolute inset-0 pointer-events-none z-[1]">
        <NoiseMask id="video-reveal" mode="reveal">
          <div className="w-full h-full">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ background: 'transparent' }}
            >
              <source src="/hero-bg.webm" type="video/webm" />
            </video>
          </div>
        </NoiseMask>
      </div>

      {/* Left tree overlay — slides in from left, shifted up */}
      <div
        ref={treeRef}
        className="absolute pointer-events-none z-[3]"
        style={{ opacity: 0, top: '-8%', left: 0, right: 0, bottom: 0 }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ background: 'transparent' }}
        >
          <source src="/left-tree.webm" type="video/webm" />
        </video>
      </div>

      {/* Right tree overlay — slides in from right */}
      <div
        ref={rightTreeRef}
        className="absolute pointer-events-none z-[3]"
        style={{ opacity: 0, top: '-8%', left: 0, right: 0, bottom: 0 }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ background: 'transparent' }}
        >
          <source src="/right-tree.webm" type="video/webm" />
        </video>
      </div>

      {/* Layer 3: Leaves on top of everything — drops from top */}
      <LeafOverlay ref={leavesRef} />

      {/* White vignette — soft edges, slowly pulsing */}
      <div
        ref={vignetteRef}
        className="absolute inset-0 pointer-events-none z-[7]"
        style={{
          boxShadow: 'inset 0 0 80px 15px rgba(255,255,255,0.4)',
        }}
      />

      {/* Holy white overlay — ethereal light wash */}
      <div
        ref={holyRef}
        className="fixed inset-0 w-screen h-screen pointer-events-none z-[6]"
        style={{
          opacity: 0,
          background: 'white',
        }}
      />

      {/* Content — right-aligned */}
      <div className="relative z-10 flex flex-col items-end text-right pr-[8vw]" style={{ marginTop: '-4vh' }}>
        {/* Logo + Title */}
        <div className="flex items-center gap-5 mb-1">
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

        {/* Line */}
        <div
          ref={lineRef}
          className="h-[2px] w-48 mt-1"
          style={{ background: 'linear-gradient(to left, #fff, transparent)' }}
        />

        {/* Subtitle */}
        <p
          ref={subtitleRef}
          className="text-base md:text-lg mt-2 max-w-md leading-relaxed select-none"
          style={{
            opacity: 0,
            fontFamily: 'var(--font-manga)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
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
          <button
            onClick={handleGetStarted}
            className="manga-btn bg-white text-[#111] border-white px-7 py-3 text-base flex items-center gap-2"
          >
            Get Started
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
