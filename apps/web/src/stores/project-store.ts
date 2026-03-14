import { create } from 'zustand';

export interface Project {
  id: string;
  title: string;
  author: string;
  description: string;
  book_file_url?: string;
  book_text?: string;
  cover_image_url?: string;
  status: 'uploading' | 'uploaded' | 'analyzing' | 'planning' | 'editing' | 'rendering' | 'done';
  analysis?: any;
  created_at: string;
  updated_at: string;
}

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  setLoading: (loading: boolean) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  loading: false,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setLoading: (loading) => set({ loading }),
  updateProject: (id, updates) => set((state) => ({
    projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    currentProject: state.currentProject?.id === id
      ? { ...state.currentProject, ...updates }
      : state.currentProject,
  })),
}));
