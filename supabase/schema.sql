-- FrameFlow Database Schema
-- Safe to re-run (uses IF NOT EXISTS and DROP POLICY IF EXISTS)

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  description TEXT DEFAULT '',
  book_file_url TEXT,
  book_text TEXT,
  cover_image_url TEXT,
  audio_file_url TEXT,
  audio_analysis JSONB,
  status TEXT DEFAULT 'uploading',
  analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Migration: add audio columns to existing tables
ALTER TABLE projects ADD COLUMN IF NOT EXISTS audio_file_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS audio_analysis JSONB;

-- Migration: add manga/content-type columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manga_panels JSONB DEFAULT '[]'::JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manga_file_url TEXT;

-- Migration: add preview_url to render_jobs
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- Migration: add published flag to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE;

-- Timelines table (one per project)
CREATE TABLE IF NOT EXISTS timelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  clips JSONB DEFAULT '[]'::JSONB,
  music_track JSONB,
  total_duration_ms INT DEFAULT 0,
  settings JSONB DEFAULT '{"resolution":"1080p","aspect_ratio":"16:9","fps":24}'::JSONB,
  effects JSONB DEFAULT '[]'::JSONB,
  beat_map JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing timelines table (idempotent)
ALTER TABLE timelines ADD COLUMN IF NOT EXISTS effects JSONB DEFAULT '[]'::JSONB;
ALTER TABLE timelines ADD COLUMN IF NOT EXISTS beat_map JSONB;

-- Render jobs table
CREATE TABLE IF NOT EXISTS render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'queued',
  progress INT DEFAULT 0,
  output_url TEXT,
  preview_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing render_jobs table (idempotent)
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- Chat history table
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_timelines_project ON timelines(project_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_project ON render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_project ON chat_history(project_id);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (safe to re-run)
DROP POLICY IF EXISTS "Allow all" ON projects;
DROP POLICY IF EXISTS "Allow all" ON timelines;
DROP POLICY IF EXISTS "Allow all" ON render_jobs;
DROP POLICY IF EXISTS "Allow all" ON chat_history;

-- Hackathon: allow all access
CREATE POLICY "Allow all" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all" ON timelines FOR ALL USING (true);
CREATE POLICY "Allow all" ON render_jobs FOR ALL USING (true);
CREATE POLICY "Allow all" ON chat_history FOR ALL USING (true);

-- RPC function: update a clip's status inside the timeline JSONB
-- Called by the API service when render service reports clip generation progress
CREATE OR REPLACE FUNCTION update_clip_status(
  p_clip_id TEXT,
  p_status TEXT,
  p_media_url TEXT DEFAULT '',
  p_error TEXT DEFAULT ''
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_timeline_id UUID;
  v_project_id UUID;
  v_clips JSONB;
  v_idx INT;
  v_clip JSONB;
BEGIN
  -- Find the timeline containing this clip
  SELECT t.id, t.project_id, t.clips
    INTO v_timeline_id, v_project_id, v_clips
    FROM timelines t
   WHERE t.clips @> ('[{"id":"' || p_clip_id || '"}]')::JSONB
   LIMIT 1;

  IF v_timeline_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'clip not found');
  END IF;

  -- Find the clip index and update it
  FOR v_idx IN 0..jsonb_array_length(v_clips) - 1 LOOP
    IF v_clips->v_idx->>'id' = p_clip_id THEN
      v_clip := v_clips->v_idx;
      v_clip := jsonb_set(v_clip, '{gen_status}', to_jsonb(p_status));
      IF p_media_url <> '' THEN
        v_clip := jsonb_set(v_clip, '{generated_media_url}', to_jsonb(p_media_url));
      END IF;
      IF p_error <> '' THEN
        v_clip := jsonb_set(v_clip, '{gen_error}', to_jsonb(p_error));
      END IF;
      v_clips := jsonb_set(v_clips, ('{' || v_idx || '}')::TEXT[], v_clip);
      EXIT;
    END IF;
  END LOOP;

  UPDATE timelines
     SET clips = v_clips, updated_at = now()
   WHERE id = v_timeline_id;

  RETURN json_build_object('ok', true, 'project_id', v_project_id);
END;
$$;
