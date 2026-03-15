const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    let message = `API error: ${res.status}`;
    try {
      const body = await res.json();
      message = body.detail || body.error || body.message || message;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

// Projects use Next.js API routes (relative URLs) so they work on Vercel without the FastAPI backend
async function fetchProjects<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/projects${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  // Projects — served via Next.js API routes -> Supabase directly
  createProject: (data: { title: string; description?: string; author?: string }) =>
    fetchProjects('', { method: 'POST', body: JSON.stringify(data) }),
  getProjects: () => fetchProjects<any[]>(''),
  getProject: (id: string) => fetchProjects(`/${id}`),
  updateProject: (id: string, data: Record<string, any>) =>
    fetchProjects(`/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    fetchProjects(`/${id}`, { method: 'DELETE' }),

  // Timeline — served via Next.js API routes -> Supabase directly
  getTimeline: (projectId: string) => fetchProjects(`/${projectId}/timeline`),
  updateTimeline: (projectId: string, timeline: any) =>
    fetchProjects(`/${projectId}/timeline`, { method: 'PUT', body: JSON.stringify(timeline) }),

  // Upload
  uploadBook: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload error: ${res.status}`);
    return res.json();
  },

  uploadManga: async (projectId: string, files: File[]) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/upload-manga`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      let message = `Manga upload error: ${res.status}`;
      try {
        const body = await res.json();
        message = body.detail || body.error || message;
      } catch {}
      throw new Error(message);
    }
    return res.json();
  },

  uploadAudio: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/upload-audio`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`Audio upload error: ${res.status}`);
    return res.json();
  },

  // AI
  analyzeStory: (projectId: string, bookText: string, opts?: { characters?: any[]; uploaded_images?: string[] }) =>
    fetchAPI(`/projects/${projectId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ book_text: bookText, ...opts }),
    }),
  planTrailer: (projectId: string, opts?: { analysis?: any; style?: string; pacing?: string; music_track?: any }) =>
    fetchAPI(`/projects/${projectId}/plan-trailer`, { method: 'POST', body: JSON.stringify(opts || {}) }),
  getSuggestions: (projectId: string, timeline: any, analysis?: any) =>
    fetchAPI(`/projects/${projectId}/suggest`, {
      method: 'POST',
      body: JSON.stringify({ timeline, analysis }),
    }),

  // Presets
  getPresets: () => fetchAPI('/presets'),
  getPreset: (style: string) => fetchAPI(`/presets/${style}`),

  // Image generation — served via Next.js API route -> Gemini directly (works on Vercel)
  generateImage: async (prompt: string, aspectRatio = '16:9') => {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, aspect_ratio: aspectRatio }),
    });
    if (!res.ok) throw new Error(`Image generation error: ${res.status}`);
    return res.json();
  },

  // Chat — served via Next.js API route -> Gemini directly
  chat: async (projectId: string, message: string, timeline: any, history: any[]) => {
    const res = await fetch(`/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, timeline, history }),
    });
    if (!res.ok) throw new Error(`Chat error: ${res.status}`);
    return res.json();
  },

  // Render
  generateClip: (
    projectId: string,
    clipId: string,
    prompt: string,
    type: string = 'image',
    opts?: {
      clip_order?: number;
      clip_total?: number;
      scene_image_url?: string;
      characters?: { name: string; description?: string; appearance?: string; image_url?: string; visual_description?: string }[];
      mood?: string;
      genre?: string;
      shot_type?: string;
      is_continuous?: boolean;
      style_seed?: string;
      text?: string;
      themes?: string[];
      prev_scene_prompt?: string;
      next_scene_prompt?: string;
      feedback?: string;
      start_frame_url?: string;
      reference_image_url?: string;
      music_timestamp_ms?: number;
      music_energy?: number;
      signal?: AbortSignal;
    }
  ) => {
    const { signal, ...rest } = opts || {};
    return fetchAPI(`/projects/${projectId}/generate-clip`, {
      method: 'POST',
      body: JSON.stringify({ clip_id: clipId, prompt, type, ...rest }),
      signal,
    });
  },
  renderTrailer: (projectId: string, timeline?: any) =>
    fetchAPI(`/projects/${projectId}/render`, { method: 'POST', body: JSON.stringify({ timeline: timeline ?? null }) }),
  renderWithEffects: (projectId: string, effects: any[], beatMap: any) =>
    fetchAPI(`/projects/${projectId}/render`, {
      method: 'POST',
      body: JSON.stringify({ effects, beat_map: beatMap }),
    }),
  getRenderStatus: (projectId: string, jobId: string) =>
    fetchAPI(`/projects/${projectId}/render/${jobId}`),
  getRenderJobs: (projectId: string) =>
    fetchAPI(`/projects/${projectId}/render-jobs`),
};
