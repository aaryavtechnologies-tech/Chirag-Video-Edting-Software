import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { channels, exportProgressChannel, mediaProgressChannel, type DesktopApi, type MediaProgress } from '../src/types/desktop';
import type { ExportProgress } from '../src/types/export';

const api: DesktopApi = {
  home: () => ipcRenderer.invoke(channels.home),
  preferences: (value) => ipcRenderer.invoke(channels.preferences, value),
  folder: (current) => ipcRenderer.invoke(channels.folder, current),
  create: (value) => ipcRenderer.invoke(channels.create, value),
  open: (file) => ipcRenderer.invoke(channels.open, file),
  save: (project) => ipcRenderer.invoke(channels.save, project),
  rename: (file, name) => ipcRenderer.invoke(channels.rename, file, name),
  duplicate: (file, name) => ipcRenderer.invoke(channels.duplicate, file, name),
  remove: (file) => ipcRenderer.invoke(channels.remove, file),
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
  cancelExport: () => ipcRenderer.invoke(channels.cancelExport),
  openLog: () => ipcRenderer.invoke(channels.openLog),
  onExportProgress: (listener) => {
    const forward = (_event: IpcRendererEvent, progress: ExportProgress) => listener(progress);
    ipcRenderer.on(exportProgressChannel, forward);
    return () => ipcRenderer.removeListener(exportProgressChannel, forward);
  },
};

contextBridge.exposeInMainWorld('desktop', api);
