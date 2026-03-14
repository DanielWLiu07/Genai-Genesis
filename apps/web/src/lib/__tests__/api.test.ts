import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../api';

const API_URL = 'http://localhost:8000';

function mockFetchSuccess(data: any = {}, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status,
    json: () => Promise.resolve(data),
  });
}

function mockFetchFailure(status = 500) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ detail: 'error' }),
  });
}

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createProject sends POST with correct URL and body', async () => {
    const fetchMock = mockFetchSuccess({ id: 'new-proj' });
    vi.stubGlobal('fetch', fetchMock);

    const data = { title: 'My Book', description: 'A novel', author: 'Jane' };
    await api.createProject(data);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual(data);
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('getProjects sends GET to correct URL', async () => {
    const fetchMock = mockFetchSuccess([{ id: 'p1' }, { id: 'p2' }]);
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.getProjects();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects`);
    expect(result).toEqual([{ id: 'p1' }, { id: 'p2' }]);
  });

  it('getProject includes ID in URL', async () => {
    const fetchMock = mockFetchSuccess({ id: 'proj-42' });
    vi.stubGlobal('fetch', fetchMock);

    await api.getProject('proj-42');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects/proj-42`);
  });

  it('getTimeline sends correct URL', async () => {
    const fetchMock = mockFetchSuccess({ clips: [] });
    vi.stubGlobal('fetch', fetchMock);

    await api.getTimeline('proj-7');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects/proj-7/timeline`);
  });

  it('updateTimeline sends PUT with body', async () => {
    const fetchMock = mockFetchSuccess({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const timeline = { clips: [{ id: 'c1' }], settings: { fps: 30 } };
    await api.updateTimeline('proj-5', timeline);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects/proj-5/timeline`);
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual(timeline);
  });

  it('uploadBook sends FormData', async () => {
    const fetchMock = mockFetchSuccess({ book_text: 'contents...' });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['book content'], 'book.txt', { type: 'text/plain' });
    await api.uploadBook('proj-3', file);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects/proj-3/upload`);
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file')).toBeInstanceOf(File);
    // Should NOT have Content-Type header (browser sets multipart boundary)
    expect(options.headers).toBeUndefined();
  });

  it('analyzeStory sends book_text in body', async () => {
    const fetchMock = mockFetchSuccess({ themes: ['hope'] });
    vi.stubGlobal('fetch', fetchMock);

    await api.analyzeStory('proj-1', 'Once upon a time...');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects/proj-1/analyze`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ book_text: 'Once upon a time...' });
  });

  it('planTrailer sends options in body', async () => {
    const fetchMock = mockFetchSuccess({ clips: [] });
    vi.stubGlobal('fetch', fetchMock);

    const opts = { analysis: { themes: ['adventure'] }, style: 'cinematic' };
    await api.planTrailer('proj-1', opts);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects/proj-1/plan-trailer`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual(opts);
  });

  it('chat sends correct body and returns parsed JSON', async () => {
    const chatResponse = { role: 'assistant', content: 'Hello!', tool_calls: [] };
    const fetchMock = mockFetchSuccess(chatResponse);
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.chat('proj-1', 'hello', { clips: [] }, []);

    expect(result).toEqual(chatResponse);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects/proj-1/chat`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      message: 'hello',
      timeline: { clips: [] },
      history: [],
    });
  });

  it('generateClip sends correct body', async () => {
    const fetchMock = mockFetchSuccess({ status: 'queued' });
    vi.stubGlobal('fetch', fetchMock);

    await api.generateClip('proj-1', 'clip-99', 'A sunset over mountains');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/projects/proj-1/generate-clip`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ clip_id: 'clip-99', prompt: 'A sunset over mountains', type: 'image' });
  });

  it('throws on non-ok response for fetchAPI-based methods', async () => {
    const fetchMock = mockFetchFailure(404);
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getProject('nonexistent')).rejects.toThrow('API error: 404');
  });

  it('throws on non-ok response for uploadBook', async () => {
    const fetchMock = mockFetchFailure(413);
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'big.pdf');
    await expect(api.uploadBook('proj-1', file)).rejects.toThrow('Upload error: 413');
  });
});
