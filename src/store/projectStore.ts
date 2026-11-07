import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import type { MediaProgress, OpenProject } from '../types/desktop';
import type { Project } from '../types/project';

const historyLimit = 100;
interface ProjectState {
  current?: OpenProject;
  past: Project[];
  future: Project[];
  proxies: Record<string, MediaProgress>;
  setCurrent(current?: OpenProject): void;
  acceptSaved(current: OpenProject): void;
  edit(recipe: (project: Draft<Project>) => void): void;
  undo(): void;
  redo(): void;
  mediaProgress(update: MediaProgress): void;
}

export const useProject = create<ProjectState>((set) => ({
  past: [], future: [], proxies: {},
  setCurrent: (current) => set({ current, past: [], future: [], proxies: {} }),
  acceptSaved: (current) => set({ current }),
  edit: (recipe) => set(({ current, past }) => {
    if (!current) return {};
    const project = produce(current.project, recipe);
    if (project === current.project) return {};
    return { current: { ...current, project }, past: [...past, current.project].slice(-historyLimit), future: [] };
  }),
  undo: () => set(({ current, past, future }) => {
    const project = past.at(-1);
    if (!current || !project) return {};
    return { current: { ...current, project }, past: past.slice(0, -1), future: [current.project, ...future] };
  }),
  redo: () => set(({ current, past, future }) => {
    const [project, ...remaining] = future;
    if (!current || !project) return {};
    return { current: { ...current, project }, past: [...past, current.project], future: remaining };
  }),
  mediaProgress: (update) => set(({ current, past, future, proxies }) => {
    if (!current || current.project.id !== update.projectId) return {};
    const apply = (project: Project) => produce(project, (draft) => {
      const asset = draft.assets.find((item) => item.id === update.assetId);
      if (asset && update.proxyPath) asset.proxyPath = update.proxyPath;
    });
    return {
      current: { ...current, project: apply(current.project) },
      past: update.proxyPath ? past.map(apply) : past,
      future: update.proxyPath ? future.map(apply) : future,
      proxies: { ...proxies, [update.assetId]: update },
    };
  }),
}));
