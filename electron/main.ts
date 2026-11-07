import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { channels, exportProgressChannel, mediaProgressChannel, type DesktopApi, type MediaProgress, type OpenProject } from '../src/types/desktop';
import { strings } from '../src/lib/strings';
import { createProject, loadProject, nameSchema, ownedFolderMarker, parseProject, saveProject } from './services/projects';
import { Settings } from './services/settings';
import { importMedia, queueProxy } from './services/media';
import { mediaExtensions } from './services/probe';
import { z } from 'zod';
import { exportProject } from './services/export';
import { exportSettingsSchema, videoExtension } from '../src/types/export';

let window: BrowserWindow | undefined;
let active: OpenProject | undefined;
let pending: Promise<unknown> = Promise.resolve();
let exporting: AbortController | undefined;
let exportPath: string | undefined;
const html = join(__dirname, '../renderer/index.html');
const url = new URL(process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(html).href).href;
protocol.registerSchemesAsPrivileged([{
  scheme: 'editor-media', privileges: { standard: true, secure: true, stream: true, corsEnabled: true, supportFetchAPI: true },
}]);

async function logError(error: unknown) {
  const line = error instanceof Error ? error.stack ?? error.message : String(error);
  await appendFile(join(app.getPath('userData'), 'editor.log'), `${new Date().toISOString()} ${line}\n`).catch(() => undefined);
}

function register<K extends keyof typeof channels>(
  key: K, handler: (...args: Parameters<DesktopApi[K]>) => ReturnType<DesktopApi[K]>, serial = true,
) {
  ipcMain.handle(channels[key], (event, ...args: Parameters<DesktopApi[K]>) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== url) {
      throw new Error(strings.operationFailed);
    }
    const run = async () => {
      try {
        return await handler(...args);
      } catch (error) {
        await logError(error);
        const messages: string[] = [strings.invalidProject, strings.unsupportedVersion, strings.invalidName,
          strings.alreadyExists, strings.invalidSize, strings.recentUnavailable, strings.exportExists,
          strings.exportMissing, strings.exportFailed, strings.exportSpace];
        const message = error instanceof Error && messages.includes(error.message) ? error.message :
          error instanceof Error && error.name === 'ZodError' ? strings.invalidName : strings.operationFailed;
        throw new Error(message);
      }
    };
    const task = serial ? pending.then(run) : run();
    if (serial) pending = task.catch(() => undefined);
    return task;
  });
}

