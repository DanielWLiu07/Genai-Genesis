'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import { Check, X } from 'lucide-react';

interface ImageCropperProps {
  src: string;
  aspect?: number;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

function centerAspectCrop(width: number, height: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 80 }, aspect, width, height),
    width,
    height,
  );
}

async function getCroppedDataUrl(image: HTMLImageElement, crop: PixelCrop): Promise<string> {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    image,
    crop.x * scaleX, crop.y * scaleY,
    crop.width * scaleX, crop.height * scaleY,
    0, 0,
    crop.width, crop.height,
  );
  return canvas.toDataURL('image/jpeg', 0.92);
}

export function ImageCropper({ src, aspect = 2 / 3, onConfirm, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, aspect));
  }, [aspect]);

  const handleConfirm = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return;
    const dataUrl = await getCroppedDataUrl(imgRef.current, completedCrop);
    onConfirm(dataUrl);
  }, [completedCrop, onConfirm]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="manga-panel bg-white w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#ccc]">
          <span className="manga-accent-bar text-xs">CROP THUMBNAIL</span>
          <button onClick={onCancel} className="text-[#888] hover:text-[#111] transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center gap-3 bg-[#111]">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspect}
          >
            <img
              ref={imgRef}
              src={src}
              alt="crop"
              style={{ maxHeight: '60vh', maxWidth: '100%', objectFit: 'contain' }}
              onLoad={onImageLoad}
            />
          </ReactCrop>
          <p className="text-[0.6rem] text-white/40 uppercase tracking-wider">
            Drag to reposition · drag corners to resize
          </p>
        </div>

        <div className="px-4 py-3 border-t-2 border-[#ccc] flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="manga-btn bg-white text-[#888] px-4 py-1.5 text-sm flex items-center gap-1.5"
          >
            <X size={13} /> Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="manga-btn bg-[#111] text-white px-4 py-1.5 text-sm flex items-center gap-1.5"
          >
            <Check size={13} /> Apply Crop
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
