'use client';

import Link from 'next/link';
import { Plus, Film, BookOpen, Sparkles } from 'lucide-react';

export default function Dashboard() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <div className="border-b border-zinc-800 bg-gradient-to-b from-violet-950/20 to-zinc-950">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="flex items-center gap-3 mb-4">
            <Film className="text-violet-400" size={32} />
            <h1 className="text-4xl font-bold">FrameFlow</h1>
          </div>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Transform written stories into cinematic book trailers using AI narrative analysis
            and interactive visual editing.
          </p>
          <div className="flex gap-3 mt-8">
            <Link
              href="/project/new"
              className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              New Project
            </Link>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <BookOpen className="text-violet-400 mb-3" size={24} />
            <h3 className="font-semibold mb-2">Upload Your Story</h3>
            <p className="text-sm text-zinc-400">
              Drop in your book text, chapters, or manga panels. FrameFlow analyzes narrative structure automatically.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <Sparkles className="text-violet-400 mb-3" size={24} />
            <h3 className="font-semibold mb-2">AI Trailer Planning</h3>
            <p className="text-sm text-zinc-400">
              AI extracts key scenes, builds emotional arcs, and generates a cinematic trailer timeline.
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <Film className="text-violet-400 mb-3" size={24} />
            <h3 className="font-semibold mb-2">Visual Editor + Copilot</h3>
            <p className="text-sm text-zinc-400">
              Edit your trailer with a visual flowchart editor or chat with the AI copilot to refine it.
            </p>
          </div>
        </div>

        {/* Projects List */}
        <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
          <Film size={48} className="mx-auto mb-3 text-zinc-700" />
          <p>No projects yet. Create your first book trailer!</p>
        </div>
      </div>
    </main>
  );
}
