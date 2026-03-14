import { create } from 'zustand';

export interface CharacterEntry {
  id: string;
  name: string;
  description: string;
  reference_image_url?: string;
}

export interface UploadedImage {
  id: string;
  url: string;
  file_name: string;
  description?: string;
}

export interface Project {
  id: string;
  title: string;
  author: string;
  description: string;
  book_file_url?: string;
  book_text?: string;
  story_text?: string;
  cover_image_url?: string;
  status: 'uploading' | 'uploaded' | 'analyzing' | 'planning' | 'editing' | 'rendering' | 'done';
  analysis?: any;
  characters: CharacterEntry[];
  uploaded_images: UploadedImage[];
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
  addCharacter: (char: Omit<CharacterEntry, 'id'>) => void;
  removeCharacter: (id: string) => void;
  updateCharacter: (id: string, updates: Partial<CharacterEntry>) => void;
  addUploadedImage: (image: Omit<UploadedImage, 'id'>) => void;
  removeUploadedImage: (id: string) => void;
  setStoryText: (text: string) => void;
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
  addCharacter: (char) => set((state) => {
    if (!state.currentProject) return state;
    const entry: CharacterEntry = { ...char, id: crypto.randomUUID() };
    const characters = [...state.currentProject.characters, entry];
    return { currentProject: { ...state.currentProject, characters } };
  }),
  removeCharacter: (id) => set((state) => {
    if (!state.currentProject) return state;
    const characters = state.currentProject.characters.filter((c) => c.id !== id);
    return { currentProject: { ...state.currentProject, characters } };
  }),
  updateCharacter: (id, updates) => set((state) => {
    if (!state.currentProject) return state;
    const characters = state.currentProject.characters.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    );
    return { currentProject: { ...state.currentProject, characters } };
  }),
  addUploadedImage: (image) => set((state) => {
    if (!state.currentProject) return state;
    const entry: UploadedImage = { ...image, id: crypto.randomUUID() };
    const uploaded_images = [...state.currentProject.uploaded_images, entry];
    return { currentProject: { ...state.currentProject, uploaded_images } };
  }),
  removeUploadedImage: (id) => set((state) => {
    if (!state.currentProject) return state;
    const uploaded_images = state.currentProject.uploaded_images.filter((i) => i.id !== id);
    return { currentProject: { ...state.currentProject, uploaded_images } };
  }),
  setStoryText: (text) => set((state) => {
    if (!state.currentProject) return state;
    return { currentProject: { ...state.currentProject, story_text: text } };
  }),
}));
