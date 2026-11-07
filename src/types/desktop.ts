import type { Asset, Project, ProjectSettings } from './project';

export type OpenProject = { file: string; project: Project };
export type RecentProject = {
  file: string; name: string; editedAt: string; duration: number;
  width: number; height: number; background: string;
};
export type Preferences = { folder: string; theme: 'dark' | 'light'; autosave: number };
export type HomeState = { recent: RecentProject[]; preferences: Preferences };
export type NewProject = { name: string; folder: string; settings: ProjectSettings };
export type MediaProgress = {
  projectId: string; assetId: string; percent: number; proxyPath?: string; failed?: boolean;
};
export type ImportResult = { assets: Asset[]; failures: string[]; proxies: string[] };

export const channels = {
  home: 'settings:read', preferences: 'settings:save', folder: 'dialog:folder',
  create: 'projects:create', open: 'projects:open', save: 'projects:save',
  rename: 'projects:rename', duplicate: 'projects:duplicate', remove: 'projects:remove',
  reveal: 'projects:reveal',
  importMedia: 'media:import',
} as const;
export const mediaProgressChannel = 'media:progress';

export interface DesktopApi {
  home(): Promise<HomeState>;
  preferences(value: Preferences): Promise<HomeState>;
  folder(current: string): Promise<string | undefined>;
  create(value: NewProject): Promise<OpenProject>;
  open(file?: string): Promise<OpenProject | undefined>;
  save(project: Project): Promise<OpenProject>;
  rename(file: string, name: string): Promise<HomeState>;
  duplicate(file: string, name: string): Promise<HomeState>;
  remove(file: string): Promise<HomeState>;
  reveal(file: string): Promise<void>;
  importMedia(projectId: string, files?: string[]): Promise<ImportResult>;
  filePath(file: File): string;
  onMediaProgress(listener: (progress: MediaProgress) => void): () => void;
}

declare global {
  interface Window { desktop: DesktopApi }
}
