'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FlowEditor } from '@/components/editor/FlowEditor';
import { ChatPanel } from '@/components/chat/ChatPanel';
import {
  Film, ArrowLeft, Play, Download, Loader2, Sparkles, BookOpen, Clapperboard,
  Lightbulb, Palette, Settings, Users, BarChart2, Plus, Trash2, Check,
  RotateCcw, RefreshCw, X, Edit2, Upload, ChevronLeft, ChevronRight, Zap, Music,
} from 'lucide-react';
import { TransitionLink as Link } from '@/components/PageTransition';
import { api } from '@/lib/api';
import { useTimelineStore } from '@/stores/timeline-store';
import { useProjectStore, type CharacterEntry } from '@/stores/project-store';
import { ClipDetailPanel } from '@/components/editor/ClipDetailPanel';
import { TimelineStrip } from '@/components/editor/TimelineStrip';
import { ImageCropper } from '@/components/ImageCropper';
import { TrailerPreview } from '@/components/editor/TrailerPreview';
import gsap from 'gsap';

type GenerationStep = 'idle' | 'analyzing' | 'planning' | 'done' | 'error';
type SidebarTab = 'story' | 'chars' | 'audio';
type WorkflowPhase = 'plan' | 'images' | 'videos' | 'effects';

const STYLES = ['cinematic', 'manga', 'noir', 'horror', 'romance', 'fantasy', 'sci-fi', 'comic'];

/** Pick N beat cut-points from the analysis, aligned to medium-energy beats. */
function computeBeatSync(audioAnalysis: any, clipCount: number): number[] {
  const beats: number[] = audioAnalysis.beat_timestamps || [];
  const energyCurve: number[] = audioAnalysis.energy_curve || [];
  const duration: number = audioAnalysis.duration_s || 30;

  if (beats.length < 2) {
    const dur = Math.round((duration * 1000) / clipCount);
    return Array(clipCount).fill(dur);
  }

  const scoredBeats = beats.map((t) => ({
    t,
    energy: energyCurve[Math.min(Math.floor(t), energyCurve.length - 1)] ?? 0,
  }));

  let filtered = scoredBeats.filter(b => b.energy >= 0.45).filter((_, i) => i % 2 === 0);
  if (filtered.length < clipCount) {
    filtered = [...scoredBeats].sort((a, b) => b.energy - a.energy).slice(0, Math.max(clipCount + 1, scoredBeats.length)).sort((a, b) => a.t - b.t);
  }

  const cutPoints: number[] = [0];
  for (let i = 0; i < clipCount - 1; i++) {
    const idx = Math.min(Math.round(i * filtered.length / (clipCount - 1)), filtered.length - 1);
    cutPoints.push(Math.round((filtered[idx]?.t ?? (duration * (i + 1) / clipCount)) * 1000));
  }
  cutPoints.push(Math.round(duration * 1000));

  return Array.from({ length: clipCount }, (_, i) => Math.max(400, cutPoints[i + 1] - cutPoints[i]));
}

