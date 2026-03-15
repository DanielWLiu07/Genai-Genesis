-- Migration: add effects + beat_map to timelines, preview_url to render_jobs
-- Run this in the Supabase SQL editor for your project.

ALTER TABLE timelines ADD COLUMN IF NOT EXISTS effects JSONB DEFAULT '[]'::JSONB;
ALTER TABLE timelines ADD COLUMN IF NOT EXISTS beat_map JSONB;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS preview_url TEXT;
