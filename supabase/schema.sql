-- FrameFlow Database Schema
-- Run this in your Supabase SQL editor

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  description TEXT DEFAULT '',
  book_file_url TEXT,
  cover_image_url TEXT,
  status TEXT DEFAULT 'uploading',
  analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Timelines table (one per project)
CREATE TABLE IF NOT EXISTS timelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  clips JSONB DEFAULT '[]'::JSONB,
  music_track JSONB,
  total_duration_ms INT DEFAULT 0,
  settings JSONB DEFAULT '{"resolution":"1080p","aspect_ratio":"16:9","fps":24}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Render jobs table
CREATE TABLE IF NOT EXISTS render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'queued',
  progress INT DEFAULT 0,
  output_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

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

-- Enable RLS (Row Level Security) - configure policies as needed
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- For hackathon: allow all access (tighten for production)
CREATE POLICY "Allow all" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all" ON timelines FOR ALL USING (true);
CREATE POLICY "Allow all" ON render_jobs FOR ALL USING (true);
CREATE POLICY "Allow all" ON chat_history FOR ALL USING (true);
