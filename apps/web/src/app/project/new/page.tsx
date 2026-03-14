'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, FileText } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const project: any = await api.createProject({ title: title.trim(), description: description.trim() || undefined });
      if (file) {
        const uploadResult: any = await api.uploadBook(project.id, file);
        // Store book_text in sessionStorage so editor page can access it
        if (uploadResult.book_text || uploadResult.text_preview) {
          sessionStorage.setItem(`book_text_${project.id}`, uploadResult.book_text || uploadResult.text_preview);
        }
      }
      router.push(`/project/${project.id}`);
    } catch (err) {
      console.error(err);
      alert('Failed to create project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200 flex items-center gap-2 mb-8 text-sm">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        <h1 className="text-3xl font-bold mb-8">Create New Project</h1>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Project Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Book Trailer"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your story..."
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Upload Story</label>
            <div
              className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center hover:border-violet-500 transition-colors cursor-pointer"
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".txt,.pdf,.epub,.md"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText size={20} className="text-violet-400" />
                  <span className="text-zinc-200">{file.name}</span>
                </div>
              ) : (
                <>
                  <Upload size={32} className="mx-auto mb-3 text-zinc-600" />
                  <p className="text-zinc-400">Drop your book file here or click to browse</p>
                  <p className="text-xs text-zinc-600 mt-1">Supports .txt, .pdf, .epub, .md</p>
                </>
              )}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={!title.trim() || loading}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </main>
  );
}
