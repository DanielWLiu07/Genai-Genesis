export interface RenderJob {
  id: string;
  project_id: string;
  status: 'queued' | 'generating_media' | 'composing' | 'done' | 'error';
  progress: number;
  output_url?: string;
  error?: string;
  created_at: string;
}