function registerHandlers(settings: Settings) {
  function known(file: string) {
    if (!settings.read().recent.some((entry) => entry.file === file)) {
      throw new Error(strings.recentUnavailable);
    }
    return file;
  }

  async function activate(project: OpenProject) {
    await settings.remember(project);
    active = project;
    return project;
  }

  function reportProxy(project: OpenProject, update: MediaProgress) {
    const send = () => {
      if (active?.project.id === update.projectId) window?.webContents.send(mediaProgressChannel, update);
    };
    if (!update.proxyPath) { send(); return; }
    const proxyPath = update.proxyPath;
    const task = pending.then(async () => {
      const latest = await loadProject(project.file);
      if (latest.project.id !== update.projectId ||
        !latest.project.assets.some((asset) => asset.id === update.assetId)) return;
      const assets = latest.project.assets.map((asset) =>
        asset.id === update.assetId ? { ...asset, proxyPath } : asset);
      const saved = await saveProject(project.file, { ...latest.project, assets });
      if (active?.file === saved.file && active.project.id === saved.project.id) active = saved;
      send();
    });
    pending = task.catch(async (error) => {
      await logError(error);
      reportProxy(project, { ...update, percent: 0, proxyPath: undefined, failed: true });
    });
  }

  register('home', async () => settings.read());
  register('preferences', async (value) => settings.update(value));
  register('folder', async (current) => {
    const result = await dialog.showOpenDialog(window!, {
      defaultPath: current, properties: ['openDirectory', 'createDirectory'],
    });
    return result.filePaths[0];
  });
  register('create', async (request) => activate(await createProject(request)));
  register('open', async (file) => {
    if (file !== undefined) return activate(await loadProject(known(file)));
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'], filters: [{ name: strings.projectFiles, extensions: ['vedit'] }],
    });
    return result.filePaths[0] ? activate(await loadProject(result.filePaths[0])) : undefined;
  });
  register('save', async (value) => {
    const project = parseProject(value);
    if (!active || active.project.id !== project.id) throw new Error(strings.operationFailed);
    const latest = new Map(active.project.assets.map((asset) => [asset.id, asset]));
    const assets = project.assets.map((asset) => {
      const stored = latest.get(asset.id);
      return stored?.path === asset.path && stored.proxyPath && !asset.proxyPath
        ? { ...asset, proxyPath: stored.proxyPath } : asset;
    });
    return activate(await saveProject(active.file, { ...project, assets }));
  });
  register('importMedia', async (projectId, dropped) => {
    if (!active || active.project.id !== projectId) throw new Error(strings.operationFailed);
    const project = active;
    const files = dropped === undefined ? (await dialog.showOpenDialog(window!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: strings.mediaFiles, extensions: mediaExtensions }],
    })).filePaths : z.array(z.string()).max(500).parse(dropped);
    if (!files.length) return { assets: [], failures: [], proxies: [] };
    const result = await importMedia(project, files, logError);
    if (!result.assets.length) return result;
    const saved = await activate(await saveProject(project.file, {
      ...project.project, assets: [...project.project.assets, ...result.assets],
    }));
    for (const asset of result.assets) {
      if (result.proxies.includes(asset.id)) queueProxy(saved, asset, (update) => reportProxy(saved, update), logError);
    }
    return result;
  });
  register('rename', async (file, name) => {
    const validated = nameSchema.safeParse(name);
    if (!validated.success) throw new Error(strings.invalidName);
    const { project } = await loadProject(known(file));
    return settings.remember(await saveProject(file, { ...project, name: validated.data }));
  });
  register('duplicate', async (file, name) => {
    const { project } = await loadProject(known(file));
    return settings.remember(await createProject({
      name, folder: dirname(dirname(file)), settings: project.settings,
    }, project));
  });
  register('remove', async (file) => {
    const { project } = await loadProject(known(file));
    const folder = dirname(file);
    const owner = await readFile(join(folder, ownedFolderMarker), 'utf8').catch(() => undefined);
    await shell.trashItem(owner === project.id ? folder : file);
    return settings.forget(file);
  });
  register('reveal', async (file) => { shell.showItemInFolder(known(file)); });
  register('chooseExport', async (value) => {
    if (!active) throw new Error(strings.exportFailed);
    const settings = exportSettingsSchema.parse(value);
    const ext = settings.mode === 'audio' ? settings.audioFormat : videoExtension(settings.videoFormat);
    const directory = join(dirname(active.file), 'exports');
    await mkdir(directory, { recursive: true });
    const result = await dialog.showSaveDialog(window!, {
      defaultPath: join(directory, active.project.name.replace(/[<>:"/\\|?*]/g, '_') + '.' + ext),
      filters: [{ name: strings.exportFiles, extensions: [ext] }],
    });
    exportPath = result.filePath;
    return exportPath;
  });
  register('startExport', async (settings, file, rasters) => {
    if (exporting || !active || !exportPath || file !== exportPath) throw new Error(strings.exportFailed);
    exportPath = undefined;
    const controller = new AbortController();
    exporting = controller;
    try {
      const result = await exportProject(active.project, settings, file, rasters,
        (progress) => window?.webContents.send(exportProgressChannel, progress), controller.signal);
      if (settings.openFolder && result.files[0]) shell.showItemInFolder(result.files[0]);
      return result;
    } catch (error) {
      if (error instanceof Error && [strings.exportExists, strings.exportMissing, strings.exportSpace]
        .some((message) => message === error.message)) throw error;
      await logError(error);
      throw new Error(strings.exportFailed);
    } finally {
      exporting = undefined;
    }
  }, false);
  register('cancelExport', async () => { exporting?.abort(); }, false);
  register('openLog', async () => { shell.showItemInFolder(join(app.getPath('userData'), 'editor.log')); });
}

function createWindow() {
  window = new BrowserWindow({
    title: strings.app, width: 1280, height: 840, minWidth: 800, minHeight: 600,
    backgroundColor: '#10111a',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('closed', () => { exporting?.abort(); window = undefined; active = undefined; });
  void window.loadURL(url).catch(logError);
}

void app.whenReady().then(async () => {
  const data = app.getPath('userData');
  await mkdir(data, { recursive: true });
  const defaultFolder = join(app.getPath('documents'), 'VideoEditorProjects');
  registerHandlers(await Settings.load(join(data, 'settings.json'), defaultFolder));
  protocol.handle('editor-media', async (request) => {
    const { pathname, hostname } = new URL(request.url);
    const current = active;
    const asset = current?.project.assets.find((item) => encodeURIComponent(item.id) === pathname.slice(1));
    const missing = () => new Response(null, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (!current || !asset) return missing();
    const folder = dirname(current.file);
    let file: string;
    if (hostname === 'source') {
      if (!isAbsolute(asset.path) || !mediaExtensions.includes(extname(asset.path).slice(1).toLowerCase())) return missing();
      file = asset.path;
    } else {
      const path = hostname === 'thumbnail' ? asset.thumbPath : hostname === 'proxy' ? asset.proxyPath :
        hostname === 'waveform' ? asset.waveformPath : undefined;
      const extension = hostname === 'thumbnail' ? '.jpg' : hostname === 'waveform' ? '.wave.json' : '.proxy.mp4';
      file = join(folder, 'cache', asset.id + extension);
      if (!path || !/^[\w-]+$/.test(asset.id) || resolve(folder, path) !== file) return missing();
    }
    const range = request.headers.get('range');
    try {
      const response = await net.fetch(pathToFileURL(file).href, range ? { headers: { range } } : {});
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return missing();
    }
  });
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
}).catch(async (error) => {
  await logError(error);
  dialog.showErrorBox(strings.app, strings.operationFailed);
  app.quit();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

