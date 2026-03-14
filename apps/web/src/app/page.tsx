'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus, Film, BookOpen, Sparkles, Clock, Loader2 } from 'lucide-react';
import { useProjectStore, type Project } from '@/stores/project-store';
import { api } from '@/lib/api';

const STATUS_COLORS: Record<Project['status'], string> = {
  uploading: 'text-yellow-400 bg-yellow-400/10',
  uploaded: 'text-yellow-400 bg-yellow-400/10',
  analyzing: 'text-blue-400 bg-blue-400/10',
  planning: 'text-purple-400 bg-purple-400/10',
  editing: 'text-green-400 bg-green-400/10',
  rendering: 'text-orange-400 bg-orange-400/10',
  done: 'text-zinc-400 bg-zinc-400/10',
};

export default function Dashboard() {
  const { projects, loading, setProjects, setLoading } = useProjectStore();

  useEffect(() => {
    setLoading(true);
    api.getProjects()
      .then((data: any) => setProjects(Array.isArray(data) ? data : data.projects || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [setProjects, setLoading]);

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
        {loading ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
            <Loader2 size={32} className="mx-auto mb-3 text-zinc-600 animate-spin" />
            <p>Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
            <Film size={48} className="mx-auto mb-3 text-zinc-700" />
            <p>No projects yet. Create your first book trailer!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-violet-700 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <Film size={20} className="text-violet-400 mt-0.5" />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[project.status] || 'text-zinc-400 bg-zinc-400/10'}`}>
                    {project.status}
                  </span>
                </div>
                <h3 className="font-semibold text-zinc-200 group-hover:text-violet-300 transition-colors mb-1">
                  {project.title}
                </h3>
                {project.description && (
                  <p className="text-sm text-zinc-500 line-clamp-2 mb-3">{project.description}</p>
                )}
                <div className="flex items-center gap-1 text-xs text-zinc-600">
                  <Clock size={12} />
                  {new Date(project.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
