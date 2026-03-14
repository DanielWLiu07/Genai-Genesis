import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTimelineStore } from '../timeline-store';

// Mock crypto.randomUUID for deterministic IDs
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

describe('useTimelineStore', () => {
  beforeEach(() => {
    uuidCounter = 0;
    useTimelineStore.setState({
      projectId: null,
      clips: [],
      musicTrack: null,
      settings: { resolution: '1080p', aspect_ratio: '16:9', fps: 24 },
    });
  });

  it('has correct initial state', () => {
    const state = useTimelineStore.getState();
    expect(state.projectId).toBeNull();
    expect(state.clips).toEqual([]);
    expect(state.musicTrack).toBeNull();
    expect(state.settings).toEqual({ resolution: '1080p', aspect_ratio: '16:9', fps: 24 });
  });

  it('setProjectId sets project ID', () => {
    useTimelineStore.getState().setProjectId('proj-123');
    expect(useTimelineStore.getState().projectId).toBe('proj-123');
  });

  it('addClip adds a clip with auto-generated ID, order, and position', () => {
    useTimelineStore.getState().addClip({
      type: 'image',
      duration_ms: 3000,
      prompt: 'A dark forest at dawn',
      gen_status: 'pending',
    });

    const clips = useTimelineStore.getState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].id).toBe('test-uuid-1');
    expect(clips[0].order).toBe(0);
    expect(clips[0].position).toEqual({ x: 0, y: 100 });
    expect(clips[0].type).toBe('image');
    expect(clips[0].duration_ms).toBe(3000);
    expect(clips[0].prompt).toBe('A dark forest at dawn');
    expect(clips[0].gen_status).toBe('pending');
  });

  it('addClip with multiple clips increments order correctly', () => {
    const { addClip } = useTimelineStore.getState();
    addClip({ type: 'image', duration_ms: 2000, prompt: 'Scene 1', gen_status: 'pending' });
    addClip({ type: 'video', duration_ms: 4000, prompt: 'Scene 2', gen_status: 'pending' });
    addClip({ type: 'text_overlay', duration_ms: 1500, prompt: 'Scene 3', gen_status: 'pending' });

    const clips = useTimelineStore.getState().clips;
    expect(clips).toHaveLength(3);
    expect(clips[0].order).toBe(0);
    expect(clips[0].position).toEqual({ x: 0, y: 100 });
    expect(clips[1].order).toBe(1);
    expect(clips[1].position).toEqual({ x: 280, y: 100 });
    expect(clips[2].order).toBe(2);
    expect(clips[2].position).toEqual({ x: 560, y: 100 });
  });

  it('removeClip removes by ID and reindexes remaining clips', () => {
    const { addClip } = useTimelineStore.getState();
    addClip({ type: 'image', duration_ms: 2000, prompt: 'Scene 1', gen_status: 'pending' });
    addClip({ type: 'video', duration_ms: 3000, prompt: 'Scene 2', gen_status: 'pending' });
    addClip({ type: 'image', duration_ms: 2500, prompt: 'Scene 3', gen_status: 'pending' });

    // Remove the middle clip (test-uuid-2)
    useTimelineStore.getState().removeClip('test-uuid-2');

    const clips = useTimelineStore.getState().clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].id).toBe('test-uuid-1');
    expect(clips[0].order).toBe(0);
    expect(clips[0].position).toEqual({ x: 0, y: 100 });
    expect(clips[1].id).toBe('test-uuid-3');
    expect(clips[1].order).toBe(1);
    expect(clips[1].position).toEqual({ x: 280, y: 100 });
  });

  it('updateClip updates specific fields on a clip', () => {
    useTimelineStore.getState().addClip({
      type: 'image',
      duration_ms: 2000,
      prompt: 'Original prompt',
      gen_status: 'pending',
    });

    useTimelineStore.getState().updateClip('test-uuid-1', {
      prompt: 'Updated prompt',
      gen_status: 'done',
      generated_media_url: 'https://example.com/media.mp4',
    });

    const clip = useTimelineStore.getState().clips[0];
    expect(clip.prompt).toBe('Updated prompt');
    expect(clip.gen_status).toBe('done');
    expect(clip.generated_media_url).toBe('https://example.com/media.mp4');
    // Unchanged fields remain
    expect(clip.type).toBe('image');
    expect(clip.duration_ms).toBe(2000);
  });

  it('reorderClips reorders clips by ID array and updates positions', () => {
    const { addClip } = useTimelineStore.getState();
    addClip({ type: 'image', duration_ms: 2000, prompt: 'A', gen_status: 'pending' });
    addClip({ type: 'video', duration_ms: 3000, prompt: 'B', gen_status: 'pending' });
    addClip({ type: 'image', duration_ms: 2500, prompt: 'C', gen_status: 'pending' });

    // Reverse the order
    useTimelineStore.getState().reorderClips(['test-uuid-3', 'test-uuid-1', 'test-uuid-2']);

    const clips = useTimelineStore.getState().clips;
    expect(clips).toHaveLength(3);
    expect(clips[0].id).toBe('test-uuid-3');
    expect(clips[0].order).toBe(0);
    expect(clips[0].position).toEqual({ x: 0, y: 100 });
    expect(clips[1].id).toBe('test-uuid-1');
    expect(clips[1].order).toBe(1);
    expect(clips[1].position).toEqual({ x: 280, y: 100 });
    expect(clips[2].id).toBe('test-uuid-2');
    expect(clips[2].order).toBe(2);
    expect(clips[2].position).toEqual({ x: 560, y: 100 });
  });

  it('setMusicTrack sets the music track', () => {
    const track = { url: 'https://example.com/music.mp3', name: 'Dramatic Score', duration_ms: 60000, volume: 0.8 };
    useTimelineStore.getState().setMusicTrack(track);

    expect(useTimelineStore.getState().musicTrack).toEqual(track);
  });

  it('setMusicTrack can set to null', () => {
    useTimelineStore.getState().setMusicTrack({ url: 'x', name: 'y', duration_ms: 1000, volume: 1 });
    useTimelineStore.getState().setMusicTrack(null);

    expect(useTimelineStore.getState().musicTrack).toBeNull();
  });

  it('updateSettings merges settings', () => {
    useTimelineStore.getState().updateSettings({ fps: 30 });

    const settings = useTimelineStore.getState().settings;
    expect(settings.fps).toBe(30);
    expect(settings.resolution).toBe('1080p');
    expect(settings.aspect_ratio).toBe('16:9');
  });

  it('updateSettings can update multiple fields', () => {
    useTimelineStore.getState().updateSettings({ resolution: '4k', aspect_ratio: '9:16' });

    const settings = useTimelineStore.getState().settings;
    expect(settings.resolution).toBe('4k');
    expect(settings.aspect_ratio).toBe('9:16');
    expect(settings.fps).toBe(24);
  });

  it('loadTimeline loads clips, music, and settings from a timeline object', () => {
    const timeline = {
      clips: [
        { id: 'c1', order: 0, type: 'image', duration_ms: 3000, prompt: 'Forest', gen_status: 'done', position: { x: 0, y: 100 } },
      ],
      music_track: { url: 'https://example.com/bg.mp3', name: 'BG Music', duration_ms: 45000, volume: 0.5 },
      settings: { resolution: '4k', aspect_ratio: '1:1', fps: 30 },
    };

    useTimelineStore.getState().loadTimeline(timeline);

    const state = useTimelineStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.clips[0].id).toBe('c1');
    expect(state.clips[0].prompt).toBe('Forest');
    expect(state.musicTrack).toEqual(timeline.music_track);
    expect(state.settings).toEqual({ resolution: '4k', aspect_ratio: '1:1', fps: 30 });
  });

  it('loadTimeline defaults missing fields', () => {
    useTimelineStore.getState().loadTimeline({});

    const state = useTimelineStore.getState();
    expect(state.clips).toEqual([]);
    expect(state.musicTrack).toBeNull();
    expect(state.settings).toEqual({ resolution: '1080p', aspect_ratio: '16:9', fps: 24 });
  });

  it('setClips replaces all clips', () => {
    useTimelineStore.getState().addClip({ type: 'image', duration_ms: 1000, prompt: 'old', gen_status: 'pending' });

    const newClips = [
      { id: 'new-1', order: 0, type: 'video' as const, duration_ms: 5000, prompt: 'new clip', gen_status: 'done' as const, position: { x: 0, y: 100 } },
    ];
    useTimelineStore.getState().setClips(newClips);

    const clips = useTimelineStore.getState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].id).toBe('new-1');
    expect(clips[0].prompt).toBe('new clip');
  });
});
