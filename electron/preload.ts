import { contextBridge, ipcRenderer } from 'electron';
import { channels, type DesktopApi } from '../src/types/desktop';

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
};

contextBridge.exposeInMainWorld('desktop', api);
