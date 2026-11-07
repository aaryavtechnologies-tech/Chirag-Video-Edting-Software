import { create } from 'zustand';
import type { OpenProject } from '../types/desktop';

interface ProjectState {
  current?: OpenProject;
  setCurrent(current?: OpenProject): void;
}

export const useProject = create<ProjectState>((set) => ({
  setCurrent: (current) => set({ current }),
}));
