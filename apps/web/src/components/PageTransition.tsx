'use client';

import {
  createContext, useContext, useRef, useCallback,
  ReactNode, useEffect, MouseEvent,
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

// ── Diagonal slash wipe ────────────────────────────────────────
// The overlay is a parallelogram whose TOP edge leads the BOTTOM edge
// by DIAG % of the viewport width, creating a clear "/" lean.
//
//  navigate() called → cover:  HIDDEN_LEFT  ──▶ FULL
//  pathname changes  → reveal: FULL         ──▶ HIDDEN_RIGHT
//
const DIAG = 40; // steepness of the "/" slash

// polygon(TL, TR, BR, BL) — "/" parallelogram
const poly = (l: number, r: number) =>
  `polygon(${l}% 0%, ${r}% 0%, ${r - DIAG}% 100%, ${l - DIAG}% 100%)`;

const HIDDEN_LEFT  = poly(-DIAG, -DIAG);           // zero-width, off-screen left
const FULL         = poly(-DIAG, 100 + DIAG);      // covers full viewport
const HIDDEN_RIGHT = poly(100 + DIAG, 100 + DIAG); // zero-width, off-screen right
// ──────────────────────────────────────────────────────────────

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const overlayRef = useRef<HTMLDivElement>(null);
  const isAnimating = useRef(false);
  const isMounted = useRef(false);

  // ── Reveal: new page ready → sweep panel out to the right ────
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }

    const overlay = overlayRef.current;
    if (!overlay) return;

    // Always start from FULL to handle both navigate() and <Link> navigations
    gsap.killTweensOf(overlay);
    gsap.set(overlay, { opacity: 1, clipPath: FULL, pointerEvents: 'all' });
    gsap.to(overlay, {
      clipPath: HIDDEN_RIGHT,
      duration: 0.5,
      delay: 0.05,
      ease: 'power3.out',
      onComplete: () => {
        gsap.set(overlay, { pointerEvents: 'none', opacity: 0, clipPath: HIDDEN_LEFT });
        isAnimating.current = false;
      },
    });
  }, [pathname]);

  // ── Cover: sweep panel in from the left, then push route ─────
  const navigate = useCallback(
    (href: string) => {
      if (isAnimating.current) return;
      isAnimating.current = true;

      const overlay = overlayRef.current;
      if (!overlay) { router.push(href); return; }

      gsap.killTweensOf(overlay);
      gsap.set(overlay, { opacity: 1, clipPath: HIDDEN_LEFT, pointerEvents: 'all' });
      gsap.to(overlay, {
        clipPath: FULL,
        duration: 0.42,
        ease: 'power3.in',          // fast slam — visible from first frame
        onComplete: () => router.push(href),
      });
    },
    [router],
  );

  return (
    <TransitionContext.Provider value={{ navigate }}>
      {children}

      <div
        ref={overlayRef}
        className="fixed inset-0 z-[9999] pointer-events-none"
        style={{ opacity: 0, background: '#fff', clipPath: HIDDEN_LEFT }}
      >
        {/* Halftone dots */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="htdots-tr" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="4" cy="4" r="1.5" fill="#111" opacity="0.12" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#htdots-tr)" />
          {/* Speed lines angled to echo the "/" slash */}
          {Array.from({ length: 20 }).map((_, i) => {
            const y = ((i + 0.5) / 20) * 100;
            const yEnd = y + DIAG * 0.4;
            const strokeW = i % 6 === 0 ? 2.5 : i % 3 === 0 ? 1.2 : 0.4;
            return (
              <line
                key={i}
                x1="0%" y1={`${y}%`}
                x2="100%" y2={`${yEnd}%`}
                stroke="#111" strokeWidth={strokeW} opacity="0.08"
              />
            );
          })}
        </svg>

        {/* Logo left of wordmark */}
        <div className="absolute inset-0 flex items-center justify-center gap-4">
          <Image
            src="/logo.png"
            alt="MangaMate"
            width={72}
            height={72}
            className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          />
          <div
            className="select-none text-[#111]/20"
            style={{
              fontFamily: 'var(--font-manga)',
              fontSize: 'clamp(1.5rem, 4vw, 3rem)',
              letterSpacing: '0.12em',
            }}
          >
            MANGAMATE
          </div>
        </div>
      </div>
    </TransitionContext.Provider>
  );
}

// ── TransitionLink ─────────────────────────────────────────────
// Drop-in replacement for next/link that plays the cover animation
// before navigating.  Use everywhere instead of <Link>.
interface TransitionLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
  className?: string;
}

export function TransitionLink({ href, children, className, onClick, ...rest }: TransitionLinkProps) {
  const { navigate } = usePageTransition();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let modifier-key clicks (open in new tab, etc.) pass through normally
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
