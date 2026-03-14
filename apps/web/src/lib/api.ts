const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  // Projects
  createProject: (data: { title: string; description?: string }) =>
    fetchAPI('/projects', { method: 'POST', body: JSON.stringify(data) }),
  getProjects: () => fetchAPI('/projects'),
  getProject: (id: string) => fetchAPI(`/projects/${id}`),

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

  // AI
  analyzeStory: (projectId: string) =>
    fetchAPI(`/projects/${projectId}/analyze`, { method: 'POST' }),
  planTrailer: (projectId: string) =>
    fetchAPI(`/projects/${projectId}/plan-trailer`, { method: 'POST' }),

  // Chat (SSE streaming)
  chat: (projectId: string, message: string, timeline: any, history: any[]) =>
    fetch(`${API_URL}/api/v1/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, timeline, history }),
    }),

  // Render
  generateClip: (projectId: string, clipId: string, prompt: string) =>
    fetchAPI(`/projects/${projectId}/generate-clip`, {
      method: 'POST',
      body: JSON.stringify({ clip_id: clipId, prompt }),
    }),
  renderTrailer: (projectId: string) =>
    fetchAPI(`/projects/${projectId}/render`, { method: 'POST' }),
};
