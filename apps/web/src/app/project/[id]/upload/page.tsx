'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Upload, FileText, Image as ImageIcon,
  Users, X, Plus, Trash2, Music, BookOpen, Layers, CheckCircle2,
  Loader2,
} from 'lucide-react';
import { TransitionLink as Link } from '@/components/PageTransition';
import NextImage from 'next/image';
import * as Tabs from '@radix-ui/react-tabs';
import { useProjectStore, type CharacterEntry } from '@/stores/project-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { api } from '@/lib/api';
import gsap from 'gsap';

type InputMode = 'text' | 'manga';

export default function UploadPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  // ── Input mode (mutually exclusive) ──
  const [inputMode, setInputMode] = useState<InputMode>('text');

  // Story text state
  const [storyText, setStoryText] = useState('');
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [textUploaded, setTextUploaded] = useState(false);
  const [activeTab, setActiveTab] = useState('story');

  // Manga state
  const [mangaFiles, setMangaFiles] = useState<File[]>([]);
  const [mangaUploading, setMangaUploading] = useState(false);
  const [mangaResult, setMangaResult] = useState<any>(null);
  const [mangaError, setMangaError] = useState<string | null>(null);
  const [mangaDragging, setMangaDragging] = useState(false);
  const mangaInputRef = useRef<HTMLInputElement>(null);

  // Audio state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDragging, setAudioDragging] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioAnalysis, setAudioAnalysis] = useState<Record<string, any> | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Images state (text mode only)
  const [images, setImages] = useState<{ id: string; file: File; url: string; description: string }[]>([]);
  const [prevImageCount, setPrevImageCount] = useState(0);

  // Characters state
  const [characters, setCharacters] = useState<(CharacterEntry & { imageFile?: File })[]>([]);
  const [prevCharCount, setPrevCharCount] = useState(0);

  // Store
  const { addCharacter, addUploadedImage, currentProject } = useProjectStore();
  const { setClips } = useTimelineStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Restore previously saved content on mount ──
  useEffect(() => {
    if (!currentProject || currentProject.id !== id) return;

    if (currentProject.book_text) {
      setStoryText(currentProject.book_text);
      setTextUploaded(true);
    }
    if (currentProject.characters?.length) {
      setCharacters(currentProject.characters.map((c: any) => ({
        id: c.id || crypto.randomUUID(),
        name: c.name || '',
        description: c.description || '',
        reference_image_url: c.reference_image_url,
      })));
    }
    if ((currentProject as any).audio_analysis) {
      setAudioAnalysis((currentProject as any).audio_analysis as Record<string, any>);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // GSAP refs
  const pageRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const imageDropzoneRef = useRef<HTMLDivElement>(null);

  // ── GSAP: Mount animations ──
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (headerRef.current) {
        gsap.fromTo(headerRef.current,
          { opacity: 0, y: -30 },
          { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
        );
      }
      if (tabListRef.current) {
        const tabs = tabListRef.current.querySelectorAll('[role="tab"]');
        gsap.fromTo(tabs,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.1, delay: 0.3 }
        );
      }
      const dropzones = document.querySelectorAll('.manga-dropzone');
      gsap.fromTo(dropzones,
        { scale: 1 },
        { scale: 1.02, duration: 0.4, ease: 'power1.inOut', yoyo: true, repeat: 1, delay: 0.6 }
      );
      if (continueButtonRef.current) {
        gsap.fromTo(continueButtonRef.current,
          { opacity: 0, x: 60 },
          { opacity: 1, x: 0, duration: 0.6, ease: 'back.out(1.7)', delay: 0.5 }
        );
      }
      gsap.fromTo('.decor-item',
        { opacity: 0, scale: 0.7 },
        { opacity: 0.5, scale: 1, duration: 1, stagger: 0.12, delay: 0.3, ease: 'power2.out' }
      );
      gsap.fromTo('.decor-sun',
        { opacity: 0, scale: 0.5 },
        { opacity: 0.45, scale: 1, duration: 1.2, delay: 0.5, ease: 'power2.out' }
      );
      gsap.to('.decor-sun', { y: -20, duration: 1.4, delay: 1.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.decor-sun', { rotation: 360, duration: 30, delay: 1.5, repeat: -1, ease: 'none' });
      document.querySelectorAll('.decor-item').forEach((el, i) => {
        gsap.to(el, { rotation: '+=6', y: '+=5', duration: 2.8 + i * 0.6, delay: 1.2 + i * 0.35, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      });
    }, pageRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    gsap.fromTo('.tab-content-active',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
    );
  }, [activeTab]);

  useEffect(() => {
    if (images.length > prevImageCount) {
      const newCount = images.length - prevImageCount;
      const allCards = document.querySelectorAll('.image-card');
      const newCards = Array.from(allCards).slice(-newCount);
      gsap.fromTo(newCards,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)', stagger: 0.08 }
      );
    }
    setPrevImageCount(images.length);
  }, [images.length, prevImageCount]);

  useEffect(() => {
    if (characters.length > prevCharCount) {
      const newCount = characters.length - prevCharCount;
      const allCards = document.querySelectorAll('.character-card');
      const newCards = Array.from(allCards).slice(-newCount);
      gsap.fromTo(newCards,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power2.out', stagger: 0.1 }
      );
    }
    setPrevCharCount(characters.length);
  }, [characters.length, prevCharCount]);

  // ── Audio Handlers ──
  const handleAudioUpload = useCallback(async (file: File) => {
    setAudioFile(file);
    setAudioError(null);
    setAudioUploading(true);
    try {
      const result: any = await api.uploadAudio(id, file);
      setAudioAnalysis(result.audio_analysis ?? result);
    } catch (err: any) {
      setAudioError(err?.message ?? 'Audio analysis failed');
    } finally {
      setAudioUploading(false);
    }
  }, [id]);

  const formatFileSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  // ── Story Text Handlers ──
  const handleFileUpload = useCallback(async (file: File) => {
    setStoryFile(file);
    setUploading(true);
    try {
      const uploadResult: any = await api.uploadBook(id, file);
      const text = uploadResult.book_text || uploadResult.text_preview || '';
      setStoryText(text);
      setTextUploaded(true);
    } catch (err) {
      console.error(err);
      const text = await file.text();
      setStoryText(text);
      setTextUploaded(true);
    } finally {
      setUploading(false);
    }
  }, [id]);

  const handlePasteText = useCallback(() => {
    if (storyText.trim()) setTextUploaded(true);
  }, [storyText]);

  // ── Image Handlers (text mode) ──
  const handleImageUpload = useCallback((files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const newImages = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      description: '',
    }));
    setImages((prev) => [...prev, ...newImages]);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  const removeImage = useCallback((imgId: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === imgId);
      if (img) URL.revokeObjectURL(img.url);
      return prev.filter((i) => i.id !== imgId);
    });
  }, []);

  // ── Manga Handlers ──
  const handleMangaFiles = useCallback(async (files: File[]) => {
    const imageFiles = files
      .filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (imageFiles.length === 0) return;

    setMangaFiles(imageFiles);
    setMangaError(null);
    setMangaResult(null);
    setMangaUploading(true);

    try {
      const result: any = await api.uploadManga(id, imageFiles);
      setMangaResult(result);
      // Pre-load clips into the timeline store so they're ready in the editor
      if (result.clips?.length) {
        setClips(result.clips);
      }
    } catch (err: any) {
      setMangaError(err?.message ?? 'Manga analysis failed');
    } finally {
      setMangaUploading(false);
    }
  }, [id, setClips]);

  const removeMangaFile = useCallback((index: number) => {
    setMangaFiles((prev) => prev.filter((_, i) => i !== index));
    setMangaResult(null);
  }, []);

  // ── Input mode switch (clears the other mode) ──
  const switchToTextMode = useCallback(() => {
    setInputMode('text');
    setMangaFiles([]);
    setMangaResult(null);
    setMangaError(null);
  }, []);

  const switchToMangaMode = useCallback(() => {
    setInputMode('manga');
    setStoryText('');
    setStoryFile(null);
    setTextUploaded(false);
    setImages([]);
  }, []);

  // ── Character Handlers ──
  const addNewCharacter = useCallback(() => {
    setCharacters((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', description: '' },
    ]);
  }, []);

  const updateChar = useCallback((charId: string, updates: Partial<CharacterEntry>) => {
    setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...c, ...updates } : c)));
  }, []);

  const removeChar = useCallback((charId: string) => {
    setCharacters((prev) => prev.filter((c) => c.id !== charId));
  }, []);

  const handleCharImage = useCallback((charId: string, file: File) => {
    const url = URL.createObjectURL(file);
    setCharacters((prev) =>
      prev.map((c) => (c.id === charId ? { ...c, reference_image_url: url, imageFile: file } : c))
    );
  }, []);

  // ── Continue to Editor ──
  const handleContinue = useCallback(async () => {
    if (inputMode === 'text') {
      const text = storyText.trim();
      if (text && !storyFile) {
        try {
          const blob = new Blob([text], { type: 'text/plain' });
          const file = new File([blob], 'pasted-story.txt', { type: 'text/plain' });
          await api.uploadBook(id, file);
        } catch (err) {
          console.error('Failed to persist text:', err);
        }
      }
      images.forEach((img) => {
        addUploadedImage({ url: img.url, file_name: img.file.name, description: img.description });
      });
    }

    // Save characters to store (both modes)
    characters.forEach((c) => {
      if (c.name.trim()) {
        addCharacter({ name: c.name, description: c.description, reference_image_url: c.reference_image_url });
      }
    });

    router.push(`/project/${id}`);
  }, [id, inputMode, characters, images, storyText, storyFile, addCharacter, addUploadedImage, router]);

  const hasTextContent = textUploaded || storyText.trim().length > 0;
  const hasMangaContent = mangaResult !== null;
  const canContinue = inputMode === 'text' ? hasTextContent : hasMangaContent;

  // Tabs available per input mode
  const storyTabLabel = inputMode === 'manga' ? 'Manga/Comic' : 'Story Text';

  return (
    <main className="min-h-screen relative" ref={pageRef} style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {/* Decorative corner images */}
      <NextImage src="/stylized_imgs/stone3.png" alt="" width={160} height={220} className="decor-item fixed -top-6 -right-8 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.2))', transform: 'rotate(10deg)' }} />
      <NextImage src="/stylized_imgs/leaf5.png" alt="" width={150} height={130} className="decor-item fixed top-8 -left-10 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.15))', transform: 'rotate(-12deg)' }} />
      <NextImage src="/stylized_imgs/flowers.png" alt="" width={160} height={160} className="decor-item fixed -bottom-6 -left-6 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.15))', transform: 'rotate(-18deg)' }} />
      <NextImage src="/stylized_imgs/leaf6.png" alt="" width={130} height={110} className="decor-item fixed -bottom-4 -right-6 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.2))', transform: 'rotate(8deg) scaleX(-1)' }} />
      <NextImage src="/stylized_imgs/sun.png" alt="" width={160} height={150} className="decor-sun fixed top-20 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none select-none z-[5]" style={{ filter: 'drop-shadow(0 0 25px rgba(255,200,50,0.5)) drop-shadow(0 0 50px rgba(255,180,30,0.2))' }} />
      <img src="/stylized_imgs/oni.png" alt="" className="fixed bottom-0 left-[53%] -translate-x-1/2 w-[900px] pointer-events-none select-none z-[3]" style={{ opacity: 0.15 }} />

      <div className="max-w-3xl mx-auto px-6 py-12 relative z-10">
        <div className="bg-white/85 backdrop-blur-sm border-2 border-[#e8e8e8] p-8 shadow-[6px_6px_0px_rgba(0,0,0,0.08)]">
          {/* Header */}
          <div ref={headerRef}>
            <Link href="/dashboard" className="text-[#888] hover:text-[#111] flex items-center gap-2 mb-8 text-sm transition-colors">
              <ArrowLeft size={16} /> Back to Dashboard
            </Link>

            <div className="mb-6">
              <h1 className="manga-title text-3xl text-[#111] mb-2">Upload Content</h1>
              <p className="text-[#888]">Add your story, reference images, and character details.</p>
            </div>

            {/* ── Input mode toggle ── */}
            <div className="mb-6">
              <p className="text-xs text-[#888] uppercase tracking-wider mb-2 font-medium">Input Type</p>
              <div className="flex border-2 border-[#111] w-fit">
                <button
                  onClick={switchToTextMode}
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors ${
                    inputMode === 'text'
                      ? 'bg-[#111] text-white'
                      : 'bg-white text-[#555] hover:bg-[#f5f5f5]'
                  }`}
                >
                  <BookOpen size={15} /> Story Text
                </button>
                <button
                  onClick={switchToMangaMode}
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-l-2 border-[#111] transition-colors ${
                    inputMode === 'manga'
                      ? 'bg-[#111] text-white'
                      : 'bg-white text-[#555] hover:bg-[#f5f5f5]'
                  }`}
                >
                  <Layers size={15} /> Manga / Comic
                </button>
              </div>
              {inputMode === 'manga' && (
                <p className="text-xs text-[#888] mt-2">
                  Upload your manga pages — panels are extracted automatically. Action scenes are selected and used as-is (no AI image generation).
                </p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs.Root defaultValue="story" onValueChange={setActiveTab}>
            <div ref={tabListRef}>
              <Tabs.List className="flex border-b-2 border-[#ccc] mb-0">
                <Tabs.Trigger value="story" className="manga-tab flex items-center gap-2">
                  {inputMode === 'manga' ? <><Layers size={16} /> Manga/Comic</> : <><FileText size={16} /> Story Text</>}
                </Tabs.Trigger>
                {/* Images tab only shown in text mode */}
                {inputMode === 'text' && (
                  <Tabs.Trigger value="images" className="manga-tab flex items-center gap-2">
                    <ImageIcon size={16} /> Images
                  </Tabs.Trigger>
                )}
                <Tabs.Trigger value="characters" className="manga-tab flex items-center gap-2">
                  <Users size={16} /> Characters
                </Tabs.Trigger>
                <Tabs.Trigger value="audio" className="manga-tab flex items-center gap-2">
                  <Music size={16} /> Audio
                </Tabs.Trigger>
              </Tabs.List>
            </div>

            {/* ── Story Text Tab (text mode) ── */}
            {inputMode === 'text' && (
              <Tabs.Content value="story" className={`manga-panel p-6 border-t-0 ${activeTab === 'story' ? 'tab-content-active' : ''}`}>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[#111] font-medium mb-3">Upload a file</h3>
                    <div
                      ref={dropzoneRef}
                      className="manga-dropzone p-8 text-center cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.pdf,.epub,.md"
                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                        className="hidden"
                      />
                      {uploading ? (
                        <p className="text-[#111]">Uploading...</p>
                      ) : storyFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <FileText size={20} className="text-[#111]" />
                          <span className="text-[#111]">{storyFile.name}</span>
                          {textUploaded && <span className="manga-badge bg-green-600 text-white">Uploaded</span>}
                        </div>
                      ) : (
                        <>
                          <Upload size={32} className="mx-auto mb-3 text-[#555]" />
                          <p className="text-[#888]">Drop your story file here or click to browse</p>
                          <p className="text-xs text-[#555] mt-1">Supports .txt, .pdf, .epub, .md</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-[#333]" />
                    <span className="manga-accent-bar text-xs">OR</span>
                    <div className="flex-1 h-px bg-[#333]" />
                  </div>

                  <div>
                    <h3 className="text-[#111] font-medium mb-3">Paste your story text</h3>
                    <textarea
                      value={storyText}
                      onChange={(e) => {
                        setStoryText(e.target.value);
                        setTextUploaded(false);
                      }}
                      placeholder="Paste your story, book excerpt, or script here..."
                      rows={10}
                      className="manga-input w-full resize-none text-sm"
                    />
                    {storyText.trim() && !textUploaded && (
                      <button
                        onClick={handlePasteText}
                        className="manga-btn bg-[#111] text-white px-4 py-2 mt-3 text-sm"
                      >
                        Save Text
                      </button>
                    )}
                    {textUploaded && !storyFile && (
                      <p className="text-green-500 text-sm mt-2">Text saved ({storyText.length.toLocaleString()} characters)</p>
                    )}
                  </div>

                  {storyText && (
                    <div className="manga-panel p-4">
                      <h4 className="text-xs text-[#888] uppercase tracking-wider mb-2">Preview</h4>
                      <p className="text-[#111] text-sm whitespace-pre-wrap line-clamp-6">{storyText.slice(0, 500)}</p>
                      {storyText.length > 500 && <p className="text-[#555] text-xs mt-1">...and {(storyText.length - 500).toLocaleString()} more characters</p>}
                    </div>
                  )}
                </div>
              </Tabs.Content>
            )}

            {/* ── Manga Upload Tab (manga mode) ── */}
            {inputMode === 'manga' && (
              <Tabs.Content value="story" className={`manga-panel p-6 border-t-0 ${activeTab === 'story' ? 'tab-content-active' : ''}`}>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[#111] font-medium mb-1">Upload Manga Pages</h3>
                    <p className="text-[#888] text-sm mb-4">
                      Upload 1–50 page images (JPG, PNG, WebP). Panels are automatically extracted
                      using OpenCV, scored for action intensity, and the most dynamic fight/action
                      scenes are selected as your trailer frames.
                    </p>

                    <input
                      ref={mangaInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const incoming = Array.from(e.target.files ?? []);
                        if (!incoming.length) return;
                        // Merge with existing files, deduplicate by name, then re-sort
                        const merged = [...mangaFiles, ...incoming].filter(
                          (f, i, arr) => arr.findIndex((x) => x.name === f.name) === i
                        );
                        handleMangaFiles(merged);
                        if (mangaInputRef.current) mangaInputRef.current.value = '';
                      }}
                    />

                    {!mangaFiles.length ? (
                      <div
                        className={`manga-dropzone p-10 text-center cursor-pointer transition-colors ${mangaDragging ? 'border-[#111] bg-[#eee]' : ''}`}
                        onClick={() => mangaInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setMangaDragging(true); }}
                        onDragLeave={() => setMangaDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setMangaDragging(false);
                          const files = Array.from(e.dataTransfer.files);
                          if (files.length) handleMangaFiles(files);
                        }}
                      >
                        <Layers size={36} className="mx-auto mb-3 text-[#555]" />
                        <p className="text-[#888] font-medium">Drop manga page images here</p>
                        <p className="text-xs text-[#555] mt-1">Or click to browse — JPG, PNG, WebP · up to 50 pages</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Page thumbnails */}
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {mangaFiles.map((file, i) => (
                            <div key={i} className="relative group aspect-[3/4] bg-[#f0f0f0] border border-[#ddd] overflow-hidden">
                              <img
                                src={URL.createObjectURL(file)}
                                alt={`Page ${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <button
                                onClick={() => removeMangaFile(i)}
                                className="absolute top-0.5 right-0.5 bg-red-600 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={10} />
                              </button>
                              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5">
                                {i + 1}
                              </span>
                            </div>
                          ))}
                          {/* Add more */}
                          <button
                            onClick={() => mangaInputRef.current?.click()}
                            className="aspect-[3/4] border-2 border-dashed border-[#ccc] flex items-center justify-center hover:border-[#111] transition-colors"
                          >
                            <Plus size={16} className="text-[#888]" />
                          </button>
                        </div>

                        {/* Processing state */}
                        {mangaUploading && (
                          <div className="manga-panel p-4 flex items-center gap-3">
                            <Loader2 size={18} className="animate-spin text-[#555] shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-[#111]">Analysing manga pages…</p>
                              <p className="text-xs text-[#888] mt-0.5">
                                Extracting panels · Scoring action intensity · Building story context
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Error */}
                        {mangaError && (
                          <div className="manga-panel p-4 border-red-400">
                            <p className="text-red-600 text-sm font-medium">Analysis failed</p>
                            <p className="text-red-500 text-xs mt-1">{mangaError}</p>
                            <button
                              onClick={() => handleMangaFiles(mangaFiles)}
                              className="manga-btn mt-3 text-xs px-3 py-1.5"
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {/* Success result */}
                        {mangaResult && !mangaUploading && (
                          <div className="manga-panel p-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                              <p className="text-sm font-medium text-[#111]">Panels extracted successfully</p>
                            </div>

                            <div className="grid grid-cols-3 gap-3 text-sm">
                              <div>
                                <span className="text-[#888] text-xs">Pages uploaded</span>
                                <p className="font-medium text-[#111]">{mangaResult.page_count ?? mangaFiles.length}</p>
                              </div>
                              <div>
                                <span className="text-[#888] text-xs">Action panels selected</span>
                                <p className="font-medium text-[#111]">{mangaResult.panel_count ?? mangaResult.clips?.length ?? 0}</p>
                              </div>
                              <div>
                                <span className="text-[#888] text-xs">Genre detected</span>
                                <p className="font-medium text-[#111] capitalize">{mangaResult.analysis?.genre ?? '—'}</p>
                              </div>
                            </div>

                            {mangaResult.analysis?.summary && (
                              <div>
                                <span className="text-[#888] text-xs uppercase tracking-wider">Story Summary</span>
                                <p className="text-[#111] text-sm mt-1 line-clamp-3">{mangaResult.analysis.summary}</p>
                              </div>
                            )}

                            {/* Panel preview strip */}
                            {mangaResult.clips?.length > 0 && (
                              <div>
                                <span className="text-[#888] text-xs uppercase tracking-wider block mb-2">Selected Panels</span>
                                <div className="flex gap-1.5 overflow-x-auto pb-1">
                                  {mangaResult.clips.slice(0, 12).map((clip: any, i: number) => (
                                    <img
                                      key={i}
                                      src={clip.thumbnail_url}
                                      alt={`Panel ${i + 1}`}
                                      className="h-20 w-auto object-cover border border-[#ddd] shrink-0"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Tabs.Content>
            )}

            {/* ── Images Tab (text mode only) ── */}
            {inputMode === 'text' && (
              <Tabs.Content value="images" className={`manga-panel p-6 border-t-0 ${activeTab === 'images' ? 'tab-content-active' : ''}`}>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[#111] font-medium mb-1">Reference Images</h3>
                    <p className="text-[#888] text-sm mb-4">Optional — upload scene images, artwork, or visual references. Leave empty for fully AI-generated scenes.</p>

                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,image/*"
                      multiple
                      onChange={(e) => { handleImageUpload(e.target.files); }}
                      className="hidden"
                    />

                    <div
                      ref={imageDropzoneRef}
                      className="manga-dropzone p-8 text-center cursor-pointer"
                      onClick={() => imageInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('border-[#111]', 'bg-[#eee]'); }}
                      onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-[#111]', 'bg-[#eee]'); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.remove('border-[#111]', 'bg-[#eee]');
                        if (e.dataTransfer.files.length > 0) handleImageUpload(e.dataTransfer.files);
                      }}
                    >
                      <ImageIcon size={32} className="mx-auto mb-3 text-[#555]" />
                      <p className="text-[#888]">Drop images here or click to browse</p>
                      <p className="text-xs text-[#555] mt-1">PNG, JPG, GIF, WebP — upload one or many at once</p>
                    </div>
                  </div>

                  {images.length > 0 && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {images.map((img) => (
                          <div key={img.id} className="image-card manga-panel p-2 relative group">
                            <button
                              onClick={() => removeImage(img.id)}
                              className="absolute top-1 right-1 bg-red-600 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                              <X size={14} />
                            </button>
                            <img src={img.url} alt={img.file.name} className="w-full h-32 object-cover" />
                            <input
                              value={img.description}
                              onChange={(e) => setImages((prev) => prev.map((i) => i.id === img.id ? { ...i, description: e.target.value } : i))}
                              placeholder="Description (optional)"
                              className="manga-input w-full text-xs mt-2 py-1 px-2"
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        className="manga-btn border-dashed border-[#555] text-[#888] hover:text-[#111] w-full py-3 flex items-center justify-center gap-2"
                      >
                        <Plus size={16} /> Add More Images
                      </button>
                    </>
                  )}
                </div>
              </Tabs.Content>
            )}

            {/* ── Characters Tab ── */}
            <Tabs.Content value="characters" className={`manga-panel p-6 border-t-0 ${activeTab === 'characters' ? 'tab-content-active' : ''}`}>
              <div className="space-y-6">
                <div>
                  <h3 className="text-[#111] font-medium mb-1">Characters</h3>
                  <p className="text-[#888] text-sm mb-4">
                    {inputMode === 'manga'
                      ? 'Optionally name characters visible in your manga for better AI context.'
                      : 'Add character names, descriptions, and optional reference images for more accurate scene generation.'}
                  </p>
                </div>

                {characters.map((char) => (
                  <div key={char.id} className="character-card manga-panel p-4 relative">
                    <button
                      onClick={() => removeChar(char.id)}
                      className="absolute top-3 right-3 text-[#555] hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>

                    <div className="flex gap-4">
                      <div
                        className="manga-dropzone w-24 h-24 flex-shrink-0 flex items-center justify-center cursor-pointer"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) handleCharImage(char.id, file);
                          };
                          input.click();
                        }}
                      >
                        {char.reference_image_url ? (
                          <img src={char.reference_image_url} alt={char.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon size={20} className="text-[#555]" />
                        )}
                      </div>

                      <div className="flex-1 space-y-3">
                        <input
                          value={char.name}
                          onChange={(e) => updateChar(char.id, { name: e.target.value })}
                          placeholder="Character name"
                          className="manga-input w-full text-sm"
                        />
                        <textarea
                          value={char.description}
                          onChange={(e) => updateChar(char.id, { description: e.target.value })}
                          placeholder="Describe appearance, personality, role in the story..."
                          rows={2}
                          className="manga-input w-full text-sm resize-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addNewCharacter}
                  className="manga-btn border-dashed border-[#555] text-[#888] hover:text-[#111] w-full py-3 flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> Add Character
                </button>
              </div>
            </Tabs.Content>

            {/* ── Audio Tab ── */}
            <Tabs.Content value="audio" className={`manga-panel p-6 border-t-0 ${activeTab === 'audio' ? 'tab-content-active' : ''}`}>
              <div className="space-y-6">
                <div>
                  <h3 className="text-[#111] font-medium mb-1">Trailer Audio</h3>
                  <p className="text-[#888] text-sm mb-4">
                    Upload a music clip and we'll extract BPM, beat timestamps, energy curve, and section boundaries to sync your trailer.
                  </p>

                  <input
                    ref={audioInputRef}
                    type="file"
                    accept=".mp3,.wav,.ogg,.flac,.aac,.m4a"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioUpload(f); }}
                  />

                  {!audioFile ? (
                    <div
                      className={`manga-dropzone p-8 text-center cursor-pointer transition-colors ${audioDragging ? 'border-[#a855f7] bg-purple-50' : ''}`}
                      onClick={() => audioInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setAudioDragging(true); }}
                      onDragLeave={() => setAudioDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setAudioDragging(false);
                        const f = e.dataTransfer.files[0];
                        if (f && f.type.startsWith('audio/')) handleAudioUpload(f);
                      }}
                    >
                      <Music size={32} className="mx-auto mb-3 text-[#555]" />
                      <p className="text-[#888]">Drop an audio file here or click to browse</p>
                      <p className="text-xs text-[#555] mt-1">MP3, WAV, OGG, FLAC, AAC, M4A</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="border-2 border-[#111] p-4 flex items-center gap-3 bg-[#f9f9f9]">
                        <Music size={20} className="text-[#a855f7] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#111] truncate">{audioFile.name}</p>
                          <p className="text-xs text-[#888]">{formatFileSize(audioFile.size)}</p>
                        </div>
                        {audioUploading && <span className="text-xs text-[#888]">Analysing…</span>}
                        {audioAnalysis && <span className="manga-badge bg-green-600 text-white text-[0.6rem]">Analysed</span>}
                        {audioError && <span className="manga-badge bg-red-600 text-white text-[0.6rem]">Error</span>}
                        <button
                          onClick={() => {
                            setAudioFile(null);
                            setAudioAnalysis(null);
                            setAudioError(null);
                            if (audioInputRef.current) audioInputRef.current.value = '';
                          }}
                          className="text-[#888] hover:text-[#111] transition-colors shrink-0"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {audioError && <p className="text-red-500 text-sm">{audioError}</p>}

                      {audioAnalysis && (
                        <div className="manga-panel p-4 space-y-2">
                          <h4 className="text-xs text-[#888] uppercase tracking-wider mb-3">Analysis Results</h4>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-[#888] text-xs">BPM</span>
                              <p className="font-medium text-[#111]">{audioAnalysis.bpm?.toFixed(1)}</p>
                            </div>
                            <div>
                              <span className="text-[#888] text-xs">Duration</span>
                              <p className="font-medium text-[#111]">{audioAnalysis.duration_s?.toFixed(1)}s</p>
                            </div>
                            <div>
                              <span className="text-[#888] text-xs">Beats detected</span>
                              <p className="font-medium text-[#111]">{audioAnalysis.beat_timestamps?.length ?? 0}</p>
                            </div>
                            <div>
                              <span className="text-[#888] text-xs">Sections</span>
                              <p className="font-medium text-[#111]">{audioAnalysis.section_boundaries?.length ?? 0}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-between">
            <p className="text-[#555] text-sm">
              {inputMode === 'manga' ? (
                hasMangaContent
                  ? `${mangaResult.panel_count} action panels ready`
                  : mangaUploading
                  ? 'Processing manga…'
                  : mangaFiles.length > 0
                  ? `${mangaFiles.length} page${mangaFiles.length > 1 ? 's' : ''} uploaded — waiting for analysis`
                  : 'Upload manga pages to continue'
              ) : (
                hasTextContent ? 'Story content ready' : 'Upload or paste story text to continue'
              )}
              {characters.filter((c) => c.name.trim()).length > 0 &&
                ` · ${characters.filter((c) => c.name.trim()).length} character${characters.filter((c) => c.name.trim()).length > 1 ? 's' : ''}`}
              {audioAnalysis && ' · audio analysed'}
            </p>
            <button
              ref={continueButtonRef}
              onClick={handleContinue}
              disabled={!canContinue || mangaUploading}
              className="manga-btn bg-[#111] text-white px-8 py-3 text-lg flex items-center gap-2 disabled:opacity-40"
            >
              Continue to Editor <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
