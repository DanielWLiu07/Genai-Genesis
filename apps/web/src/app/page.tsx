'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { setLocalAuth } from '@/lib/local-auth';
import { supabase } from '@/lib/supabase';

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
  const logoRef      = useRef<HTMLDivElement>(null);
  const titleRef     = useRef<HTMLHeadingElement>(null);
  const lineRef      = useRef<HTMLDivElement>(null);
  const subtitleRef  = useRef<HTMLParagraphElement>(null);
  const ctaRef       = useRef<HTMLDivElement>(null);
  const contentRef   = useRef<HTMLDivElement>(null);
  const leavesRef    = useRef<HTMLDivElement>(null);
  const treeRef      = useRef<HTMLDivElement>(null);
  const rightTreeRef = useRef<HTMLDivElement>(null);
  const holyRef      = useRef<HTMLDivElement>(null);
  const vignetteRef  = useRef<HTMLDivElement>(null);
  const authPanelRef = useRef<HTMLDivElement>(null);
  const pathname     = usePathname();
  const router       = useRouter();

  // Auth form state
  const [authOpen,         setAuthOpen]         = useState(false);
  const [authMode,         setAuthMode]         = useState<'login' | 'signup'>('login');
  const [email,            setEmail]            = useState('');
  const [password,         setPassword]         = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [success,          setSuccess]          = useState<string | null>(null);

  // ── Intro animation ───────────────────────────────────────────────────
  useEffect(() => {
    gsap.set([logoRef.current, titleRef.current, subtitleRef.current, ctaRef.current], { opacity: 0 });
    gsap.set(lineRef.current, { scaleX: 0 });
    gsap.set(treeRef.current, { x: '-100%', opacity: 0 });
    gsap.set(rightTreeRef.current, { x: '100%', opacity: 0 });
    // Auth panel starts off-screen right
    gsap.set(authPanelRef.current, { x: '100%' });

    triggerNoise('video-reveal');

    const ctx = gsap.context(() => {
      gsap.fromTo(treeRef.current,
        { x: '-100%', opacity: 0 },
        { x: '0%', opacity: 1, duration: 1.8, delay: 0.4, ease: 'power2.out' }
      );
      gsap.fromTo(rightTreeRef.current,
        { x: '100%', opacity: 0 },
        { x: '0%', opacity: 1, duration: 1.8, delay: 0.4, ease: 'power2.out' }
      );
      gsap.set(holyRef.current, { opacity: 0.1 });
      gsap.to(holyRef.current, { opacity: 0.25, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.to(vignetteRef.current, {
        boxShadow: 'inset 0 0 120px 30px rgba(255,255,255,0.6)',
        duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1,
      });
      gsap.fromTo(leavesRef.current,
        { y: '-100%', opacity: 0 },
        { y: '0%', opacity: 1, duration: 1.5, delay: 0.2, ease: 'power2.out' }
      );
      gsap.fromTo(logoRef.current,
        { scale: 0.6, opacity: 0, rotation: -30 },
        { scale: 1, opacity: 1, rotation: 0, duration: 1.0, delay: 0.4, ease: 'power3.out' }
      );
      gsap.fromTo(titleRef.current,
        { opacity: 0, x: 40 },
        { opacity: 1, x: 0, duration: 0.9, delay: 0.7, ease: 'power2.out' }
      );
      gsap.fromTo(lineRef.current,
        { scaleX: 0, transformOrigin: 'right center' },
        { scaleX: 1, duration: 0.7, delay: 1.1, ease: 'power2.out' }
      );
      gsap.fromTo(subtitleRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.7, delay: 1.3, ease: 'power2.out' }
      );
      gsap.fromTo(ctaRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.6, delay: 1.6, ease: 'power2.out' }
      );
      gsap.to(logoRef.current, { y: -18, duration: 2.5, delay: 2.0, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to(logoRef.current, { rotation: 10, duration: 4, delay: 2.0, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to(logoRef.current, { scale: 1.08, duration: 3, delay: 2.0, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });
    return () => ctx.revert();
  }, [pathname]);

  // ── Open auth panel ───────────────────────────────────────────────────
  const openAuth = () => {
    setAuthOpen(true);
    setError(null);
    setSuccess(null);
    // Slide landing content down and out
    gsap.to(contentRef.current, {
      y: 60, opacity: 0, duration: 0.45, ease: 'power2.in',
      onComplete: () => { gsap.set(contentRef.current, { pointerEvents: 'none' }); },
    });
    // Slide auth panel in from right
    gsap.fromTo(authPanelRef.current,
      { x: '100%' },
      { x: '0%', duration: 0.5, ease: 'power3.out' }
    );
  };

  // ── Close auth panel ──────────────────────────────────────────────────
  const closeAuth = () => {
    gsap.to(authPanelRef.current, {
      x: '100%', duration: 0.4, ease: 'power2.in',
      onComplete: () => setAuthOpen(false),
    });
    gsap.to(contentRef.current, {
      y: 0, opacity: 1, duration: 0.45, delay: 0.1, ease: 'power2.out',
      onStart: () => { gsap.set(contentRef.current, { pointerEvents: 'auto' }); },
    });
  };

  // ── Auth submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email.trim() || !password.trim()) { setError('Please enter both email and password.'); return; }
    if (authMode === 'signup' && password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      if (authMode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (authError) { setError(authError.message); return; }
        if (data.session) { setLocalAuth(email.trim()); router.replace('/dashboard'); }
        else { setSuccess('Check your email to confirm your account, then log in.'); setAuthMode('login'); }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) { setError(authError.message); return; }
        if (data.session) { setLocalAuth(email.trim()); router.replace('/dashboard'); }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-end overflow-hidden relative" style={{ background: `url('/hero-bg.png') center/cover no-repeat` }}>
      {/* Hero video */}
      <div className="absolute inset-0 pointer-events-none z-[1]">
        <NoiseMask id="video-reveal" mode="reveal">
          <div className="w-full h-full">
            <video autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ background: 'transparent' }}>
              <source src="/hero-bg.webm" type="video/webm" />
            </video>
          </div>
        </NoiseMask>
      </div>

      {/* Left tree */}
      <div ref={treeRef} className="absolute pointer-events-none z-[3]" style={{ opacity: 0, top: '-8%', left: 0, right: 0, bottom: 0 }}>
        <video autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ background: 'transparent' }}>
          <source src="/left-tree.webm" type="video/webm" />
        </video>
      </div>

      {/* Right tree */}
      <div ref={rightTreeRef} className="absolute pointer-events-none z-[3]" style={{ opacity: 0, top: '-8%', left: 0, right: 0, bottom: 0 }}>
        <video autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ background: 'transparent' }}>
          <source src="/right-tree.webm" type="video/webm" />
        </video>
      </div>

      {/* Leaves */}
      <LeafOverlay ref={leavesRef} />

      {/* Vignette */}
      <div ref={vignetteRef} className="absolute inset-0 pointer-events-none z-[7]" style={{ boxShadow: 'inset 0 0 80px 15px rgba(255,255,255,0.4)' }} />

      {/* Holy glow */}
      <div ref={holyRef} className="fixed inset-0 w-screen h-screen pointer-events-none z-[6]" style={{ opacity: 0, background: 'white' }} />

      {/* Landing content — slides down when auth opens */}
      <div ref={contentRef} className="relative z-10 flex flex-col items-end text-right pr-[8vw]" style={{ marginTop: '-4vh' }}>
        <div className="flex items-center gap-5 mb-1">
          <div ref={logoRef} style={{ opacity: 0 }}>
            <Image src="/logo.png" alt="Lotus" width={140} height={140} className="drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]" priority />
          </div>
          <h1
            ref={titleRef}
            className="select-none leading-[0.9]"
            style={{
              fontSize: 'clamp(3rem, 9vw, 7rem)', opacity: 0,
              fontFamily: 'var(--font-manga)', letterSpacing: '0.05em', textTransform: 'uppercase',
              color: '#fff', WebkitTextStroke: '3px #111', paintOrder: 'stroke fill', textShadow: '4px 4px 0px #ff3fa4, 6px 6px 0px #c0005e',
            }}
          >
            Lotus
          </h1>
        </div>
        <div ref={lineRef} className="h-[2px] w-48 mt-1" style={{ background: 'linear-gradient(to left, #fff, transparent)' }} />
        <p
          ref={subtitleRef}
          className="text-base md:text-lg mt-2 max-w-md leading-relaxed select-none"
          style={{
            opacity: 0, fontFamily: 'var(--font-manga)', letterSpacing: '0.04em', textTransform: 'uppercase',
            color: '#fff', WebkitTextStroke: '1.5px #111', paintOrder: 'stroke fill', textShadow: '3px 3px 0px #000',
          }}
        >
          Transform your stories into cinematic trailers
        </p>
        <div ref={ctaRef} className="mt-8" style={{ opacity: 0 }}>
          <button onClick={openAuth} className="manga-btn bg-white text-[#111] border-white px-7 py-3 text-base flex items-center gap-2">
            Get Started
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Auth panel — slides in from right ─────────────────────────── */}
      <div
        ref={authPanelRef}
        className="absolute top-0 right-0 h-full w-[360px] z-20 flex flex-col"
        style={{
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(16px)',
          borderLeft: '3px solid #111',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
          transform: 'translateX(100%)',
        }}
      >
        {/* Close button */}
        <button
          onClick={closeAuth}
          className="absolute top-5 right-5 text-[#777] hover:text-[#111] transition-colors z-10"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Panel content */}
        <div className="flex flex-col flex-1 overflow-y-auto px-8 py-10">
          {/* Branding */}
          <div className="mb-8">
            <p className="text-2xl font-black tracking-[0.12em] leading-none text-[#111]" style={{ fontFamily: 'var(--font-manga)', textShadow: '2px 2px 0px #ff3fa4' }}>
              LOTUS
            </p>
            <div className="h-[2px] w-12 bg-[#ff3fa4] mt-2" />
          </div>

          {/* Title */}
          <div className="mb-7 border-b-2 border-[#111] pb-5">
            <h2 className="manga-title text-3xl text-[#111] leading-none">
              {authMode === 'login' ? 'Log In' : 'Sign Up'}
            </h2>
            <p className="text-[#666] mt-1.5 text-sm">
              {authMode === 'login' ? 'Welcome back.' : 'Create your account.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 flex-1">
            <div>
              <label className="manga-accent-bar text-[0.65rem] mb-2 block tracking-widest uppercase text-[#555]">Email</label>
              <input
                type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="manga-input w-full text-sm"
                required
              />
            </div>
            <div>
              <label className="manga-accent-bar text-[0.65rem] mb-2 block tracking-widest uppercase text-[#555]">Password</label>
              <input
                type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="manga-input w-full text-sm"
                required
              />
            </div>
            {authMode === 'signup' && (
              <div>
                <label className="manga-accent-bar text-[0.65rem] mb-2 block tracking-widest uppercase text-[#555]">Confirm Password</label>
                <input
                  type="password" autoComplete="new-password"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="manga-input w-full text-sm"
                  required
                />
              </div>
            )}

            {error   && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2">{success}</p>}

            <button
              type="submit" disabled={loading}
              className="manga-btn w-full bg-[#111] text-white py-3 px-6 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Please wait...' : authMode === 'login' ? 'Log In' : 'Create Account'}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#e0e0e0]" />
              <span className="text-[0.65rem] text-[#aaa] tracking-wider">OR</span>
              <div className="flex-1 h-px bg-[#e0e0e0]" />
            </div>

            <button
              type="button"
              onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setError(null); setSuccess(null); }}
              className="w-full text-xs text-[#666] hover:text-[#111] transition-colors border-2 border-[#ddd] hover:border-[#111] py-2.5 px-4"
            >
              {authMode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </button>
          </form>

          <p className="text-[0.6rem] text-[#aaa] mt-8 tracking-wider text-center">
            By continuing you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}
