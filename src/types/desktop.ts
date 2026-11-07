import type { Project, ProjectSettings } from './project';

export type OpenProject = { file: string; project: Project };
export type RecentProject = {
  file: string; name: string; editedAt: string; duration: number;
  width: number; height: number; background: string;
};
export type Preferences = { folder: string; theme: 'dark' | 'light'; autosave: number };
export type HomeState = { recent: RecentProject[]; preferences: Preferences };
export type NewProject = { name: string; folder: string; settings: ProjectSettings };

export const channels = {
  home: 'settings:read', preferences: 'settings:save', folder: 'dialog:folder',
  create: 'projects:create', open: 'projects:open', save: 'projects:save',
  rename: 'projects:rename', duplicate: 'projects:duplicate', remove: 'projects:remove',
  reveal: 'projects:reveal',
} as const;

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
}

declare global {
  interface Window { desktop: DesktopApi }
}
