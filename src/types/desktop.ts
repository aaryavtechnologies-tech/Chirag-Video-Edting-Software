import type { Asset, Project, ProjectSettings } from './project';
import type { ExportProgress, ExportResult, ExportSettings, TextFrameBatch, TextPng } from './export';

export type OpenProject = { file: string; project: Project };
export type RecentProject = {
  file: string; name: string; editedAt: string; duration: number;
  width: number; height: number; background: string;
  thumbnail?: string;
  fps?: ProjectSettings['fps'];
};
export type Preferences = { folder: string; theme: 'dark' | 'light'; autosave: number; layout?: import('../layouts/settings').LayoutPreferences };
export type HomeState = { recent: RecentProject[]; preferences: Preferences; recovery?: RecentProject };
export type NewProject = { name: string; folder: string; settings: ProjectSettings };
export type MediaProgress = {
  projectId: string; assetId: string; percent: number; proxyPath?: string; failed?: boolean;
};
export type ImportResult = { assets: Asset[]; failures: string[]; proxies: string[] };
export type WindowAction = 'minimize' | 'maximize' | 'fullscreen' | 'close';

export const channels = {
  home: 'settings:read', preferences: 'settings:save', folder: 'dialog:folder',
  create: 'projects:create', open: 'projects:open', save: 'projects:save',
  rename: 'projects:rename', duplicate: 'projects:duplicate', remove: 'projects:remove',
  reveal: 'projects:reveal',
  importMedia: 'media:import',
  chooseExport: 'export:choose', startExport: 'export:start', cancelExport: 'export:cancel', openLog: 'log:open',
  stageTextFrames: 'export:text-frames',
  stage: 'projects:stage', saveAs: 'projects:save-as', discardRecovery: 'projects:discard-recovery',
  missing: 'media:missing', relink: 'media:relink',
  windowControl: 'window:control',
} as const;
export const mediaProgressChannel = 'media:progress';
export const exportProgressChannel = 'export:progress';
export const windowMaximizedChannel = 'window:maximized';

export interface DesktopApi {
  home(): Promise<HomeState>;
  preferences(value: Preferences): Promise<HomeState>;
  folder(current: string): Promise<string | undefined>;
  create(value: NewProject): Promise<OpenProject>;
  open(file?: string, recover?: boolean): Promise<OpenProject | undefined>;
  save(project: Project, thumbnail?: string): Promise<OpenProject>;
  rename(file: string, name: string): Promise<HomeState>;
  duplicate(file: string, name: string): Promise<HomeState>;
  remove(file: string): Promise<HomeState>;
  reveal(file: string): Promise<void>;
  importMedia(projectId: string, files?: string[]): Promise<ImportResult>;
  filePath(file: File): string;
  onMediaProgress(listener: (progress: MediaProgress) => void): () => void;
  chooseExport(value: ExportSettings): Promise<string | undefined>;
  startExport(value: ExportSettings, file: string, rasters: TextPng[]): Promise<ExportResult>;
  stageTextFrames(batch: TextFrameBatch): Promise<void>;
  cancelExport(): Promise<void>;
  openLog(): Promise<void>;
  onExportProgress(listener: (progress: ExportProgress) => void): () => void;
  stage(project: Project): Promise<void>;
  saveAs(project: Project, name: string, folder: string): Promise<OpenProject>;
  discardRecovery(file: string): Promise<void>;
  missing(projectId: string): Promise<Asset[]>;
  relink(projectId: string, assetId: string): Promise<OpenProject | undefined>;
  windowControl(action: WindowAction): Promise<boolean>;
  onWindowMaximized(listener: (maximized: boolean) => void): () => void;
}

declare global {
  interface Window { desktop: DesktopApi }
}