function AudioTab({
  projectId,
  audioAnalysis,
  musicTrack,
  clips,
  onAudioUploaded,
  onSyncApplied,
}: {
  projectId: string;
  audioAnalysis: any;
  musicTrack: any;
  clips: any[];
  onAudioUploaded: (result: any) => void;
  onSyncApplied: (durations: { id: string; duration_ms: number }[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [syncApplied, setSyncApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('audio/')) { setUploadError('Please upload an audio file (MP3, WAV, etc.)'); return; }
    setUploading(true);
    setUploadError(null);
    try {
      const result = await api.uploadAudio(projectId, file);
      onAudioUploaded(result);
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleApplySync = () => {
    const visualClips = clips.filter(c => c.type !== 'text_overlay').sort((a: any, b: any) => a.order - b.order);
    const durations = computeBeatSync(audioAnalysis, visualClips.length);
    const updates = visualClips.map((c: any, i: number) => ({ id: c.id, duration_ms: durations[i] }));
    onSyncApplied(updates);
    setSyncApplied(true);
    setTimeout(() => setSyncApplied(false), 2500);
  };

  if (audioAnalysis) {
    const a = audioAnalysis;
    const energyCurve: number[] = a.energy_curve || [];
    const beats: number[] = a.beat_timestamps || [];
    const downbeats: number[] = a.downbeat_timestamps || [];
    const sections: number[] = a.section_boundaries || [];
    const onsets: number[] = a.onset_times || [];
    const energyPeaks: number[] = a.energy_peaks || [];
    const kickTimes: number[] = a.kick_times || [];
    const snareTimes: number[] = a.snare_times || [];
    const hihatTimes: number[] = a.hihat_times || [];
    const crashTimes: number[] = a.crash_times || [];
    const hornTimes: number[] = a.horn_times || [];
    const melodicTimes: number[] = a.melodic_times || [];
    // Instrument legend: colour + row position for the multi-row marker strip
    const INSTRUMENTS = [
      { key: 'kick',    label: 'KICK',    times: kickTimes,    color: '#111',    row: 0 },
      { key: 'snare',   label: 'SNARE',   times: snareTimes,   color: '#555',    row: 1 },
      { key: 'hihat',   label: 'HI-HAT',  times: hihatTimes,   color: '#888',    row: 2 },
      { key: 'crash',   label: 'CRASH',   times: crashTimes,   color: '#ef4444', row: 3 },
      { key: 'horn',    label: 'HORN',    times: hornTimes,    color: '#f97316', row: 4 },
      { key: 'melodic', label: 'MELODIC', times: melodicTimes, color: '#a855f7', row: 5 },
    ];
    const hasInstruments = INSTRUMENTS.some(i => i.times.length > 0);

    return (
      <div className="space-y-4">
        {/* Track info */}
        <div>
          <span className="manga-accent-bar text-[0.6rem]">AUDIO TRACK</span>
          {musicTrack && (
            <p className="text-[0.65rem] text-[#a855f7] mt-1 truncate font-medium" title={musicTrack.name}>♪ {musicTrack.name}</p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[0.65rem] text-[#666]">
            <span className="text-[#111] font-medium">BPM</span><span>{a.bpm?.toFixed(1)}</span>
            <span className="text-[#111] font-medium">Duration</span><span>{a.duration_s?.toFixed(1)}s</span>
            <span className="text-[#111] font-medium">Beats</span><span>{beats.length} ({downbeats.length} bars)</span>
            <span className="text-[#111] font-medium">Sections</span><span>{sections.length}</span>
          </div>
        </div>

        {/* Energy curve */}
        {energyCurve.length > 0 && (
          <div>
            <span className="manga-accent-bar text-[0.6rem]">ENERGY MAP</span>
            <div className="mt-2 relative h-12 w-full bg-[#f8f8f8] border border-[#eee] overflow-hidden">
              <div className="absolute inset-0 flex items-end gap-px px-px">
                {energyCurve.map((v, i) => (
                  <div key={i} className="flex-1 min-w-0" style={{
                    height: `${Math.max(3, v * 100)}%`,
                    background: v > 0.7 ? '#a855f7' : v > 0.4 ? '#7c3aed' : '#ccc',
                    opacity: 0.5 + v * 0.5,
                  }} />
                ))}
              </div>
              {downbeats.map((t, i) => (
                <div key={`db-${i}`} className="absolute top-0 bottom-0 w-px opacity-50"
                  style={{ left: `${(t / (a.duration_s || 1)) * 100}%`, background: '#facc15' }} />
              ))}
              {sections.map((t, i) => (
                <div key={`sec-${i}`} className="absolute top-0 bottom-0 w-px bg-[#111] opacity-30"
                  style={{ left: `${(t / (a.duration_s || 1)) * 100}%` }} />
              ))}
            </div>
            <p className="text-[0.5rem] text-[#bbb] mt-0.5">Purple = high energy · Yellow = bar starts · Black = sections</p>
          </div>
        )}

        {/* Per-instrument hit strip — one row per instrument, markers at hit times */}
        {hasInstruments && (
          <div>
            <span className="manga-accent-bar text-[0.6rem]">INSTRUMENT HITS</span>
            <div className="mt-2 space-y-px">
              {INSTRUMENTS.map(({ key, label, times, color }) => (
                <div key={key} className="flex items-center gap-1.5">
                  {/* Label */}
                  <span className="text-[0.5rem] font-bold w-10 shrink-0 text-right" style={{ color }}>
                    {label}
                  </span>
                  {/* Hit strip */}
                  <div className="flex-1 relative h-3 bg-[#f8f8f8] border border-[#eee] overflow-hidden">
                    {times.map((t, i) => {
                      const pct = (t / (a.duration_s || 1)) * 100;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 w-px"
                          style={{ left: `${pct}%`, background: color, opacity: 0.85 }}
                        />
                      );
                    })}
                  </div>
                  {/* Count */}
                  <span className="text-[0.5rem] text-[#aaa] w-6 shrink-0">{times.length}</span>
                </div>
              ))}
            </div>
            <p className="text-[0.5rem] text-[#bbb] mt-1">Each line = one hit event detected in the audio</p>
          </div>
        )}

        {/* Beat Sync */}
        <div>
          <span className="manga-accent-bar text-[0.6rem]">BEAT SYNC</span>
          <p className="text-[0.6rem] text-[#888] mt-1 mb-2 leading-relaxed">
            Redistibute clip durations to land cuts on the most energetic beats.
          </p>

          <button
            onClick={handleApplySync}
            className={`w-full py-2 text-[0.65rem] font-bold border-2 transition-colors flex items-center justify-center gap-1.5 ${
              syncApplied
                ? 'border-green-500 bg-green-500 text-white'
                : 'border-[#111] bg-[#111] text-white hover:bg-[#333] hover:border-[#333]'
            }`}
            style={{ fontFamily: 'var(--font-manga)' }}
          >
            {syncApplied ? (
              <><Check size={11} /> SYNC APPLIED</>
            ) : (
              <><Zap size={11} /> APPLY BEAT SYNC</>
            )}
          </button>
        </div>

        {/* Sections list */}
        {sections.length > 0 && (
          <div>
            <span className="manga-accent-bar text-[0.6rem]">SECTIONS</span>
            <div className="mt-1.5 space-y-0.5">
              {sections.map((t, i) => {
                const nextT = sections[i + 1] ?? a.duration_s;
                const sectionEnergy = energyCurve.slice(Math.floor(t), Math.ceil(nextT));
                const avgEnergy = sectionEnergy.length ? sectionEnergy.reduce((s, v) => s + v, 0) / sectionEnergy.length : 0;
                return (
                  <div key={i} className="flex items-center gap-2 text-[0.6rem] text-[#666]">
                    <div
                      className="w-1.5 h-3 shrink-0"
                      style={{ background: avgEnergy > 0.6 ? '#a855f7' : avgEnergy > 0.3 ? '#7c3aed' : '#ccc' }}
                    />
                    <span className="text-[#111] font-medium">§{i + 1}</span>
                    <span>{(t as number).toFixed(1)}s – {(nextT as number).toFixed(1)}s</span>
                    <span className="ml-auto text-[#aaa]">{(avgEnergy * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Replace audio */}
        <div className="pt-1 border-t border-[#eee]">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full text-[0.6rem] text-[#aaa] hover:text-[#666] py-1.5 transition-colors flex items-center justify-center gap-1"
          >
            <Upload size={10} /> {uploading ? 'Analyzing…' : 'Replace audio track'}
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </div>
      </div>
    );
  }

  // No audio yet — show upload UI
  return (
    <div className="space-y-3">
      <span className="manga-accent-bar text-[0.6rem]">AUDIO TRACK</span>
      <p className="text-[0.65rem] text-[#888] leading-relaxed">
        Add a music track to beat-sync your trailer cuts and boost energy pacing.
      </p>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-none py-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
          dragOver ? 'border-[#a855f7] bg-[#a855f7]/5' : 'border-[#ccc] hover:border-[#888]'
        } ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {uploading ? (
          <>
            <Loader2 size={20} className="text-[#a855f7] animate-spin" />
            <span className="text-[0.65rem] text-[#888]">Analyzing audio…</span>
            <span className="text-[0.55rem] text-[#bbb]">Detecting BPM, beats & energy</span>
          </>
        ) : (
          <>
            <Music size={20} className="text-[#ccc]" />
            <span className="text-[0.7rem] font-bold text-[#888]" style={{ fontFamily: 'var(--font-manga)' }}>
              DROP AUDIO HERE
            </span>
            <span className="text-[0.55rem] text-[#bbb]">MP3, WAV, M4A, OGG</span>
          </>
        )}
      </div>

      {uploadError && <p className="text-[0.6rem] text-red-500">{uploadError}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />

      <p className="text-[0.55rem] text-[#bbb] leading-relaxed">
        After upload, BPM and beat data will be used to sync clip durations on re-plan or regeneration.
      </p>
    </div>
  );
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [genStep, setGenStep] = useState<GenerationStep>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [videoCancelled, setVideoCancelled] = useState(false);
  const [videoGenProgress, setVideoGenProgress] = useState({ done: 0, total: 0 });
  const [batchGenerating, setBatchGenerating] = useState(false);
  const cancelImagesRef = useRef(false);
  const cancelVideosRef = useRef(false);
  const cancelExportRef = useRef(false);
  const cancelledVideoClipsRef = useRef<Set<string>>(new Set());
  const [selectedStyle, setSelectedStyle] = useState('cinematic');
  const [genDismissed, setGenDismissed] = useState(false);
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Left sidebar tab state
  const [activeTab, setActiveTab] = useState<SidebarTab>('story');
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [compiledUrl, setCompiledUrl] = useState<string | null>(null);
  const [showRenderComplete, setShowRenderComplete] = useState(false);
  const exportStateRef = useRef({ setExportStatus: null as any, setCompiledUrl: null as any, setShowRenderComplete: null as any, setExporting: null as any });

  // Character editing state
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editCharName, setEditCharName] = useState('');
  const [editCharDesc, setEditCharDesc] = useState('');
  const [addingChar, setAddingChar] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharDesc, setNewCharDesc] = useState('');

  // Settings editing state
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStoryText, setEditStoryText] = useState('');
  const [editThumbnail, setEditThumbnail] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [generatingThumb, setGeneratingThumb] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const loadTimeline = useTimelineStore((s) => s.loadTimeline);
  const setProjectId = useTimelineStore((s) => s.setProjectId);
  const clips = useTimelineStore((s) => s.clips);
  const updateClip = useTimelineStore((s) => s.updateClip);
  const musicTrack = useTimelineStore((s) => s.musicTrack);
  const timelineSettings = useTimelineStore((s) => s.settings);
  const { currentProject, setCurrentProject } = useProjectStore();
  const updateProject = useProjectStore((s) => s.updateProject);
  const removeProject = useProjectStore((s) => s.removeProject);
  const addCharacter = useProjectStore((s) => s.addCharacter);
  const removeCharacter = useProjectStore((s) => s.removeCharacter);
  const updateCharacter = useProjectStore((s) => s.updateCharacter);
  const wsRef = useRef<WebSocket | null>(null);
  // Keep ref in sync so WS handler can call latest setters without re-subscribing
  exportStateRef.current = { setExportStatus, setCompiledUrl, setShowRenderComplete, setExporting };

  const topBarRef = useRef<HTMLElement>(null);
  const onboardingCardRef = useRef<HTMLDivElement>(null);
  const generateBtnRef = useRef<HTMLButtonElement>(null);
  const editorHeaderRef = useRef<HTMLDivElement>(null);
  const leftSidebarRef = useRef<HTMLDivElement>(null);
  const flashOverlayRef = useRef<HTMLDivElement>(null);
  const prevGenStepRef = useRef<GenerationStep>('idle');
  const hadClipsRef = useRef(false);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const rightContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setProjectId(id);

    // Restore video-cancelled flag from sessionStorage — but only if no stuck clips exist
    // (stuck clips take priority and need to be re-run, so don't lock out the generate button)
    if (sessionStorage.getItem(`video_cancelled_${id}`)) {
      setVideoCancelled(true);
    }

    Promise.all([
      api.getProject(id).catch(() => null),
      api.getTimeline(id).catch(() => ({ clips: [], music_track: null, settings: null })),
      api.getRenderJobs(id).catch(() => []),
    ]).then(([project, timeline, renderJobs]: [any, any, any]) => {
      // Restore compiled video URL from most recent done render job (sort by created_at DESC)
      const sortedJobs = [...(renderJobs || [])].sort((a: any, b: any) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      const latestDone = sortedJobs.find((j: any) => j.status === 'done' && (j.preview_url || j.output_url));
      if (latestDone) setCompiledUrl(latestDone.preview_url || latestDone.output_url);
      if (project) {
        const storedBookText = sessionStorage.getItem(`book_text_${id}`);
        if (storedBookText && !project.book_text) project.book_text = storedBookText;
        const storedChars = sessionStorage.getItem(`characters_${id}`);
        if (storedChars) project.characters = JSON.parse(storedChars);
        if (!project.characters) project.characters = [];
        if (!project.uploaded_images) project.uploaded_images = [];
        setCurrentProject(project);
        setEditTitle(project.title || '');
        setEditDesc(project.description || '');
        setEditStoryText(project.book_text || project.story_text || sessionStorage.getItem(`book_text_${id}`) || '');
        if (localStorage.getItem(`gen_dismissed_${id}`)) setGenDismissed(true);
        // Prefer localStorage thumbnail (data URLs persist there; API only stores URLs)
        const localThumb = localStorage.getItem(`cover_image_${id}`);
        const thumb = localThumb || project.cover_image_url || '';
        setEditThumbnail(thumb);
        if (thumb && !project.cover_image_url) {
          project.cover_image_url = thumb;
        }
      }
      if (timeline) {
        loadTimeline(timeline);
        // Reset any clips stuck in 'generating' — happens when page is refreshed mid-generation
        // or when a WebSocket callback was never received. Re-generate will pick them up.
        const stuckClips = (timeline.clips || []).filter((c: any) => c.gen_status === 'generating');
        if (stuckClips.length > 0) {
          const resetClips = (timeline.clips || []).map((c: any) =>
            c.gen_status === 'generating' ? { ...c, gen_status: 'pending' } : c
          );
          stuckClips.forEach((c: any) => updateClip(c.id, { gen_status: 'pending' }));
          api.updateTimeline(id, { clips: resetClips }).catch(() => {});
          // Also clear videoCancelled so the generate button reappears
          sessionStorage.removeItem(`video_cancelled_${id}`);
          setVideoCancelled(false);
        }
        // If project has no cover, use the first generated clip's thumbnail
        if (project && !project.cover_image_url) {
          const firstThumb = (timeline.clips || []).find((c: any) => c.thumbnail_url)?.thumbnail_url;
          if (firstThumb) {
            updateProject(id, { cover_image_url: firstThumb });
            api.updateProject(id, { cover_image_url: firstThumb }).catch(() => {});
          }
        }
      }
    }).catch((err) => {
      console.error('Failed to load project:', err);
      setError('Failed to load project.');
    }).finally(() => setLoading(false));

    const wsUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/api/v1/ws/${id}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if ((msg.type === 'clip_update' || msg.type === 'clip_updated') && msg.clip_id) {
          // Skip update if user cancelled video generation for this clip
          if (cancelledVideoClipsRef.current.has(msg.clip_id)) {
            cancelledVideoClipsRef.current.delete(msg.clip_id);
            return;
          }
          const updates: Record<string, any> = {};
          if (msg.gen_status) updates.gen_status = msg.gen_status;
          if (msg.status) updates.gen_status = msg.status;
          if (msg.generated_media_url) updates.generated_media_url = msg.generated_media_url;
          if (msg.media_url) updates.generated_media_url = msg.media_url;
          if (msg.thumbnail_url) updates.thumbnail_url = msg.thumbnail_url;
          if (msg.gen_error || msg.error) updates.gen_error = msg.gen_error || msg.error;
          if (msg.actual_type) updates.type = msg.actual_type;  // Kling fallback: revert video→image
          if (msg.updates) Object.assign(updates, msg.updates);
          if (Object.keys(updates).length > 0) updateClip(msg.clip_id, updates);

          // Auto-set project cover from first generated thumbnail
          if (msg.thumbnail_url) {
            const proj = useProjectStore.getState().currentProject;
            if (proj && !proj.cover_image_url) {
              updateProject(id, { cover_image_url: msg.thumbnail_url });
            }
          }
        } else if (msg.type === 'render_progress') {
          const { setExportStatus: ses, setCompiledUrl: scu, setShowRenderComplete: ssrc, setExporting: se } = exportStateRef.current;
          if (msg.progress !== undefined && ses) ses(`Rendering... ${msg.progress}%`);
          if (msg.status === 'done' && (msg.preview_url || msg.output_url)) {
            if (ses) ses('Done!');
            if (scu) scu(msg.preview_url || msg.output_url);
            if (ssrc) ssrc(true);
            if (se) se(false);
          } else if (msg.status === 'error') {
            if (ses) ses(null);
            if (se) se(false);
          }
        }
      } catch { /* ignore */ }
    };
    return () => { ws.close(); wsRef.current = null; };
  }, [id, setProjectId, loadTimeline, setCurrentProject, updateClip]);

  useEffect(() => {
    if (loading || error) return;
    const ctx = gsap.context(() => {
      if (topBarRef.current) {
        gsap.fromTo(topBarRef.current, { y: -48, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
      }
    });
    return () => ctx.revert();
  }, [loading, error]);

  useEffect(() => {
    if (!onboardingCardRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(onboardingCardRef.current, { scale: 0.8, opacity: 0, rotation: -2 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(1.7)', delay: 0.2 });
    });
    return () => ctx.revert();
  }, [loading, clips.length, genStep]);

  useEffect(() => {
    if (!generateBtnRef.current) return;
    const ctx = gsap.context(() => {
      gsap.to(generateBtnRef.current, { boxShadow: '0 0 20px rgba(168, 85, 247, 0.6), 0 0 40px rgba(168, 85, 247, 0.3)', duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
    return () => ctx.revert();
  }, [loading, clips.length, genStep]);

  useEffect(() => {
    if (genStep === 'analyzing' || genStep === 'planning') {
      const activeIndicators = document.querySelectorAll('.step-indicator-active');
      gsap.fromTo(activeIndicators, { scale: 1 }, { scale: 1.05, duration: 0.5, ease: 'power1.inOut', yoyo: true, repeat: 2 });
    }
  }, [genStep]);

  useEffect(() => {
    if (genStep === 'done' && prevGenStepRef.current !== 'done') {
      localStorage.removeItem(`gen_dismissed_${id}`);
      setGenDismissed(false);
      if (flashOverlayRef.current) {
        gsap.fromTo(flashOverlayRef.current,
          { opacity: 0.8, display: 'block' },
          { opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => { if (flashOverlayRef.current) flashOverlayRef.current.style.display = 'none'; } }
        );
      }
    }
    prevGenStepRef.current = genStep;
  }, [genStep, id]);

  useEffect(() => {
    if (clips.length > 0 && !hadClipsRef.current) {
      hadClipsRef.current = true;
      if (editorHeaderRef.current) {
        const tl = gsap.timeline();
        tl.to(editorHeaderRef.current, { scale: 1.05, duration: 0.2, ease: 'power2.out' });
        tl.to(editorHeaderRef.current, { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.5)' });
        tl.fromTo(editorHeaderRef.current,
          { textShadow: '0 0 0px rgba(168, 85, 247, 0)' },
          { textShadow: '0 0 20px rgba(168, 85, 247, 0.8)', duration: 0.3, yoyo: true, repeat: 1 }, '<'
        );
      }
    }
  }, [clips.length]);

  useEffect(() => {
    if (!rightPanelRef.current || !rightContentRef.current) return;
    if (rightOpen) {
      gsap.to(rightPanelRef.current, { width: 320, duration: 0.3, ease: 'power3.out' });
      gsap.fromTo(rightContentRef.current, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.25, delay: 0.1, ease: 'power2.out' });
    } else {
      gsap.to(rightContentRef.current, { opacity: 0, x: 20, duration: 0.15, ease: 'power2.in' });
      gsap.to(rightPanelRef.current, { width: 24, duration: 0.25, delay: 0.1, ease: 'power3.in' });
    }
  }, [rightOpen]);

  const openLeft = useCallback(() => {
    setLeftOpen(true);
    requestAnimationFrame(() => {
      if (leftSidebarRef.current)
        gsap.fromTo(leftSidebarRef.current, { width: 24 }, { width: 220, duration: 0.32, ease: 'power3.out', overwrite: true });
    });
  }, []);

  const closeLeft = useCallback(() => {
    if (leftSidebarRef.current)
      gsap.to(leftSidebarRef.current, {
        width: 24, duration: 0.22, ease: 'power3.in', overwrite: true,
        onComplete: () => setLeftOpen(false),
      });
  }, []);

  const handleExport = useCallback(async () => {
    if (!id || exporting) return;
    cancelExportRef.current = false;
    setExporting(true);
    setExportStatus('Saving timeline...');
    try {
      // Merge Zustand + Supabase: Zustand has latest UI state; Supabase has async video URLs from fal.ai
      const { clips: currentClips, musicTrack, settings: tlSettings, effects: tlEffects, beatMap: tlBeatMap } = useTimelineStore.getState();

      // Fetch latest from DB to pick up fal video URLs that arrived via background callback
      let mergedClips = currentClips;
      try {
        const dbTimeline: any = await api.getTimeline(id);
        if (dbTimeline?.clips?.length) {
          mergedClips = currentClips.map((zClip: any) => {
            const dbClip = dbTimeline.clips.find((c: any) => c.id === zClip.id);
            if (!dbClip) return zClip;
            const dbUrl: string = dbClip.generated_media_url || '';
            const zUrl: string = zClip.generated_media_url || '';
            // Prefer DB clip if it has a video URL (fal.ai async result) and Zustand doesn't
            const dbIsVideo = dbUrl.includes('.mp4') || dbClip.type === 'video';
            const zIsVideo = zUrl.includes('.mp4') || zClip.type === 'video';
            if (dbIsVideo && !zIsVideo && dbUrl) {
              return { ...zClip, generated_media_url: dbUrl, thumbnail_url: dbClip.thumbnail_url || zClip.thumbnail_url, type: dbClip.type || zClip.type };
            }
            return zClip;
          });
        }
      } catch { /* use Zustand as fallback */ }

      const currentTimeline = {
        clips: mergedClips,
        music_track: musicTrack || null,
        settings: tlSettings || { resolution: '1080p', aspect_ratio: '16:9', fps: 24 },
        total_duration_ms: mergedClips.reduce((s: number, c: any) => s + (c.duration_ms || 0), 0),
        effects: tlEffects || [],
        beat_map: tlBeatMap || null,
      };
      // Persist merged state to DB
      api.updateTimeline(id, currentTimeline).catch(() => {});

      setExportStatus('Starting render...');
      const result: any = await api.renderTrailer(id, currentTimeline);
      const jobId = result.job_id;
      if (!jobId) {
        setExportStatus(null);
        const msg = result.message || result.status || 'Render service unavailable';
        if (result.status === 'render_service_unavailable') {
          alert('Render service is not running. Start it with:\ncd services/render && uvicorn app.main:app --reload --port 8002');
        } else {
          alert(`Render failed: ${msg}`);
        }
        return;
      }
      setExportStatus('Rendering...');
      let attempts = 0;
      while (attempts < 120) {
        await new Promise((r) => setTimeout(r, 5000));
        if (cancelExportRef.current) { setExportStatus(null); break; }
        attempts++;
        try {
          const status: any = await api.getRenderStatus(id, jobId);
          setExportStatus(`Rendering... ${status.progress || 0}%`);
          if (status.status === 'done') {
            setExportStatus('Done!');
            const playbackUrl = status.preview_url || status.output_url || '';
            setCompiledUrl(playbackUrl || null);
            setShowRenderComplete(true);
            break;
          } else if (status.status === 'error') {
            setExportStatus(null);
            alert('Render failed: ' + (status.error || 'Unknown error'));
            break;
          }
        } catch { /* keep polling */ }
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Check console for details.');
    } finally {
      setExporting(false);
      setTimeout(() => setExportStatus(null), 3000);
    }
  }, [id, exporting]);

  const handleGenerate = useCallback(async (forceRegen = false) => {
    if (!currentProject || !id) return;

    const bookText = editStoryText || currentProject.book_text || currentProject.story_text || sessionStorage.getItem(`book_text_${id}`);
    const existingAnalysis = forceRegen ? null : currentProject.analysis;
    const characters = currentProject.characters || [];
    const uploadedImages = currentProject.uploaded_images || [];

    try {
      let analysis = (!forceRegen && existingAnalysis?.key_scenes) ? existingAnalysis : null;

      if (!analysis) {
        if (!bookText) { setGenError('No story uploaded yet.'); setGenStep('error'); return; }
        setGenStep('analyzing');
        const rawAnalysis: any = await api.analyzeStory(id, bookText, {
          characters: characters.length > 0 ? characters : undefined,
          uploaded_images: uploadedImages.length > 0 ? uploadedImages.map((i: any) => i.url) : undefined,
        });
        if (rawAnalysis?.status === 'ai_service_unavailable') {
          throw new Error('AI service is not running. Start it on port 8001.');
        }
        if (rawAnalysis?.error) {
          throw new Error(`Story analysis failed: ${rawAnalysis.error}`);
        }
        analysis = rawAnalysis;
        updateProject(id, { analysis, status: 'planning' });
      }

      setGenStep('planning');
      const currentMusicTrack = useTimelineStore.getState().musicTrack;
      const timeline: any = await api.planTrailer(id, { analysis, style: selectedStyle, music_track: currentMusicTrack || undefined });
      if (timeline?.status === 'ai_service_unavailable') {
        throw new Error('AI service is not running. Start it on port 8001.');
      }
      if (timeline?.error) {
        throw new Error(`AI planning failed: ${timeline.error}`);
      }
      if (!timeline?.clips?.length) {
        throw new Error('AI returned an empty trailer plan. Check the AI service logs.');
      }

      loadTimeline(timeline);
      updateProject(id, { status: 'editing' });
      setGenStep('done');
      sessionStorage.removeItem(`book_text_${id}`);

      try {
        await api.updateTimeline(id, {
          clips: timeline.clips,
          music_track: timeline.music_track || null,
          settings: timeline.settings || { resolution: '1080p', aspect_ratio: '16:9', fps: 24 },
          total_duration_ms: timeline.total_duration_ms || 0,
          effects: timeline.effects || [],
          beat_map: timeline.beat_map || null,
        });
      } catch { /* non-fatal */ }
    } catch (err: any) {
      console.error('Generation failed:', err);
      setGenError(err.message || 'Failed to generate trailer.');
      setGenStep('error');
    }
  }, [currentProject, id, loadTimeline, updateProject, selectedStyle, editStoryText]);

  const handleReplan = useCallback(() => {
    // Keep analysis, just re-plan with current style
    handleGenerate(false);
  }, [handleGenerate]);

  const handleRegenFromScratch = useCallback(() => {
    // Clear analysis + re-analyze + re-plan
    if (currentProject && id) updateProject(id, { analysis: undefined });
    handleGenerate(true);
  }, [currentProject, id, updateProject, handleGenerate]);

  const handleSaveSettings = useCallback(async () => {
    if (!id) return;
    setSavingSettings(true);
    try {
      // Persist thumbnail locally — data URLs are too large for API body limits
      if (editThumbnail) {
        localStorage.setItem(`cover_image_${id}`, editThumbnail);
      } else {
        localStorage.removeItem(`cover_image_${id}`);
      }
      if (editStoryText) sessionStorage.setItem(`book_text_${id}`, editStoryText);

      // Update in-memory store immediately so dashboard reflects the change
      updateProject(id, {
        title: editTitle,
        description: editDesc,
        book_text: editStoryText,
        cover_image_url: editThumbnail || undefined,
      });

      // Persist text fields to API (skip cover_image_url if it's a data URL — too large)
      const apiPayload: Record<string, any> = { title: editTitle, description: editDesc };
      if (editThumbnail && !editThumbnail.startsWith('data:')) {
        apiPayload.cover_image_url = editThumbnail;
      }
      await api.updateProject(id, apiPayload).catch(() => {});
    } finally {
      setSavingSettings(false);
    }
  }, [id, editTitle, editDesc, editStoryText, editThumbnail, updateProject]);

  const handleGetSuggestions = useCallback(async () => {
    if (!id || loadingSuggestions) return;
    setLoadingSuggestions(true);
    try {
      const timeline = { clips, music_track: useTimelineStore.getState().musicTrack, settings: useTimelineStore.getState().settings };
      const result: any = await api.getSuggestions(id, timeline, currentProject?.analysis);
      setSuggestions(result.suggestions || []);
    } catch { setSuggestions([]); } finally { setLoadingSuggestions(false); }
  }, [id, clips, currentProject, loadingSuggestions]);

  const handleDeleteProject = useCallback(async () => {
    if (!id) return;
    setDeletingProject(true);
    try {
      await api.deleteProject(id).catch(() => {});
      removeProject(id);
      localStorage.removeItem(`cover_image_${id}`);
      router.push('/dashboard');
    } finally {
      setDeletingProject(false);
    }
  }, [id, removeProject, router]);

  // Batch generate scene images sequentially for visual cohesion
  const handleGenerateAllImages = useCallback(async () => {
    if (!id) return;
    cancelImagesRef.current = false;
    setBatchGenerating(true);
    const analysis = currentProject?.analysis;
    const chars = (analysis?.characters as any[] || []).map((c: any) => ({
      name: c.name, description: c.description, appearance: c.appearance, image_url: c.image_url,
    }));

    // Build a strong visual style seed — injected first in every prompt so Gemini
    // commits to a single consistent art style, palette, and character look.
    const moodLower = (analysis?.mood || '').toLowerCase();
    const genreLower = (analysis?.genre || '').toLowerCase();
    const palette = genreLower.includes('horror') ? 'deep blacks, blood red, desaturated greens'
      : genreLower.includes('romance') ? 'soft pinks, warm golds, gentle pastels'
      : moodLower.includes('epic') || moodLower.includes('somber') ? 'muted earth tones, deep navy shadows, amber fire highlights'
      : 'rich jewel tones, high contrast shadows';
    const charLines = chars.map((c: any) => c.appearance ? `${c.name} — ${c.appearance}` : '').filter(Boolean).join('; ');
    const styleSeed = [
      'ART STYLE: hand-drawn manga illustration, thick bold black ink outlines, heavy chiaroscuro ink-wash shading, flat cel-shading, no photorealism, no 3D CGI, no watercolor',
      'ACTION: every frame shows MAXIMUM physical action — full-body heavy swings, explosive impacts, dramatic leaps at peak extension, bodies mid-motion with full weight and force visible, never static or posed',
      'MOTION: speed lines radiating from impact, motion blur on limbs, shockwave distortion rings, debris and dust from impacts, energy crackles',
      `COLOR PALETTE: ${palette}, consistent across every scene, high contrast black shadows`,
      charLines ? `CHARACTERS (draw identically every scene): ${charLines}` : '',
      `TONE: ${analysis?.mood || 'intense'}, fast-paced ${analysis?.genre || 'action'} manga AMV`,
    ].filter(Boolean).join('. ');

    const sorted = [...clips].sort((a, b) => a.order - b.order);
    const playable = sorted.filter(c => c.type !== 'transition');
    const pending = playable.filter(c =>
      c.gen_status === 'pending' || c.gen_status === 'error' || (c.gen_status === 'done' && !c.thumbnail_url)
    );

    // Seed the consistency chain with the existing thumbnail so clip 1 is grounded
    // in the same visual world as the cover. Falls back to nearest already-done clip.
    const existingThumb = currentProject?.cover_image_url;
    let prevUrl: string | undefined = (existingThumb && !existingThumb.startsWith('data:')) ? existingThumb : undefined;

    // Generate one at a time sequentially — each clip uses the previous as a reference frame
    const { beatMap } = useTimelineStore.getState();
    let prevPrompt: string | undefined;
    let clipTimestampMs = 0;
    for (const clip of pending) {
      if (cancelImagesRef.current) {
        updateClip(clip.id, { gen_status: 'pending' });
        break;
      }
      const order = sorted.findIndex(c => c.id === clip.id);

      // Compute clip's start timestamp in the music timeline
      const clipStart = sorted.slice(0, order).reduce((sum, c) => sum + (c.duration_ms || 0), 0);
      clipTimestampMs = clipStart;

      // Music energy at this timestamp: fraction of beats that land within ±500ms
      let musicEnergy: number | undefined;
      if (beatMap?.beats?.length) {
        const nearbyBeats = beatMap.beats.filter(b => Math.abs(b - clipStart) < 500).length;
        const windowBeats = beatMap.beats.filter(b => b >= clipStart - 2000 && b <= clipStart + 2000).length;
        musicEnergy = Math.min(1, windowBeats / 8); // normalise
        if (nearbyBeats > 0) musicEnergy = Math.min(1, musicEnergy + 0.3); // boost if on a beat
      }

      // Find nearest already-done clip before this one for reference image chain
      if (!prevUrl) {
        const prevDone = sorted.slice(0, order).reverse().find(
          c => c.type !== 'text_overlay' && c.type !== 'transition' && c.generated_media_url && !c.generated_media_url.startsWith('data:')
        );
        if (prevDone) prevUrl = prevDone.generated_media_url!;
      }
      if (!prevPrompt) {
        const prevDone = sorted.slice(0, order).reverse().find(
          c => c.type !== 'text_overlay' && c.type !== 'transition' && c.prompt
        );
        if (prevDone) prevPrompt = prevDone.prompt;
      }

      updateClip(clip.id, { gen_status: 'generating' });

      // Try up to 2 times (once retry on failure) with 1.5s gap between clips for rate limits
      let result: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
        try {
          const clipType = clip.type === 'text_overlay' ? 'text_overlay' : 'image';
          result = await api.generateClip(id, clip.id, clip.prompt, clipType, {
            clip_order: order,
            clip_total: playable.length,
            scene_image_url: clip.type !== 'text_overlay' ? prevUrl : undefined,
            // Pass previous panel as reference so Gemini matches style/palette exactly
            reference_image_url: prevUrl && clip.type !== 'text_overlay' ? prevUrl : undefined,
            characters: chars.length > 0 ? chars : undefined,
            mood: analysis?.mood,
            genre: analysis?.genre,
            style_seed: styleSeed,
            prev_scene_prompt: clip.type !== 'text_overlay' ? prevPrompt : undefined,
            text: (clip as any).text || undefined,
            music_timestamp_ms: clipTimestampMs,
            music_energy: musicEnergy,
          });
          if (result.status === 'done' || result.media_url) break;
        } catch (err: any) {
          result = { status: 'error', message: String(err) };
        }
      }

      const url = result?.media_url || result?.output_url || result?.generated_media_url;
      if (url) {
        updateClip(clip.id, { gen_status: 'done', generated_media_url: url, thumbnail_url: result.thumbnail_url || url });
        if (clip.type !== 'text_overlay') { prevUrl = url; prevPrompt = clip.prompt; }
      } else if (result?.status === 'generating') {
        // Async video — WebSocket callback will update
      } else {
        updateClip(clip.id, { gen_status: 'error', gen_error: result?.message || 'No image returned' });
      }

      // Rate limit buffer between clips (Imagen QPM limit)
      if (!cancelImagesRef.current) await new Promise(r => setTimeout(r, 1500));
    }
    setBatchGenerating(false);
  }, [id, clips, currentProject, updateClip]);

  // Compile all scene images → Veo videos (fires requests, WebSocket callbacks update each clip)
  const handleGenerateAllVideos = useCallback(async () => {
    if (!id || generatingVideos) return;
    const analysis = currentProject?.analysis;
    const chars = (analysis?.characters as any[] || []).map((c: any) => ({
      name: c.name,
      description: c.description,
      visual_description: c.visual_description,
      appearance: c.appearance,
      image_url: c.image_url || c.reference_image_url,
    }));
    const sorted = [...clips].sort((a, b) => a.order - b.order);
    const toConvert = sorted.filter(c => c.type !== 'transition' && c.type !== 'video' && c.thumbnail_url);

    // Style seed for visual consistency across all clips
    const vidMoodLower = (analysis?.mood || '').toLowerCase();
    const vidGenreLower = (analysis?.genre || '').toLowerCase();
    const vidPalette = vidGenreLower.includes('horror') ? 'deep blacks, blood red, desaturated greens'
      : vidGenreLower.includes('romance') ? 'soft pinks, warm golds, gentle pastels'
      : vidMoodLower.includes('epic') || vidMoodLower.includes('somber') ? 'muted earth tones, deep navy shadows, amber fire highlights'
      : 'rich jewel tones, high contrast shadows';
    const vidCharLines = chars.slice(0, 3).map((c: any) => c.appearance ? `${c.name} — ${c.appearance}` : '').filter(Boolean).join('; ');
    const styleSeed = [
      'manga AMV style, thick bold ink outlines, heavy cel-shading, no photorealism, no 3D CGI',
      'MOTION: massive full-body action every clip — heavy sword swings at full extension, explosive impacts, dramatic leaps, shockwave rings, speed lines, motion blur on limbs, debris flying',
      `color palette: ${vidPalette}, same across all clips, high contrast black ink shadows`,
      vidCharLines ? `characters (draw consistently): ${vidCharLines}` : '',
      `fast-paced ${analysis?.mood || 'intense'} ${analysis?.genre || 'action'} tone`,
    ].filter(Boolean).join('. ') || undefined;

    cancelVideosRef.current = false;
    setGeneratingVideos(true);
    setVideoGenProgress({ done: 0, total: toConvert.length });

    for (let i = 0; i < toConvert.length; i++) {
      if (cancelVideosRef.current) {
        updateClip(toConvert[i].id, { gen_status: 'pending' });
        break;
      }
      const clip = toConvert[i];
      const order = sorted.findIndex(c => c.id === clip.id);
      const isCont = (clip as any).shot_type === 'continuous';
      const prev = order > 0 ? sorted[order - 1] : null;
      const next = order < sorted.length - 1 ? sorted[order + 1] : null;
      const startFrame = isCont
        ? (prev?.thumbnail_url && !prev.thumbnail_url.startsWith('data:') ? prev.thumbnail_url : clip.thumbnail_url)
        : (clip.thumbnail_url && !clip.thumbnail_url.startsWith('data:') ? clip.thumbnail_url : undefined);

      updateClip(clip.id, { gen_status: 'generating' });
      try {
        const result: any = await api.generateClip(id, clip.id, clip.prompt, 'video', {
          clip_order: order,
          clip_total: sorted.length,
          scene_image_url: startFrame,
          characters: chars.length > 0 ? chars : undefined,
          mood: analysis?.mood,
          genre: analysis?.genre,
          style_seed: styleSeed,
          shot_type: (clip as any).shot_type || 'cut',
          is_continuous: isCont,
          prev_scene_prompt: prev?.prompt,
          next_scene_prompt: next?.prompt,
        });
        // Veo is async — returns {status:"generating"} immediately.
        // WebSocket callback (clip_updated) will set gen_status, generated_media_url, and type:'video' when done.
        // Only mark error here if the request itself failed.
        if (result?.status === 'error') {
          updateClip(clip.id, { gen_status: 'error', gen_error: result?.message });
        }
      } catch (err) {
        updateClip(clip.id, { gen_status: 'error', gen_error: String(err) });
      }
      setVideoGenProgress({ done: i + 1, total: toConvert.length });
    }
    setGeneratingVideos(false);
  }, [id, clips, currentProject, updateClip, generatingVideos]);

  const handleStartAddChar = () => { setAddingChar(true); setNewCharName(''); setNewCharDesc(''); };
  const handleConfirmAddChar = () => {
    if (!newCharName.trim()) return;
    addCharacter({ name: newCharName.trim(), description: newCharDesc.trim() });
    setAddingChar(false);
  };
  const handleStartEditChar = (c: CharacterEntry) => {
    setEditingCharId(c.id);
    setEditCharName(c.name);
    setEditCharDesc(c.description);
  };
  const handleConfirmEditChar = () => {
    if (!editingCharId) return;
    updateCharacter(editingCharId, { name: editCharName.trim(), description: editCharDesc.trim() });
    setEditingCharId(null);
  };

  const hasBook = currentProject && (
    currentProject.book_text || currentProject.story_text || currentProject.book_file_url ||
    (typeof window !== 'undefined' && sessionStorage.getItem(`book_text_${id}`))
  );
  const alreadyEditing = ['editing', 'rendering', 'done'].includes(currentProject?.status || '');
  const showOnboarding = !loading && !error && clips.length === 0 && hasBook && genStep !== 'done' && !alreadyEditing && !genDismissed;
  const isGenerating = genStep === 'analyzing' || genStep === 'planning';

  // Workflow phase detection
  const playableClips = clips.filter(c => c.type !== 'text_overlay' && c.type !== 'transition');
  // imagesAllDone: all clips have a thumbnail (image) — true even when clips are generating videos
  const imagesAllDone = playableClips.length > 0 && playableClips.every(c =>
    !!c.thumbnail_url || c.gen_status === 'error'
  );
  const anyGenerating = playableClips.some(c => c.gen_status === 'generating');
  const videosExist = playableClips.some(c => c.type === 'video' && c.gen_status === 'done' && !!c.generated_media_url);
  // Clips that are eligible for video generation (excludes text_overlay/transition which stay as images)
  const videoEligibleClips = playableClips.filter(c => c.type !== 'transition' && !!c.thumbnail_url);
  const allVideosGenerated = videoEligibleClips.length > 0 && videoEligibleClips.every(c =>
    (c.type === 'video' && c.gen_status === 'done' && !!c.generated_media_url) ||
    c.type === 'text_overlay'
  );
  const workflowPhase: WorkflowPhase =
    clips.length === 0 ? 'plan' :
    !imagesAllDone ? 'images' :
    !videosExist ? 'videos' :
    'effects';
  const WORKFLOW_STEPS: { key: WorkflowPhase; label: string }[] = [
    { key: 'plan', label: 'PLAN SCENES' },
    { key: 'images', label: 'GEN IMAGES' },
    { key: 'videos', label: 'GEN VIDEOS' },
    { key: 'effects', label: 'ADD EFFECTS' },
  ];

  // All characters: project characters + any AI-detected ones not already in the list
  const projectChars = currentProject?.characters || [];
  const aiChars: any[] = (currentProject?.analysis?.characters || []).filter(
    (ac: any) => !projectChars.some((pc) => pc.name.toLowerCase() === (ac.name || '').toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center overflow-hidden" style={{ background: '#fff' }}>
        {/* Halftone dot background */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="htdots-load" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="4" cy="4" r="1.2" fill="#111" opacity="0.07" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#htdots-load)" />
          {/* Speed lines */}
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i / 24) * 360;
            const rad   = (angle * Math.PI) / 180;
            const x1 = (50 + Math.cos(rad) * 3).toFixed(2);
            const y1 = (50 + Math.sin(rad) * 3).toFixed(2);
            const x2 = (50 + Math.cos(rad) * 70).toFixed(2);
            const y2 = (50 + Math.sin(rad) * 70).toFixed(2);
            const thick = i % 6 === 0 ? 2 : i % 3 === 0 ? 1 : 0.4;
            const op    = i % 6 === 0 ? 0.1 : i % 3 === 0 ? 0.06 : 0.03;
            return <line key={i} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke="#111" strokeWidth={thick} opacity={op} />;
          })}
        </svg>
        {/* Center content — mirrors PageTransition overlay */}
        <div className="relative flex flex-col items-center gap-3">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="relative shrink-0">
              <img src="/logo.png" alt="Lotus" width={88} height={88} className="drop-shadow-[0_0_24px_rgba(168,85,247,0.5)]" />
              <div className="absolute inset-[-16px] rounded-full border-[3px] border-[#a855f7]/20 animate-ping" style={{ animationDuration: '1.6s' }} />
            </div>
            {/* LOTUS letters */}
            <div className="flex items-center gap-[0.02em]" style={{ fontFamily: 'var(--font-manga)' }}>
              {'LOTUS'.split('').map((char, i) => (
                <span
                  key={i}
                  className="inline-block select-none"
                  style={{
                    fontSize: 'clamp(2.2rem, 6vw, 4.5rem)',
                    color: '#fff',
                    WebkitTextStroke: '3px #111',
                    paintOrder: 'stroke fill',
                    textShadow: '4px 4px 0px #ff3fa4, 6px 6px 0px #c0005e',
                    lineHeight: 1,
                  }}
                >
                  {char}
                </span>
              ))}
            </div>
          </div>
          <div className="text-[0.65rem] text-[#999] uppercase tracking-[0.3em] select-none" style={{ fontFamily: 'var(--font-manga)' }}>
            AI Book Trailer Generator
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/dashboard" className="text-[#111] hover:text-[#555] underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div ref={flashOverlayRef} className="fixed inset-0 z-50 bg-[#111] pointer-events-none" style={{ display: 'none', opacity: 0 }} />

      {/* Top bar */}
      <header ref={topBarRef} className="h-12 border-b-2 border-[#ccc] flex items-center px-4 gap-3 shrink-0 bg-white/80 backdrop-blur-sm">
        <Link href="/dashboard" className="text-[#888] hover:text-[#111] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div ref={editorHeaderRef} className="flex items-center gap-2 min-w-0">
          <Film size={28} className="text-[#111] shrink-0" />
          <span
            className="font-bold text-2xl"
            style={{ fontFamily: 'var(--font-manga)', color: '#fff', WebkitTextStroke: '2px #111', paintOrder: 'stroke fill', textShadow: '3px 3px 0px #000', whiteSpace: 'nowrap' }}
          >
            {currentProject?.title || 'Lotus Editor'}
          </span>
        </div>
        <div className="ml-auto flex items-stretch gap-2">
          {currentProject && (
            <button
              onClick={() => setShowSettings(true)}
              className={`manga-btn px-2.5 text-sm flex items-center gap-1.5 transition-colors ${showSettings ? 'bg-[#111] text-white' : 'bg-white text-[#111] hover:text-black'}`}
              title="Settings"
            >
              <Settings size={14} />
            </button>
          )}
          {clips.length > 0 && (
            <button onClick={handleGetSuggestions} disabled={loadingSuggestions} className="manga-btn bg-white text-[#111] px-3 py-1.5 text-sm flex items-center gap-1.5">
              {loadingSuggestions ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />} Suggest
            </button>
          )}
          {/* Emergency reset — always visible when clips are stuck but no active batch running */}
          {anyGenerating && !batchGenerating && !generatingVideos && (
            <button
              onClick={() => {
                const stuck = useTimelineStore.getState().clips.filter(c => c.gen_status === 'generating');
                stuck.forEach(c => updateClip(c.id, { gen_status: 'pending' }));
                setGeneratingVideos(false);
                setBatchGenerating(false);
                setVideoCancelled(false);
                if (id) sessionStorage.removeItem(`video_cancelled_${id}`);
                const updatedClips = useTimelineStore.getState().clips;
                if (id) api.updateTimeline(id, { clips: updatedClips }).catch(() => {});
              }}
              className="manga-btn bg-red-50 text-red-600 px-3 py-1.5 text-sm flex items-center gap-1.5 border-red-300 hover:bg-red-100 transition-colors"
              title="Reset clips stuck in generating state"
            >
              <X size={13} /> Reset Stuck ({playableClips.filter(c => c.gen_status === 'generating').length})
            </button>
          )}
          {/* Phase-aware primary CTA */}
          {workflowPhase === 'images' && batchGenerating && (
            <button
              onClick={() => { cancelImagesRef.current = true; setBatchGenerating(false); playableClips.filter(c => c.gen_status === 'generating').forEach(c => updateClip(c.id, { gen_status: 'pending' })); }}
              className="manga-btn bg-purple-600/20 text-purple-700 px-3 py-1.5 text-sm flex items-center gap-2 border-purple-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors"
            >
              <Loader2 size={14} className="animate-spin" />
              {playableClips.filter(c => c.gen_status === 'done' && c.generated_media_url).length}/{playableClips.length} Generating… <X size={12} />
            </button>
          )}
          {workflowPhase === 'images' && !batchGenerating && playableClips.some(c => c.gen_status === 'pending' || c.gen_status === 'error' || (c.gen_status === 'done' && !c.generated_media_url)) && (
            <button onClick={handleGenerateAllImages} className="manga-btn bg-purple-600 text-white px-3 py-1.5 text-sm flex items-center gap-1.5 border-purple-600">
              <Sparkles size={14} /> {playableClips.some(c => c.gen_status === 'error') ? 'Retry Failed' : 'Generate All Images'}
            </button>
          )}
          {(workflowPhase === 'videos') && anyGenerating && !videoCancelled && (
            <button
              onClick={() => {
                cancelVideosRef.current = true;
                const generating = playableClips.filter(c => c.gen_status === 'generating');
                generating.forEach(c => {
                  cancelledVideoClipsRef.current.add(c.id);
                  // Reset to pending (not done) — no video was actually generated
                  updateClip(c.id, { gen_status: 'pending' });
                });
                setGeneratingVideos(false);
                setVideoCancelled(true);
                if (id) sessionStorage.setItem(`video_cancelled_${id}`, '1');
                // Persist to DB so re-entry doesn't see stale 'generating' status
                if (id) {
                  const updatedClips = useTimelineStore.getState().clips;
                  api.updateTimeline(id, { clips: updatedClips }).catch(() => {});
                }
              }}
              className="manga-btn bg-blue-600/20 text-blue-700 px-3 py-1.5 text-sm flex items-center gap-2 border-blue-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors"
            >
              <Loader2 size={14} className="animate-spin" />
              {playableClips.filter(c => c.type === 'video' && c.gen_status === 'done').length}/{playableClips.length} Generating Videos… <X size={12} />
            </button>
          )}
          {imagesAllDone && !allVideosGenerated && !anyGenerating && !generatingVideos && !videoCancelled && (
            <button
              onClick={() => {
                if (id) sessionStorage.removeItem(`video_cancelled_${id}`);
                setVideoCancelled(false);
                handleGenerateAllVideos();
              }}
              className="manga-btn bg-blue-600 text-white px-3 py-1.5 text-sm flex items-center gap-1.5 border-blue-600"
            >
              <Film size={14} /> Generate Videos
            </button>
          )}
          {imagesAllDone && (
            <button
              onClick={exporting ? () => { cancelExportRef.current = true; setExporting(false); setExportStatus(null); } : handleExport}
              className={`manga-btn px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                exporting
                  ? 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100'
                  : allVideosGenerated
                    ? 'bg-[#111] text-white border-[#111]'
                    : 'bg-white text-[#111]'
              }`}
              style={!exporting && allVideosGenerated ? { boxShadow: '3px 3px 0px #a855f7' } : undefined}
            >
              {exporting
                ? <><Loader2 size={14} className="animate-spin" /> {exportStatus || 'Compiling…'} <X size={12} /></>
                : <><Clapperboard size={14} /> Compile Videos</>
              }
            </button>
          )}
          {clips.some(c => c.generated_media_url) && (
            <button
              onClick={() => setShowPreview(true)}
              className="manga-btn bg-[#a855f7] text-white px-3 py-1.5 text-sm flex items-center gap-1.5 border-[#a855f7] hover:bg-[#9333ea]"
            >
              <Play size={14} /> Preview
            </button>
          )}
          {clips.length > 0 && (
            <Link
              href={`/project/${id}/timeline`}
              className="manga-btn px-3 py-1.5 text-sm flex items-center gap-1.5 font-bold transition-all bg-[#fbbf24] text-black border-[#fbbf24]"
              title="Edit timeline & effects"
            >
              <Edit2 size={14} /> Edit
            </Link>
          )}
        </div>
      </header>

      {/* Workflow phase strip */}
      {clips.length > 0 && (
        <div className="h-8 border-b border-[#e5e5e5] bg-white flex items-stretch px-3 gap-0 shrink-0 overflow-x-auto">
          {WORKFLOW_STEPS.map(({ key, label }, i) => {
            const stepIdx = WORKFLOW_STEPS.findIndex(s => s.key === workflowPhase);
            const done = i < stepIdx;
            const active = key === workflowPhase;
            return (
              <div key={key} className="flex items-center">
                <div
                  className={`flex items-center gap-1.5 px-3 h-full text-[0.58rem] font-black tracking-widest transition-all relative ${
                    active
                      ? 'bg-[#111] text-white'
                      : done
                      ? 'text-[#111] hover:bg-[#f5f5f5]'
                      : 'text-[#ccc]'
                  }`}
                  style={{ fontFamily: 'var(--font-manga)' }}
                >
                  {/* Active step bottom border accent */}
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#a855f7]" />
                  )}
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[0.5rem] font-black shrink-0 ${
                      active ? 'bg-white text-[#111]' :
                      done ? 'bg-[#111] text-white' : 'bg-[#e5e5e5] text-[#bbb]'
                    }`}
                  >
                    {done ? <Check size={7} strokeWidth={3.5} /> : i + 1}
                  </span>
                  {label}
                </div>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <span className="text-[#ddd] text-xs px-0.5 self-center">›</span>
                )}
              </div>
            );
          })}
          {generatingVideos && (
            <div className="ml-3 flex items-center gap-1.5 text-[0.55rem] text-blue-600 font-black" style={{ fontFamily: 'var(--font-manga)' }}>
              <Loader2 size={9} className="animate-spin" />
              COMPILING {videoGenProgress.done}/{videoGenProgress.total}
            </div>
          )}
          {/* Clip stats */}
          <div className="ml-auto flex items-center gap-3 pr-1">
            <span className="text-[0.52rem] text-[#bbb] font-bold" style={{ fontFamily: 'var(--font-manga)' }}>
              {clips.filter(c => c.gen_status === 'done').length}/{clips.length} GENERATED
            </span>
            <span className="text-[0.52rem] text-[#bbb] font-bold" style={{ fontFamily: 'var(--font-manga)' }}>
              {(clips.reduce((s, c) => s + c.duration_ms, 0) / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Left sidebar — tabbed */}
        {currentProject && clips.length > 0 && (
          <div
            ref={leftSidebarRef}
            className="shrink-0 border-r-2 border-[#ccc] bg-white flex flex-col overflow-hidden"
            style={{ width: leftOpen ? 220 : 24 }}
          >
            {/* Collapsed strip */}
            {!leftOpen && (
              <button
                onClick={openLeft}
                className="flex-1 flex items-center justify-center text-[#888] hover:text-[#111] hover:bg-[#f0f0f0] transition-colors"
                title="Expand sidebar"
              >
                <ChevronRight size={13} />
              </button>
            )}

            {/* Open sidebar content */}
            {leftOpen && (
              <>
                {/* Tab buttons */}
                <div className="flex border-b-2 border-[#ccc] shrink-0">
                  <button
                    onClick={closeLeft}
                    className="px-2 flex items-center justify-center text-[#888] hover:text-[#111] hover:bg-[#f0f0f0] transition-colors border-r border-[#eee]"
                    title="Collapse"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  {([
                    { key: 'story', icon: <BarChart2 size={12} />, label: 'STORY' },
                    { key: 'chars', icon: <Users size={12} />, label: 'CHARS' },
                    { key: 'audio' as const, icon: <Music size={12} />, label: 'AUDIO' },
                  ] as const).map(({ key, icon, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[0.55rem] font-bold tracking-wider transition-colors ${
                        activeTab === key ? 'bg-[#111] text-white' : 'text-[#888] hover:bg-[#f0f0f0]'
                      }`}
                      style={{ fontFamily: 'var(--font-manga)' }}
                    >
                      {icon}{label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-3 space-y-4">

                  {/* STORY TAB */}
                  {activeTab === 'story' && (
                    <>
                      <div>
                        <span className="manga-accent-bar text-[0.6rem]">PROJECT</span>
                        <h3
                          className="text-lg font-bold mt-2 leading-snug"
                          style={{ fontFamily: 'var(--font-manga)', color: '#fff', WebkitTextStroke: '1.5px #111', paintOrder: 'stroke fill', textShadow: '2px 2px 0px #000' }}
                        >{currentProject.title}</h3>
                        {currentProject.description && (
                          <p className="text-[0.7rem] text-[#888] mt-1 leading-relaxed">{currentProject.description}</p>
                        )}
                      </div>

                      {currentProject.analysis && (
                        <div>
                          <span className="manga-accent-bar text-[0.6rem]">ANALYSIS</span>
                          <div className="mt-2 space-y-1">
                            {currentProject.analysis.genre && (
                              <p className="text-xs text-[#666]"><span className="font-medium text-[#111]">Genre:</span> {currentProject.analysis.genre}</p>
                            )}
                            {currentProject.analysis.mood && (
                              <p className="text-xs text-[#666]"><span className="font-medium text-[#111]">Mood:</span> {currentProject.analysis.mood}</p>
                            )}
                            {currentProject.analysis.themes && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(currentProject.analysis.themes as string[]).slice(0, 4).map((t: string) => (
                                  <span key={t} className="text-[0.6rem] bg-[#f0f0f0] border border-[#ccc] px-1.5 py-0.5 text-[#666]">{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        <span className="manga-accent-bar text-[0.6rem]">TIMELINE</span>
                        <div className="mt-2 text-xs text-[#666] space-y-0.5">
                          <p>{clips.length} clips</p>
                          <p>{(clips.reduce((s, c) => s + c.duration_ms, 0) / 1000).toFixed(1)}s total</p>
                          <p>{clips.filter(c => c.gen_status === 'done').length} generated</p>
                          <p>{clips.filter(c => c.gen_status === 'pending').length} pending</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* AUDIO TAB */}
                  {activeTab === 'audio' && <AudioTab
                    projectId={id}
                    audioAnalysis={currentProject.audio_analysis as any}
                    musicTrack={musicTrack}
                    clips={clips}
                    onSyncApplied={(updates) => {
                      const { updateClip } = useTimelineStore.getState();
                      updates.forEach(({ id: clipId, duration_ms }) => updateClip(clipId, { duration_ms }));
                      const { clips: updatedClips, musicTrack: mt, settings: tlSettings } = useTimelineStore.getState();
                      api.updateTimeline(id, { clips: updatedClips, music_track: mt, settings: tlSettings }).catch(() => {});
                    }}
                    onAudioUploaded={(result) => {
                      updateProject(id, { audio_analysis: result.audio_analysis });
                      const analysis = result.audio_analysis || {};
                      const durationMs = Math.round((analysis.duration_s || 0) * 1000);
                      const music_track = {
                        url: result.file_url || '',
                        name: result.file_name || 'Music',
                        duration_ms: durationMs,
                        volume: 0.8,
                        bpm: analysis.bpm,
                      };
                      // Build beat_map from actual detected beat timestamps (not just BPM grid)
                      // ALL times from librosa are in seconds → convert everything to ms
                      const s2ms = (t: number) => Math.round(t * 1000);
                      const rawBeats: number[] = (analysis.beat_timestamps || []).map(s2ms);
                      const beat_map = rawBeats.length > 0 ? {
                        bpm: analysis.bpm || 120,
                        offset_ms: rawBeats[0] || 0,
                        beats: rawBeats,
                        beat_strengths: analysis.beat_strengths || [],
                        downbeats: (analysis.downbeat_timestamps || []).map(s2ms),
                        onsets: (analysis.onset_times || []).map(s2ms),
                        energy_peaks: (analysis.energy_peaks || []).map(s2ms),
                        energy_curve: analysis.energy_curve || [],   // already 0-1, one per 100ms
                        section_boundaries: (analysis.section_boundaries || []).map(s2ms),
                        // Per-instrument — all converted from seconds to ms
                        kicks: (analysis.kick_times || []).map(s2ms),
                        snares: (analysis.snare_times || []).map(s2ms),
                        hihats: (analysis.hihat_times || []).map(s2ms),
                        crashes: (analysis.crash_times || []).map(s2ms),
                        horns: (analysis.horn_times || []).map(s2ms),
                      } : null;
                      const { setMusicTrack, setBeatMap, clips: tlClips, settings: tlSettings, effects: tlEffects } = useTimelineStore.getState();
                      setMusicTrack(music_track);
                      if (beat_map) setBeatMap(beat_map);
                      api.updateTimeline(id, { clips: tlClips, music_track, settings: tlSettings, effects: tlEffects, beat_map }).catch(() => {});
                    }}
                  />}

                  {/* CHARS TAB */}
                  {activeTab === 'chars' && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="manga-accent-bar text-[0.6rem]">CHARACTERS</span>
                          {!addingChar && (
                            <button onClick={handleStartAddChar} className="text-[#888] hover:text-[#111] transition-colors" title="Add character">
                              <Plus size={14} />
                            </button>
                          )}
                        </div>

                        {/* Add new character form */}
                        {addingChar && (
                          <div className="mb-3 p-2 border-2 border-[#111] bg-[#f9f9f9] space-y-1.5">
                            <input
                              autoFocus
                              value={newCharName}
                              onChange={(e) => setNewCharName(e.target.value)}
                              placeholder="Name..."
                              className="manga-input w-full text-xs py-1"
                            />
                            <textarea
                              value={newCharDesc}
                              onChange={(e) => setNewCharDesc(e.target.value)}
                              placeholder="Description (role, appearance...)"
                              rows={2}
                              className="manga-input w-full text-xs resize-none"
                            />
                            <div className="flex gap-1">
                              <button onClick={handleConfirmAddChar} className="manga-btn bg-[#111] text-white px-2 py-1 text-xs flex items-center gap-1">
                                <Check size={10} /> Add
                              </button>
                              <button onClick={() => setAddingChar(false)} className="manga-btn bg-white text-[#888] px-2 py-1 text-xs">
                                <X size={10} />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Project characters (editable) */}
                        <div className="space-y-2">
                          {projectChars.length === 0 && aiChars.length === 0 && (
                            <p className="text-[0.65rem] text-[#aaa] italic">No characters yet. Add one or run analysis.</p>
                          )}
                          {projectChars.map((c) => (
                            <div key={c.id} className="border border-[#ddd] bg-white">
                              {editingCharId === c.id ? (
                                <div className="p-2 space-y-1.5">
                                  <input
                                    autoFocus
                                    value={editCharName}
                                    onChange={(e) => setEditCharName(e.target.value)}
                                    className="manga-input w-full text-xs py-1"
                                  />
                                  <textarea
                                    value={editCharDesc}
                                    onChange={(e) => setEditCharDesc(e.target.value)}
                                    rows={2}
                                    className="manga-input w-full text-xs resize-none"
                                  />
                                  <div className="flex gap-1">
                                    <button onClick={handleConfirmEditChar} className="manga-btn bg-[#111] text-white px-2 py-1 text-xs flex items-center gap-1">
                                      <Check size={10} /> Save
                                    </button>
                                    <button onClick={() => setEditingCharId(null)} className="manga-btn bg-white text-[#888] px-2 py-1 text-xs">
                                      <X size={10} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2 flex items-start justify-between gap-1">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-[#111] truncate">{c.name}</p>
                                    {c.description && <p className="text-[0.6rem] text-[#888] leading-snug mt-0.5 line-clamp-2">{c.description}</p>}
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => handleStartEditChar(c)} className="text-[#aaa] hover:text-[#111] transition-colors">
                                      <Edit2 size={11} />
                                    </button>
                                    <button onClick={() => removeCharacter(c.id)} className="text-[#aaa] hover:text-red-500 transition-colors">
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* AI-detected characters (read-only, from analysis) */}
                          {aiChars.length > 0 && (
                            <>
                              <p className="text-[0.55rem] text-[#aaa] uppercase tracking-wider mt-3 mb-1">AI Detected</p>
                              {aiChars.map((c: any, i: number) => (
                                <div key={i} className="border border-dashed border-[#ddd] bg-[#fafafa] p-2 flex items-start justify-between gap-1">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-[#666] truncate">{c.name}</p>
                                    {(c.description || c.role) && (
                                      <p className="text-[0.6rem] text-[#aaa] leading-snug mt-0.5 line-clamp-2">{c.description || c.role}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => addCharacter({ name: c.name, description: c.description || c.role || '' })}
                                    className="text-[#aaa] hover:text-[#111] transition-colors shrink-0"
                                    title="Add to project"
                                  >
                                    <Plus size={11} />
                                  </button>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}


                </div>
              </>
            )}
          </div>
        )}

        {/* Center: React Flow + Timeline Strip */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundImage: 'url(/bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <div className="flex-1">
            <FlowEditor onNodeClick={(clipId) => setSelectedClipId(clipId)} />
          </div>
          <TimelineStrip selectedClipId={selectedClipId} onSelectClip={setSelectedClipId} />
        </div>

        {/* Right: Clip Detail Panel + Chat */}
        <div
          ref={rightPanelRef}
          className="relative shrink-0 border-l-2 border-[#ccc] bg-white flex flex-col overflow-hidden"
          style={{ width: 320 }}
        >
          {/* Collapsed toggle — only visible when closed */}
          <button
            onClick={() => setRightOpen(true)}
            className="absolute inset-y-0 left-0 w-6 flex items-center justify-center text-[#888] hover:text-[#111] hover:bg-[#f0f0f0] transition-colors"
            style={{ display: rightOpen ? 'none' : 'flex' }}
            title="Expand panel"
          >
            <ChevronLeft size={13} />
          </button>
          {/* Content */}
          <div ref={rightContentRef} className="flex-1 flex flex-col overflow-hidden">
            {selectedClipId && clips.length > 0 ? (
              <ClipDetailPanel clipId={selectedClipId} onClose={() => setSelectedClipId(null)} />
            ) : (
              <ChatPanel projectId={id} onCollapse={() => setRightOpen(false)} />
            )}
          </div>
        </div>

        {/* Settings modal */}
        {showSettings && (
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-16 bg-black/30 backdrop-blur-[2px]" onClick={() => { setShowSettings(false); setConfirmDelete(false); }}>
            <div className="manga-panel bg-white w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#ccc]">
                <span className="manga-accent-bar text-xs">PROJECT SETTINGS</span>
                <button onClick={() => { setShowSettings(false); setConfirmDelete(false); }} className="text-[#888] hover:text-[#111] transition-colors"><X size={14} /></button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Book Thumbnail</label>
                    <button
                      onClick={async () => {
                        if (!currentProject) return;
                        setGeneratingThumb(true);
                        try {
                          const analysis = currentProject.analysis;
                          const chars = (analysis?.characters as any[] || []).map((c: any) => ({
                            name: c.name, description: c.description, appearance: c.appearance, image_url: c.image_url,
                          }));

                          // Same style seed used for scene generation — ensures cover shares
                          // the same palette, character designs, and art direction as the clips.
                          const coverMood = (analysis?.mood || '').toLowerCase();
                          const coverGenre = (analysis?.genre || '').toLowerCase();
                          const coverPalette = coverGenre.includes('horror') ? 'deep blacks, blood red, desaturated greens'
                            : coverGenre.includes('romance') ? 'soft pinks, warm golds, gentle pastels'
                            : coverMood.includes('epic') || coverMood.includes('somber') ? 'muted earth tones, deep navy shadows, amber fire highlights'
                            : 'rich jewel tones, high contrast shadows';
                          const coverCharLines = chars.map((c: any) => c.appearance ? `${c.name} — ${c.appearance}` : '').filter(Boolean).join('; ');
                          const styleSeed = [
                            'ART STYLE: hand-drawn manga illustration, bold black ink outlines, dramatic chiaroscuro shading, flat cel-shading with no photorealism, no 3D CGI',
                            `COLOR PALETTE: ${coverPalette}, same palette used in every scene`,
                            coverCharLines ? `CHARACTERS (always draw consistently): ${coverCharLines}` : '',
                            `TONE: ${analysis?.mood || 'dramatic'}, ${analysis?.genre || 'fantasy'} epic`,
                          ].filter(Boolean).join('. ');

                          // Pull scene descriptions from already-generated clips to ground
                          // the thumbnail in the visual world that has been established.
                          const sortedClips = [...clips].sort((a, b) => a.order - b.order);
                          const generatedScenes = sortedClips
                            .filter(c => c.gen_status === 'done' && c.generated_media_url && c.prompt)
                            .slice(0, 4)
                            .map(c => c.prompt)
                            .join('; ');

                          const prompt = [
                            `Epic book cover for "${currentProject.title}"`,
                            currentProject.description || '',
                            generatedScenes ? `Scenes established in this story: ${generatedScenes}` : '',
                            'Dramatic full-bleed cover art, iconic hero composition, bold manga linework',
                          ].filter(Boolean).join('. ');

                          const result: any = await api.generateImage(prompt);
                          const url = result.url || result.media_url || result.output_url;
                          if (url) setEditThumbnail(url);
                        } catch (e) { console.error(e); } finally { setGeneratingThumb(false); }
                      }}
                      disabled={generatingThumb}
                      className="manga-btn bg-purple-600 text-white px-2 py-0.5 text-[0.6rem] flex items-center gap-1 border-purple-600"
                    >
                      {generatingThumb ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                      {generatingThumb ? 'Generating...' : 'AI Generate'}
                    </button>
                  </div>

                  {editThumbnail ? (
                    <div className="relative group w-full border-2 border-[#ccc] overflow-hidden">
                      <img src={editThumbnail} alt="thumbnail" className="w-full h-auto block" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={() => thumbnailInputRef.current?.click()} className="manga-btn bg-white text-[#111] px-3 py-1 text-xs">
                          Replace
                        </button>
                        <button onClick={() => setCropSrc(editThumbnail)} className="manga-btn bg-white text-[#111] px-3 py-1 text-xs">
                          Recrop
                        </button>
                        <button onClick={() => { setEditThumbnail(''); }} className="manga-btn bg-white text-red-500 px-3 py-1 text-xs">
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => thumbnailInputRef.current?.click()}
                      className="w-full h-32 border-2 border-dashed border-[#ccc] cursor-pointer hover:border-[#111] transition-colors flex flex-col items-center justify-center gap-1 manga-halftone"
                    >
                      <Upload size={20} className="text-[#aaa]" />
                      <span className="text-xs text-[#aaa]">Click to upload</span>
                    </div>
                  )}

                  <input ref={thumbnailInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setCropSrc(reader.result as string);
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }} />
                </div>
                <div>
                  <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Title</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="manga-input w-full text-sm mt-1 py-1.5" />
                </div>
                <div>
                  <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Description</label>
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className="manga-input w-full text-sm mt-1 resize-none" />
                </div>
                <div>
                  <label className="text-[0.6rem] text-[#888] uppercase tracking-wider">Original Story Prompt</label>
                  <textarea value={editStoryText} onChange={(e) => setEditStoryText(e.target.value)} rows={4} placeholder="Your story text or prompt..." className="manga-input w-full text-sm mt-1 resize-none" />
                  <p className="text-[0.55rem] text-[#aaa] mt-0.5">Used for regeneration</p>
                </div>
                <button onClick={async () => { await handleSaveSettings(); setShowSettings(false); }} disabled={savingSettings} className="manga-btn w-full bg-[#111] text-white py-2 text-sm flex items-center justify-center gap-1.5">
                  {savingSettings ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Settings
                </button>
                <div className="border-t-2 border-[#eee] pt-3 space-y-2">
                  <span className="manga-accent-bar text-[0.6rem]">TRAILER STYLE</span>
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {STYLES.map((s) => (
                      <button key={s} onClick={() => setSelectedStyle(s)} className={`text-[0.6rem] py-1 px-1 border-2 transition-colors capitalize ${selectedStyle === s ? 'border-[#111] bg-[#111] text-white' : 'border-[#ccc] text-[#666] hover:border-[#888]'}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="border-t-2 border-[#eee] pt-3 space-y-2">
                  <span className="manga-accent-bar text-[0.6rem]">REGENERATION</span>
                  <button onClick={() => { handleReplan(); setShowSettings(false); }} disabled={isGenerating} className="manga-btn w-full bg-white text-[#111] py-1.5 text-sm flex items-center justify-center gap-1.5">
                    {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-plan with {selectedStyle} style
                  </button>
                  <button onClick={() => { handleRegenFromScratch(); setShowSettings(false); }} disabled={isGenerating} className="manga-btn w-full bg-[#111] text-white py-1.5 text-sm flex items-center justify-center gap-1.5">
                    {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Regenerate from Scratch
                  </button>
                  <p className="text-[0.55rem] text-[#aaa] text-center leading-snug">Re-plan keeps analysis. Regen from scratch re-analyzes the story.</p>
                </div>
                <div className="border-t-2 border-red-200 pt-3 space-y-2">
                  <span className="manga-accent-bar text-[0.6rem]" style={{ background: '#dc2626' }}>DANGER ZONE</span>
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="manga-btn w-full bg-white text-red-600 border-red-300 py-1.5 text-sm flex items-center justify-center gap-1.5 hover:bg-red-50"
                    >
                      <Trash2 size={13} /> Delete Project
                    </button>
                  ) : (
                    <div className="border-2 border-red-400 bg-red-50 p-3 space-y-2">
                      <p className="text-xs text-red-700 font-bold text-center uppercase tracking-wide">This cannot be undone!</p>
                      <p className="text-[0.6rem] text-red-500 text-center">All clips and timeline data will be lost.</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="manga-btn flex-1 bg-white text-[#888] py-1.5 text-xs flex items-center justify-center gap-1"
                        >
                          <X size={11} /> Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteProject}
                          disabled={deletingProject}
                          className="manga-btn flex-1 bg-red-600 text-white border-red-600 py-1.5 text-xs flex items-center justify-center gap-1"
                        >
                          {deletingProject ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Confirm Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trailer preview modal */}
        {showPreview && (
          <TrailerPreview
            clips={clips}
            musicTrack={musicTrack}
            compiledUrl={compiledUrl}
            onClose={() => setShowPreview(false)}
          />
        )}

        {/* Render complete popup */}
        {showRenderComplete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div
              className="manga-panel relative max-w-sm w-full mx-4 p-8 text-center"
              style={{ border: '3px solid #111', boxShadow: '6px 6px 0 #111' }}
            >
              {/* Speed lines SVG background */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-5" xmlns="http://www.w3.org/2000/svg">
                {Array.from({ length: 16 }).map((_, i) => {
                  const angle = (i / 16) * 360;
                  const rad = (angle * Math.PI) / 180;
                  return <line key={i} x1="50%" y1="50%" x2={`${50 + Math.cos(rad) * 80}%`} y2={`${50 + Math.sin(rad) * 80}%`} stroke="#111" strokeWidth="1" />;
                })}
              </svg>

              <div className="relative z-10">
                <div className="w-16 h-16 bg-[#111] flex items-center justify-center mx-auto mb-4 border-2 border-[#111]" style={{ boxShadow: '3px 3px 0 #a855f7' }}>
                  <Clapperboard size={28} className="text-white" />
                </div>
                <h2
                  className="text-3xl font-black mb-1"
                  style={{ fontFamily: 'var(--font-manga)', color: '#fff', WebkitTextStroke: '2px #111', paintOrder: 'stroke fill', textShadow: '3px 3px 0 #000' }}
                >
                  RENDER COMPLETE
                </h2>
                <p className="text-[#888] text-sm mb-6">Your trailer has been compiled successfully.</p>

                <div className="flex flex-col gap-2">
                  {compiledUrl && (
                    <button
                      onClick={() => { setShowRenderComplete(false); setShowPreview(true); }}
                      className="manga-btn bg-[#a855f7] text-white px-4 py-2.5 text-sm flex items-center justify-center gap-2 border-[#a855f7] hover:bg-[#9333ea] w-full"
                    >
                      <Play size={16} /> Watch Trailer
                    </button>
                  )}
                  {compiledUrl && (
                    <a
                      href={compiledUrl}
                      download
                      className="manga-btn bg-white text-[#111] px-4 py-2.5 text-sm flex items-center justify-center gap-2 border-[#111] hover:bg-[#f5f5f5] w-full"
                    >
                      <Download size={16} /> Download
                    </a>
                  )}
                  <button
                    onClick={() => setShowRenderComplete(false)}
                    className="text-[#aaa] hover:text-[#111] text-xs mt-1 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Image crop modal */}
        {cropSrc && (
          <ImageCropper
            src={cropSrc}
            onConfirm={(dataUrl) => { setEditThumbnail(dataUrl); setCropSrc(null); }}
            onCancel={() => setCropSrc(null)}
          />
        )}

        {/* Onboarding overlay */}
        {showOnboarding && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/90 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4">
              <div ref={onboardingCardRef} className="manga-panel-accent p-8 relative">
                <button
                  onClick={() => { setGenDismissed(true); localStorage.setItem(`gen_dismissed_${id}`, 'true'); }}
                  className="absolute top-3 right-3 text-[#aaa] hover:text-[#111] transition-colors"
                  title="Exit"
                >
                  <X size={16} />
                </button>
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-6">
                  <Sparkles size={28} className="text-[#111]" />
                </div>
                <h2 className="manga-title text-2xl text-center mb-2 text-[#111]">Ready to create your trailer</h2>
                <p className="text-[#888] text-sm text-center mb-8">
                  Our AI will analyze your story and generate a cinematic trailer plan.
                </p>

                {isGenerating && (
                  <div className="mb-6 space-y-3">
                    <StepIndicator icon={<BookOpen size={16} />} label="Analyzing story structure" status={genStep === 'analyzing' ? 'active' : 'done'} />
                    <StepIndicator icon={<Clapperboard size={16} />} label="Planning trailer scenes" status={genStep === 'planning' ? 'active' : genStep === 'analyzing' ? 'pending' : 'done'} />
                  </div>
                )}

                {!isGenerating && genStep !== 'error' && (
                  <div className="mb-6">
                    <label className="text-xs text-[#888] uppercase tracking-wider flex items-center gap-1 mb-2">
                      <Palette size={12} /> Trailer Style
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {STYLES.map((style) => (
                        <button
                          key={style}
                          onClick={() => setSelectedStyle(style)}
                          className={`text-xs py-1.5 px-2 border-2 transition-colors capitalize ${
                            selectedStyle === style ? 'border-[#111] bg-[#111] text-white' : 'border-[#ccc] bg-white text-[#666] hover:border-[#888]'
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {genStep === 'error' && genError && (
                  <div className="mb-6 p-3 bg-red-500/10 border-2 border-red-500/30">
                    <p className="text-red-400 text-sm">{genError}</p>
                    {(!hasBook || /short|minimum|upload|story/i.test(genError)) && (
                      <Link href={`/project/${id}/upload`} className="text-[#111] text-sm underline mt-2 block">
                        Edit story content →
                      </Link>
                    )}
                  </div>
                )}

                <button
                  ref={generateBtnRef}
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating}
                  className="manga-btn w-full bg-[#111] text-white py-3 text-lg flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <><Loader2 size={18} className="animate-spin" />{genStep === 'analyzing' ? 'Analyzing...' : 'Planning scenes...'}</>
                  ) : genStep === 'error' ? 'Try Again'
                  : currentProject?.analysis?.key_scenes ? <><Clapperboard size={18} />Plan Trailer</>
                  : <><Sparkles size={18} />Generate Trailer</>}
                </button>

                {currentProject?.analysis?.key_scenes && genStep === 'idle' && (
                  <p className="text-xs text-[#555] text-center mt-3">Story already analyzed — will skip to planning</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* No story state */}
        {!loading && !error && clips.length === 0 && !hasBook && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/90 backdrop-blur-sm">
            <div className="manga-panel-accent p-8 max-w-md text-center">
              <BookOpen size={32} className="mx-auto mb-4 text-[#111]" />
              <h2 className="manga-title text-xl mb-2 text-[#111]">No Story Content</h2>
              <p className="text-[#888] text-sm mb-6">Upload your story text, images, or character details to get started.</p>
              <Link href={`/project/${id}/upload`} className="manga-btn bg-[#111] text-white px-6 py-3 inline-block">
                Go to Upload
              </Link>
            </div>
          </div>
        )}

        {/* Suggestions modal */}
        {suggestions !== null && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setSuggestions(null)}>
            <div className="manga-panel p-6 max-w-lg w-full mx-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="manga-title text-lg text-[#111] flex items-center gap-2"><Lightbulb size={18} /> AI Suggestions</h3>
                <button onClick={() => setSuggestions(null)} className="text-[#888] hover:text-[#111]">&times;</button>
              </div>
              {suggestions.length === 0 ? (
                <p className="text-[#888] text-sm">No suggestions available. Your timeline looks good!</p>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((s: any, i: number) => (
                    <div key={i} className="p-3 bg-[#f5f5f5] border-2 border-[#ccc]">
                      <p className="text-sm text-[#111] font-medium">{s.title || s.suggestion || `Suggestion ${i + 1}`}</p>
                      {s.description && <p className="text-xs text-[#666] mt-1">{s.description}</p>}
                      {s.reason && <p className="text-xs text-[#888] mt-1 italic">{s.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function StepIndicator({ icon, label, status }: { icon: React.ReactNode; label: string; status: 'pending' | 'active' | 'done' }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${status === 'active' ? 'step-indicator-active' : ''} ${
      status === 'active' ? 'bg-[#111]/10 border-2 border-[#111]/30'
      : status === 'done' ? 'bg-emerald-500/10 border-2 border-emerald-500/30'
      : 'bg-white border-2 border-[#ccc]'
    }`}>
      <div className={`shrink-0 ${status === 'active' ? 'text-[#111]' : status === 'done' ? 'text-emerald-400' : 'text-[#555]'}`}>
        {status === 'active' ? <Loader2 size={16} className="animate-spin" /> : icon}
      </div>
      <span className={`text-sm ${status === 'active' ? 'text-[#555]' : status === 'done' ? 'text-emerald-300' : 'text-[#555]'}`}>
        {label}{status === 'done' && <span className="ml-1.5 text-emerald-400">done</span>}
      </span>
    </div>
  );
}
