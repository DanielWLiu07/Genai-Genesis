'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const TOTAL_FRAMES = 250;
const FPS = 24;

const LeafOverlay = forwardRef<HTMLDivElement>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<HTMLImageElement[]>([]);
  const frameIndex = useRef(0);
  const animRef = useRef<number>(0);
  const lastTime = useRef(0);
  const started = useRef(false);

  useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

  useEffect(() => {
    const frames: HTMLImageElement[] = [];
    let loaded = 0;

    function tryStart() {
      if (started.current) return;
      // Start as soon as we have at least half the frames
      if (loaded >= TOTAL_FRAMES / 2) {
        started.current = true;
        framesRef.current = frames;
        startAnimation();
      }
    }

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = `/leaves/${String(i).padStart(4, '0')}.webp`;
      img.onload = () => { loaded++; tryStart(); };
      img.onerror = () => { loaded++; tryStart(); };
      frames.push(img);
    }

    function startAnimation() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      // Match full resolution for crisp rendering
      const dpr = window.devicePixelRatio || 1;
      const w = 960;
      const h = 540;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      function draw(timestamp: number) {
        if (timestamp - lastTime.current >= 1000 / FPS) {
          lastTime.current = timestamp;
          ctx!.clearRect(0, 0, w, h);
          const frame = framesRef.current[frameIndex.current];
          if (frame && frame.complete && frame.naturalWidth > 0) {
            ctx!.drawImage(frame, 0, 0, w, h);
          }
          frameIndex.current = (frameIndex.current + 1) % TOTAL_FRAMES;
        }
        animRef.current = requestAnimationFrame(draw);
      }

      animRef.current = requestAnimationFrame(draw);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-[8]">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  );
});

LeafOverlay.displayName = 'LeafOverlay';
export default LeafOverlay;
