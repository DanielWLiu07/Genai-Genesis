'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, FileText, Image as ImageIcon, Users, X, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { useProjectStore, type CharacterEntry } from '@/stores/project-store';
import { api } from '@/lib/api';
import gsap from 'gsap';

export default function UploadPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  // Story text state
  const [storyText, setStoryText] = useState('');
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [textUploaded, setTextUploaded] = useState(false);
  const [activeTab, setActiveTab] = useState('story');

  // Images state
  const [images, setImages] = useState<{ id: string; file: File; url: string; description: string }[]>([]);
  const [prevImageCount, setPrevImageCount] = useState(0);

  // Characters state
  const [characters, setCharacters] = useState<(CharacterEntry & { imageFile?: File })[]>([]);
  const [prevCharCount, setPrevCharCount] = useState(0);

  // Store
  const { addCharacter, addUploadedImage, setStoryText: storeSetStoryText } = useProjectStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
      // 1. Header fades and slides in from top
      if (headerRef.current) {
        gsap.fromTo(headerRef.current,
          { opacity: 0, y: -30 },
          { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
        );
      }

      // 2. Tab list stagger animation
      if (tabListRef.current) {
        const tabs = tabListRef.current.querySelectorAll('[role="tab"]');
        gsap.fromTo(tabs,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.1, delay: 0.3 }
        );
      }

      // 4. Dropzone pulse on mount
      const dropzones = document.querySelectorAll('.manga-dropzone');
      gsap.fromTo(dropzones,
        { scale: 1 },
        { scale: 1.02, duration: 0.4, ease: 'power1.inOut', yoyo: true, repeat: 1, delay: 0.6 }
      );

      // 5. Continue button slides in from right
      if (continueButtonRef.current) {
        gsap.fromTo(continueButtonRef.current,
          { opacity: 0, x: 60 },
          { opacity: 1, x: 0, duration: 0.6, ease: 'back.out(1.7)', delay: 0.5 }
        );
      }
    }, pageRef);

    return () => ctx.revert();
  }, []);

  // ── GSAP: Tab content transition ──
  useEffect(() => {
    gsap.fromTo('.tab-content-active',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
    );
  }, [activeTab]);

  // ── GSAP: New image cards pop in ──
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

  // ── GSAP: Character cards stagger in ──
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

  // ── Story Text Handlers ──
  const handleFileUpload = useCallback(async (file: File) => {
    setStoryFile(file);
    setUploading(true);
    try {
      const uploadResult: any = await api.uploadBook(id, file);
      const text = uploadResult.book_text || uploadResult.text_preview || '';
      setStoryText(text);
      sessionStorage.setItem(`book_text_${id}`, text);
      setTextUploaded(true);
    } catch (err) {
      console.error(err);
      // Fallback: read file locally
      const text = await file.text();
      setStoryText(text);
      sessionStorage.setItem(`book_text_${id}`, text);
      setTextUploaded(true);
    } finally {
      setUploading(false);
    }
  }, [id]);

  const handlePasteText = useCallback(() => {
    if (storyText.trim()) {
      sessionStorage.setItem(`book_text_${id}`, storyText);
      setTextUploaded(true);
    }
  }, [id, storyText]);

  // ── Image Handlers ──
  const handleImageUpload = useCallback((files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    // Filter to only image files
    const imageFiles = fileArray.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    const newImages = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      description: '',
    }));
    setImages((prev) => [...prev, ...newImages]);
    // Reset the file input so the same file can be re-selected
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  }, []);

  const removeImage = useCallback((imgId: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === imgId);
      if (img) URL.revokeObjectURL(img.url);
      return prev.filter((i) => i.id !== imgId);
    });
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
    // If text was pasted but not uploaded via file, persist it to the backend now
    const text = storyText.trim();
    if (text && !storyFile) {
      try {
        // Create a text file from pasted content and upload it
        const blob = new Blob([text], { type: 'text/plain' });
        const file = new File([blob], 'pasted-story.txt', { type: 'text/plain' });
        const uploadResult: any = await api.uploadBook(id, file);
        const bookText = uploadResult.book_text || uploadResult.text_preview || text;
        sessionStorage.setItem(`book_text_${id}`, bookText);
      } catch (err) {
        console.error('Failed to persist text:', err);
        // Still continue — sessionStorage has the text
        sessionStorage.setItem(`book_text_${id}`, text);
      }
    }

    // Save characters to store
    characters.forEach((c) => {
      if (c.name.trim()) {
        addCharacter({ name: c.name, description: c.description, reference_image_url: c.reference_image_url });
      }
    });
    // Save images to store
    images.forEach((img) => {
      addUploadedImage({ url: img.url, file_name: img.file.name, description: img.description });
    });
    // Save characters to sessionStorage for editor
    const charData = characters.filter((c) => c.name.trim()).map(({ id: cid, name, description, reference_image_url }) => ({
      id: cid, name, description, reference_image_url,
    }));
    sessionStorage.setItem(`characters_${id}`, JSON.stringify(charData));
    sessionStorage.setItem(`uploaded_images_${id}`, JSON.stringify(images.map((i) => ({
      id: i.id, url: i.url, file_name: i.file.name, description: i.description,
    }))));

    router.push(`/project/${id}`);
  }, [id, characters, images, storyText, storyFile, addCharacter, addUploadedImage, router]);

  const hasStoryContent = textUploaded || storyText.trim().length > 0;

  return (
    <main className="min-h-screen bg-[#f5f5f5]" ref={pageRef}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div ref={headerRef}>
          <Link href="/dashboard" className="text-[#888] hover:text-[#111] flex items-center gap-2 mb-8 text-sm transition-colors">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>

          <div className="mb-8">
            <h1 className="manga-title text-3xl text-[#111] mb-2">Upload Content</h1>
            <p className="text-[#888]">Add your story, reference images, and character details.</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs.Root defaultValue="story" onValueChange={setActiveTab}>
          <div ref={tabListRef}>
            <Tabs.List className="flex border-b-2 border-[#ccc] mb-0">
              <Tabs.Trigger value="story" className="manga-tab flex items-center gap-2">
                <FileText size={16} /> Story Text
              </Tabs.Trigger>
              <Tabs.Trigger value="images" className="manga-tab flex items-center gap-2">
                <ImageIcon size={16} /> Images
              </Tabs.Trigger>
              <Tabs.Trigger value="characters" className="manga-tab flex items-center gap-2">
                <Users size={16} /> Characters
              </Tabs.Trigger>
            </Tabs.List>
          </div>

          {/* ── Story Text Tab ── */}
          <Tabs.Content value="story" className={`manga-panel p-6 border-t-0 ${activeTab === 'story' ? 'tab-content-active' : ''}`}>
            <div className="space-y-6">
              {/* File Upload */}
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

              {/* OR divider */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-[#333]" />
                <span className="manga-accent-bar text-xs">OR</span>
                <div className="flex-1 h-px bg-[#333]" />
              </div>

              {/* Paste Text */}
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

              {/* Preview */}
              {storyText && (
                <div className="manga-panel p-4">
                  <h4 className="text-xs text-[#888] uppercase tracking-wider mb-2">Preview</h4>
                  <p className="text-[#111] text-sm whitespace-pre-wrap line-clamp-6">{storyText.slice(0, 500)}</p>
                  {storyText.length > 500 && <p className="text-[#555] text-xs mt-1">...and {(storyText.length - 500).toLocaleString()} more characters</p>}
                </div>
              )}
            </div>
          </Tabs.Content>

          {/* ── Images Tab ── */}
          <Tabs.Content value="images" className={`manga-panel p-6 border-t-0 ${activeTab === 'images' ? 'tab-content-active' : ''}`}>
            <div className="space-y-6">
              <div>
                <h3 className="text-[#111] font-medium mb-1">Reference Images</h3>
                <p className="text-[#888] text-sm mb-4">Optional — upload scene images, artwork, or visual references. Leave empty for fully AI-generated scenes.</p>

                {/* Hidden file input — always available */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,image/*"
                  multiple
                  onChange={(e) => {
                    handleImageUpload(e.target.files);
                  }}
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
                    const files = e.dataTransfer.files;
                    if (files.length > 0) handleImageUpload(files);
                  }}
                >
                  <ImageIcon size={32} className="mx-auto mb-3 text-[#555]" />
                  <p className="text-[#888]">Drop images here or click to browse</p>
                  <p className="text-xs text-[#555] mt-1">PNG, JPG, GIF, WebP — upload one or many at once</p>
                </div>
              </div>

              {/* Image Grid */}
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
                  {/* Add more button */}
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

          {/* ── Characters Tab ── */}
          <Tabs.Content value="characters" className={`manga-panel p-6 border-t-0 ${activeTab === 'characters' ? 'tab-content-active' : ''}`}>
            <div className="space-y-6">
              <div>
                <h3 className="text-[#111] font-medium mb-1">Characters</h3>
                <p className="text-[#888] text-sm mb-4">Add character names, descriptions, and optional reference images for more accurate scene generation.</p>
              </div>

              {/* Character List */}
              {characters.map((char) => (
                <div key={char.id} className="character-card manga-panel p-4 relative">
                  <button
                    onClick={() => removeChar(char.id)}
                    className="absolute top-3 right-3 text-[#555] hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>

                  <div className="flex gap-4">
                    {/* Character Image */}
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

                    {/* Character Details */}
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
        </Tabs.Root>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between">
          <p className="text-[#555] text-sm">
            {hasStoryContent ? 'Story content ready' : 'Upload or paste story text to continue'}
            {images.length > 0 && ` · ${images.length} image${images.length > 1 ? 's' : ''}`}
            {characters.filter((c) => c.name.trim()).length > 0 && ` · ${characters.filter((c) => c.name.trim()).length} character${characters.filter((c) => c.name.trim()).length > 1 ? 's' : ''}`}
          </p>
          <button
            ref={continueButtonRef}
            onClick={handleContinue}
            disabled={!hasStoryContent}
            className="manga-btn bg-[#111] text-white px-8 py-3 text-lg flex items-center gap-2"
          >
            Continue to Editor <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </main>
  );
}
