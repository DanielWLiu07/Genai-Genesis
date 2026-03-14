'use client';

import {
  createContext, useContext, useRef, useCallback,
  ReactNode, useEffect, useLayoutEffect, MouseEvent,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import NextLink from 'next/link';
import Image from 'next/image';
import gsap from 'gsap';

interface TransitionCtx {
  navigate: (href: string) => void;
}

const TransitionContext = createContext<TransitionCtx>({ navigate: () => {} });

export function usePageTransition() {
  return useContext(TransitionContext);
}

// ── Diagonal slash wipe ─────────────────────────────────────────
const DIAG = 40;
const poly = (l: number, r: number) =>
  `polygon(${l}% 0%, ${r}% 0%, ${r - DIAG}% 100%, ${l - DIAG}% 100%)`;
const HIDDEN_LEFT  = poly(-DIAG, -DIAG);
const FULL         = poly(-DIAG, 100 + DIAG);
const HIDDEN_RIGHT = poly(100 + DIAG, 100 + DIAG);
// ────────────────────────────────────────────────────────────────

const LETTERS = 'MANGAMATE'.split('');

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const router     = useRouter();
  const pathname   = usePathname();
  const overlayRef   = useRef<HTMLDivElement>(null);
  const logoRef      = useRef<HTMLDivElement>(null);
  const glowRef      = useRef<HTMLDivElement>(null);
  const leftTreeRef  = useRef<HTMLDivElement>(null);
  const rightTreeRef = useRef<HTMLDivElement>(null);
  const letterRefs   = useRef<(HTMLSpanElement | null)[]>([]);
  const isAnimating  = useRef(false);
  const isMounted    = useRef(false);

  // Init GSAP state before first paint — React never owns these props
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    gsap.set(overlay, { opacity: 0, clipPath: HIDDEN_LEFT, pointerEvents: 'none' });
    // Hide logo + letters initially
    if (logoRef.current)    gsap.set(logoRef.current, { opacity: 0, scale: 0.2, rotation: -25, y: 20 });
    if (glowRef.current)    gsap.set(glowRef.current, { opacity: 0, scale: 0.5 });
    if (leftTreeRef.current)  gsap.set(leftTreeRef.current, { x: '-100%', opacity: 0 });
    if (rightTreeRef.current) gsap.set(rightTreeRef.current, { x: '100%', opacity: 0 });
    letterRefs.current.forEach((el) => {
      if (el) gsap.set(el, { opacity: 0, y: -60, rotation: () => Math.random() * 40 - 20 });
    });
  }, []);

  // ── Animate logo + letters IN ──────────────────────────────────
  // Total duration ~0.48s so reveal delay can be set to match
  const animateIn = useCallback(() => {
    const logo    = logoRef.current;
    const glow    = glowRef.current;
    const letters = letterRefs.current.filter(Boolean) as HTMLSpanElement[];

    if (logo) {
      gsap.fromTo(logo,
        { opacity: 0, scale: 0.15, rotation: -30, y: 30 },
        { opacity: 1, scale: 1.15, rotation: 0, y: 0, duration: 0.22, delay: 0.05, ease: 'back.out(2)',
          onComplete: () => { gsap.to(logo, { scale: 1, duration: 0.1, ease: 'power2.inOut' }); },
        }
      );
    }

    if (glow) {
      gsap.fromTo(glow,
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1.4, duration: 0.15, delay: 0.2, ease: 'power2.out',
          onComplete: () => { gsap.to(glow, { opacity: 0, scale: 2, duration: 0.2, ease: 'power2.in' }); },
        }
      );
    }

    // Trees slide in from sides
    if (leftTreeRef.current) {
      gsap.fromTo(leftTreeRef.current,
        { x: '-100%', opacity: 0 },
        { x: '0%', opacity: 1, duration: 0.4, delay: 0.05, ease: 'power3.out' }
      );
    }
    if (rightTreeRef.current) {
      gsap.fromTo(rightTreeRef.current,
        { x: '100%', opacity: 0 },
        { x: '0%', opacity: 1, duration: 0.4, delay: 0.05, ease: 'power3.out' }
      );
    }

    // Letters crash in — stagger 0.03s each, last letter lands at 0.08 + 8×0.03 + 0.18 = ~0.5s
    letters.forEach((el, i) => {
      const startRot = (Math.random() * 36 - 18);
      gsap.fromTo(el,
        { opacity: 0, y: -70, rotation: startRot, scale: 1.3 },
        { opacity: 1, y: 0, rotation: 0, scale: 1, duration: 0.18, delay: 0.08 + i * 0.03,
          ease: 'power3.out',
          onComplete: () => { gsap.to(el, { scaleY: 0.88, scaleX: 1.1, duration: 0.06, yoyo: true, repeat: 1, ease: 'power1.inOut' }); },
        }
      );
    });
  }, []);

  // ── Animate logo + letters OUT (called when overlay sweeps away) ──
  const animateOut = useCallback(() => {
    const logo    = logoRef.current;
    const glow    = glowRef.current;
    const letters = letterRefs.current.filter(Boolean) as HTMLSpanElement[];

    if (logo) gsap.to(logo, { scale: 2.5, opacity: 0, rotation: 15, duration: 0.32, ease: 'power2.in' });
    if (glow) gsap.set(glow, { opacity: 0 });
    if (leftTreeRef.current)  gsap.to(leftTreeRef.current, { x: '-100%', opacity: 0, duration: 0.3, ease: 'power2.in' });
    if (rightTreeRef.current) gsap.to(rightTreeRef.current, { x: '100%', opacity: 0, duration: 0.3, ease: 'power2.in' });

    letters.forEach((el, i) => {
      gsap.to(el, {
        x: 80 + i * 15,
        opacity: 0,
        rotation: (Math.random() * 30 - 15),
        duration: 0.22,
        delay: i * 0.03,
        ease: 'power2.in',
        onComplete: () => { gsap.set(el, { x: 0 }); },
      });
    });
  }, []);

  // ── Reveal: sweep panel right, animate content out ──────────────
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }

    const overlay = overlayRef.current;
    if (!overlay) return;

    gsap.killTweensOf(overlay);
    gsap.set(overlay, { opacity: 1, clipPath: FULL, pointerEvents: 'all' });

    // Kill any in-progress animateIn tweens and snap elements to fully visible
    // so animateOut always starts from a clean, visible state — prevents race
    // condition where fast page load fires reveal before animateIn completes.
    const logo = logoRef.current;
    const glow = glowRef.current;
    if (logo) { gsap.killTweensOf(logo); gsap.set(logo, { opacity: 1, scale: 1, rotation: 0, y: 0, x: 0 }); }
    if (glow) { gsap.killTweensOf(glow); gsap.set(glow, { opacity: 0 }); }
    letterRefs.current.forEach((el) => {
      if (el) { gsap.killTweensOf(el); gsap.set(el, { opacity: 1, y: 0, x: 0, rotation: 0, scale: 1, scaleX: 1, scaleY: 1 }); }
    });

    // Animate content out, then sweep panel right
    animateOut();
    gsap.to(overlay, {
      clipPath: HIDDEN_RIGHT,
      duration: 0.55,
      delay: 0.55,
      ease: 'power3.out',
      onComplete: () => {
        gsap.set(overlay, { pointerEvents: 'none', opacity: 0, clipPath: HIDDEN_LEFT });
        // Reset logo + letters for next transition
        if (logoRef.current) gsap.set(logoRef.current, { opacity: 0, scale: 0.2, rotation: -25, y: 20, x: 0 });
        if (glowRef.current) gsap.set(glowRef.current, { opacity: 0, scale: 0.5 });
        if (leftTreeRef.current)  gsap.set(leftTreeRef.current, { x: '-100%', opacity: 0 });
        if (rightTreeRef.current) gsap.set(rightTreeRef.current, { x: '100%', opacity: 0 });
        letterRefs.current.forEach((el) => {
          if (el) gsap.set(el, { opacity: 0, y: -60, x: 0, rotation: 0, scale: 1, scaleX: 1, scaleY: 1 });
        });
        isAnimating.current = false;
      },
    });
  }, [pathname, animateOut]);

  // ── Cover: sweep in from left, animate content in ───────────────
  const navigate = useCallback(
    (href: string) => {
      if (isAnimating.current) return;
      isAnimating.current = true;

      const overlay = overlayRef.current;
      if (!overlay) { router.push(href); return; }

      gsap.killTweensOf(overlay);
      gsap.set(overlay, { opacity: 1, clipPath: HIDDEN_LEFT, pointerEvents: 'all' });

      // Sweep panel across
      gsap.to(overlay, {
        clipPath: FULL,
        duration: 0.28,
        ease: 'power4.in',
        onComplete: () => {
          animateIn();
          router.push(href);
        },
      });
    },
    [router, animateIn],
  );

  return (
    <TransitionContext.Provider value={{ navigate }}>
      {children}

      <div
        ref={overlayRef}
        className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
        style={{ background: '#fff' }}
      >
        {/* ── Bold radiating speedlines ─────────────────────── */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="htdots-tr" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="4" cy="4" r="1.2" fill="#111" opacity="0.1" />
            </pattern>
            <radialGradient id="vignette" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0" />
              <stop offset="100%" stopColor="#111" stopOpacity="0.06" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#htdots-tr)" />
          <rect width="100%" height="100%" fill="url(#vignette)" />

          {/* Diagonal slash lines (match wipe angle) */}
          {Array.from({ length: 28 }).map((_, i) => {
            const y = ((i + 0.5) / 28) * 100;
            const yEnd = y + DIAG * 0.45;
            const thick = i % 7 === 0 ? 3 : i % 3 === 0 ? 1.5 : 0.5;
            const op    = i % 7 === 0 ? 0.18 : i % 3 === 0 ? 0.1 : 0.05;
            return (
              <line key={i} x1="0%" y1={`${y}%`} x2="100%" y2={`${yEnd}%`}
                stroke="#111" strokeWidth={thick} opacity={op} />
            );
          })}

          {/* Radial burst lines from center */}
          {Array.from({ length: 32 }).map((_, i) => {
            const angle = (i / 32) * 360;
            const rad   = (angle * Math.PI) / 180;
            const x1 = (50 + Math.cos(rad) * 4).toFixed(2);
            const y1 = (50 + Math.sin(rad) * 4).toFixed(2);
            const x2 = (50 + Math.cos(rad) * 75).toFixed(2);
            const y2 = (50 + Math.sin(rad) * 75).toFixed(2);
            const thick = i % 8 === 0 ? 2.5 : i % 4 === 0 ? 1.2 : 0.4;
            const op    = i % 8 === 0 ? 0.14 : i % 4 === 0 ? 0.08 : 0.04;
            return (
              <line key={`r${i}`} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
                stroke="#111" strokeWidth={thick} opacity={op} />
            );
          })}
        </svg>

        {/* ── Tree overlays ─────────────────────────────────── */}
        <div ref={leftTreeRef} className="absolute inset-0 pointer-events-none" style={{ opacity: 0 }}>
          <video autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ background: 'transparent' }}>
            <source src="/left-tree.webm" type="video/webm" />
          </video>
        </div>
        <div ref={rightTreeRef} className="absolute inset-0 pointer-events-none" style={{ opacity: 0 }}>
          <video autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ background: 'transparent' }}>
            <source src="/right-tree.webm" type="video/webm" />
          </video>
        </div>

        {/* ── Violet glow burst ─────────────────────────────── */}
        <div
          ref={glowRef}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div
            className="rounded-full"
            style={{
              width: '340px',
              height: '340px',
              background: 'radial-gradient(circle, rgba(168,85,247,0.35) 0%, rgba(168,85,247,0.12) 40%, transparent 70%)',
              filter: 'blur(12px)',
            }}
          />
        </div>

        {/* ── Logo + wordmark (same row) ────────────────────── */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div ref={logoRef} className="relative shrink-0">
              <Image
                src="/logo.png"
                alt="MangaMate"
                width={88}
                height={88}
                className="drop-shadow-[0_0_24px_rgba(168,85,247,0.5)]"
              />
              <div className="absolute inset-[-16px] rounded-full border-[3px] border-[#a855f7]/20" />
              <div className="absolute inset-[-28px] rounded-full border border-[#a855f7]/10" />
            </div>

            {/* MANGAMATE letters */}
            <div className="flex items-center gap-[0.02em]" style={{ fontFamily: 'var(--font-manga)' }}>
              {LETTERS.map((char, i) => (
                <span
                  key={i}
                  ref={(el) => { letterRefs.current[i] = el; }}
                  className="inline-block select-none"
                  style={{
                    fontSize: 'clamp(2.2rem, 6vw, 4.5rem)',
                    color: '#fff',
                    WebkitTextStroke: '2px #111',
                    paintOrder: 'stroke fill',
                    textShadow: '4px 4px 0px #000',
                    lineHeight: 1,
                  }}
                >
                  {char}
                </span>
              ))}
            </div>
          </div>

          {/* Tagline */}
          <div
            className="text-[0.65rem] text-[#999] uppercase tracking-[0.3em] select-none"
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            AI Book Trailer Generator
          </div>
        </div>
      </div>
    </TransitionContext.Provider>
  );
}

// ── TransitionLink ───────────────────────────────────────────────
interface TransitionLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
  className?: string;
}

export function TransitionLink({ href, children, className, onClick, ...rest }: TransitionLinkProps) {
  const { navigate } = usePageTransition();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onClick?.(e);
    navigate(href);
  };

  return (
    <NextLink href={href} className={className} onClick={handleClick} {...rest}>
      {children}
    </NextLink>
  );
}
