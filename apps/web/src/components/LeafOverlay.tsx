'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const TOTAL_FRAMES = 84;
const FPS = 8;

const LeafOverlay = forwardRef<HTMLDivElement>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<HTMLImageElement[]>([]);
  const frameIndex = useRef(0);
  const animRef = useRef<number>(0);
  const lastTime = useRef(0);

  useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

  useEffect(() => {
    // Preload all frames
    const frames: HTMLImageElement[] = [];
    let loaded = 0;

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = `/leaves/${String(i).padStart(4, '0')}.webp`;
      img.onload = () => {
        loaded++;
        if (loaded === TOTAL_FRAMES) {
          framesRef.current = frames;
          startAnimation();
        }
      };
      frames.push(img);
    }

    function startAnimation() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 960;
      canvas.height = 540;

      function draw(timestamp: number) {
        if (timestamp - lastTime.current >= 1000 / FPS) {
          lastTime.current = timestamp;
          ctx!.clearRect(0, 0, 960, 540);
          const frame = framesRef.current[frameIndex.current];
          if (frame) ctx!.drawImage(frame, 0, 0, 960, 540);
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
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-[5]" style={{ opacity: 0 }}>
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
