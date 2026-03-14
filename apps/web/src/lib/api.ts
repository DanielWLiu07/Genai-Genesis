const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
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

  // Timeline
  getTimeline: (projectId: string) => fetchAPI(`/projects/${projectId}/timeline`),
  updateTimeline: (projectId: string, timeline: any) =>
    fetchAPI(`/projects/${projectId}/timeline`, { method: 'PUT', body: JSON.stringify(timeline) }),

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
  planTrailer: (projectId: string, opts?: { analysis?: any; style?: string; pacing?: string }) =>
    fetchAPI(`/projects/${projectId}/plan-trailer`, { method: 'POST', body: JSON.stringify(opts || {}) }),
  getSuggestions: (projectId: string, timeline: any, analysis?: any) =>
    fetchAPI(`/projects/${projectId}/suggest`, {
      method: 'POST',
      body: JSON.stringify({ timeline, analysis }),
    }),

  // Presets
  getPresets: () => fetchAPI('/presets'),
  getPreset: (style: string) => fetchAPI(`/presets/${style}`),

  // Chat
  chat: async (projectId: string, message: string, timeline: any, history: any[]) => {
    const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/chat`, {
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
      characters?: { name: string; description?: string; appearance?: string; image_url?: string }[];
      mood?: string;
      genre?: string;
      shot_type?: string;
      is_continuous?: boolean;
      style_seed?: string;
    }
  ) =>
    fetchAPI(`/projects/${projectId}/generate-clip`, {
      method: 'POST',
      body: JSON.stringify({ clip_id: clipId, prompt, type, ...opts }),
    }),
  renderTrailer: (projectId: string) =>
    fetchAPI(`/projects/${projectId}/render`, { method: 'POST' }),
  renderWithEffects: (projectId: string, effects: any[], beatMap: any) =>
    fetchAPI(`/projects/${projectId}/render`, {
      method: 'POST',
      body: JSON.stringify({ effects, beat_map: beatMap }),
    }),
  getRenderStatus: (projectId: string, jobId: string) =>
    fetchAPI(`/projects/${projectId}/render/${jobId}`),
};
