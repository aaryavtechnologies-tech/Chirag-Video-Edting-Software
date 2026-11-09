import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { channels, exportProgressChannel, mediaProgressChannel, windowMaximizedChannel, type DesktopApi, type MediaProgress } from '../src/types/desktop';
import type { ExportProgress } from '../src/types/export';

const api: DesktopApi = {
  downloaderInfo: (url) => ipcRenderer.invoke(channels.downloaderInfo, url),
  home: () => ipcRenderer.invoke(channels.home),
  preferences: (value) => ipcRenderer.invoke(channels.preferences, value),
  folder: (current) => ipcRenderer.invoke(channels.folder, current),
  create: (value) => ipcRenderer.invoke(channels.create, value),
  open: (file, recover) => ipcRenderer.invoke(channels.open, file, recover),
  save: (project, thumbnail) => ipcRenderer.invoke(channels.save, project, thumbnail),
  rename: (file, name) => ipcRenderer.invoke(channels.rename, file, name),
  duplicate: (file, name) => ipcRenderer.invoke(channels.duplicate, file, name),
  remove: (file) => ipcRenderer.invoke(channels.remove, file),
  revealAsset: (project, asset) => ipcRenderer.invoke(channels.revealAsset, project, asset),
  reveal: (file) => ipcRenderer.invoke(channels.reveal, file),
  importMedia: (projectId, files) => ipcRenderer.invoke(channels.importMedia, projectId, files),
  filePath: (file) => webUtils.getPathForFile(file),
  onMediaProgress: (listener) => {
    const forward = (_event: IpcRendererEvent, progress: MediaProgress) => listener(progress);
    ipcRenderer.on(mediaProgressChannel, forward);
    return () => ipcRenderer.removeListener(mediaProgressChannel, forward);
  },
  chooseExport: (value) => ipcRenderer.invoke(channels.chooseExport, value),
  startExport: (value, file, rasters) => ipcRenderer.invoke(channels.startExport, value, file, rasters),
  stageTextFrames: (batch) => ipcRenderer.invoke(channels.stageTextFrames, batch),
  openExportOutput: (file, folder) => ipcRenderer.invoke(channels.openExportOutput, file, folder),
  cancelExport: () => ipcRenderer.invoke(channels.cancelExport),
  openLog: () => ipcRenderer.invoke(channels.openLog),
  stage: (project) => ipcRenderer.invoke(channels.stage, project),
  saveAs: (project, name, folder) => ipcRenderer.invoke(channels.saveAs, project, name, folder),
  discardRecovery: (file) => ipcRenderer.invoke(channels.discardRecovery, file),
  missing: (id) => ipcRenderer.invoke(channels.missing, id),
  relink: (id, asset) => ipcRenderer.invoke(channels.relink, id, asset),
  windowControl: (action) => ipcRenderer.invoke(channels.windowControl, action),
  onWindowMaximized: (listener) => {
    const forward = (_event: IpcRendererEvent, maximized: boolean) => listener(maximized);
    ipcRenderer.on(windowMaximizedChannel, forward);
    return () => ipcRenderer.removeListener(windowMaximizedChannel, forward);
  },
  onExportProgress: (listener) => {
    const forward = (_event: IpcRendererEvent, progress: ExportProgress) => listener(progress);
    ipcRenderer.on(exportProgressChannel, forward);
    return () => ipcRenderer.removeListener(exportProgressChannel, forward);
  },
};

contextBridge.exposeInMainWorld('desktop', api);
