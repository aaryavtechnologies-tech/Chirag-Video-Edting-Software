import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { channels, exportProgressChannel, mediaProgressChannel, type DesktopApi, type MediaProgress, type OpenProject } from '../src/types/desktop';
import { strings } from '../src/lib/strings';
import { createProject, loadProject, nameSchema, ownedFolderMarker, parseProject, saveProject, thumbnailKey } from './services/projects';
import { Settings } from './services/settings';
import { importMedia, needsProxy, populateAssetCache, queueProxy } from './services/media';
import { mediaExtensions, probeAsset } from './services/probe';
import { z } from 'zod';
import { exportProject } from './services/export';
import { exportSettingsSchema, videoExtension } from '../src/types/export';
import { discardAutosave, newerAutosave, readAutosave, writeAutosave } from './services/recovery';
import { missingAssets } from './services/relink';
import type { Project } from '../src/types/project';

let window: BrowserWindow | undefined;
let active: OpenProject | undefined;
let working: OpenProject | undefined;
let pending: Promise<unknown> = Promise.resolve();
let exporting: AbortController | undefined;
let exportJob: Promise<unknown> | undefined;
let exportPath: string | undefined;
let confirmClose = async () => true;
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
          strings.exportMissing, strings.exportFailed, strings.exportSpace, strings.relinkInvalid];
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
  let checkpoint = Date.now();
  function known(file: string) {
    if (!settings.read().recent.some((entry) => entry.file === file)) {
      throw new Error(strings.recentUnavailable);
    }
    return file;
  }

  async function activate(project: OpenProject, thumbnail?: string) {
    await settings.remember(project, thumbnail);
    active = project;
    return project;
  }

  async function persist(value: Project, image?: string) {
    const project = parseProject(value);
    if (!active || active.project.id !== project.id) throw new Error(strings.operationFailed);
    const latest = new Map(active.project.assets.map((asset) => [asset.id, asset]));
    const assets = project.assets.map((asset) => {
      const stored = latest.get(asset.id);
      return stored?.path === asset.path && stored.proxyPath && !asset.proxyPath
        ? { ...asset, proxyPath: stored.proxyPath } : asset;
    });
    let thumbnail: string | undefined;
    if (typeof image === 'string' && image.length <= 240_000) {
      const bytes = Buffer.from(image, 'base64');
      if (bytes.length > 3 && bytes.subarray(0, 3).toString('hex') === 'ffd8ff') {
        const key = thumbnailKey(active.file);
        try {
          const directory = join(app.getPath('userData'), 'project-thumbnails');
          await mkdir(directory, { recursive: true });
          await writeFile(join(directory, key + '.jpg'), bytes);
          thumbnail = key;
        } catch (error) { await logError(error); }
      }
    }
    const saved = await activate(await saveProject(active.file, { ...project, assets }), thumbnail);
    working = undefined;
    await discardAutosave(saved.file).catch(logError);
    return saved;
  }

  async function openProject(file: string, recover?: boolean) {
    const original = await loadProject(file);
    const newer = await readAutosave(original).catch(async (error) => { await logError(error); return undefined; });
    if (newer) {
      const restore = recover ?? (await dialog.showMessageBox(window!, {
        type: 'question', message: strings.recoveryPrompt, buttons: [strings.restore, strings.discard],
        defaultId: 0, cancelId: 1,
      })).response === 0;
      if (restore) {
        const opened = await activate(newer);
        working = opened;
        checkpoint = Date.now();
        return opened;
      }
      await discardAutosave(file);
    }
    working = undefined;
    return activate(original);
  }

  const timer = setInterval(() => {
    if (!working || Date.now() - checkpoint < settings.read().preferences.autosave * 1000) return;
    checkpoint = Date.now();
    pending = pending.then(async () => { if (working) await writeAutosave(working); }).catch(logError);
  }, 1000);
  timer.unref();

  confirmClose = async () => {
    await pending;
    if (working) {
      const decision = await dialog.showMessageBox(window!, {
        type: 'question', message: strings.unsavedPrompt, buttons: [strings.save, strings.discard, strings.cancel],
        defaultId: 0, cancelId: 2,
      });
      if (decision.response === 2) return false;
      if (decision.response === 0) await persist(working.project);
      else {
        await discardAutosave(working.file);
        working = undefined;
      }
    }
    exporting?.abort();
    await exportJob?.catch(() => undefined);
    return true;
  };

  function reportProxy(project: OpenProject, update: MediaProgress) {
    const send = () => {
      if (active?.project.id === update.projectId) window?.webContents.send(mediaProgressChannel, update);
    };
    if (!update.proxyPath) { send(); return; }
    const proxyPath = update.proxyPath;
    const task = pending.then(async () => {
      const latest = await loadProject(project.file);
      const source = project.project.assets.find((asset) => asset.id === update.assetId);
      if (latest.project.id !== update.projectId ||
        !latest.project.assets.some((asset) => asset.id === update.assetId && asset.path === source?.path)) return;
      const assets = latest.project.assets.map((asset) =>
        asset.id === update.assetId ? { ...asset, proxyPath } : asset);
      const saved = await saveProject(project.file, { ...latest.project, assets });
      if (active?.file === saved.file && active.project.id === saved.project.id) active = saved;
      if (working?.file === saved.file) {
        working = { ...working, project: { ...working.project, assets: working.project.assets.map((asset) =>
          asset.id === update.assetId && asset.path === source?.path ? { ...asset, proxyPath } : asset) } };
      }
      send();
    });
    pending = task.catch(async (error) => {
      await logError(error);
      reportProxy(project, { ...update, percent: 0, proxyPath: undefined, failed: true });
    });
  }

  register('home', async () => {
    const home = settings.read();
    for (const recent of home.recent) {
      if (await newerAutosave(recent.file).catch(async (error) => { await logError(error); return false; })) {
        return { ...home, recovery: recent };
      }
    }
    return home;
  });
  register('discardRecovery', async (file) => discardAutosave(known(file)));
  register('preferences', async (value) => settings.update(value));
  register('folder', async (current) => {
    const result = await dialog.showOpenDialog(window!, {
      defaultPath: current, properties: ['openDirectory', 'createDirectory'],
    });
    return result.filePaths[0];
  });
  register('create', async (request) => activate(await createProject(request)));
  register('open', async (file, recover) => {
    if (file !== undefined) return openProject(known(file), recover);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'], filters: [{ name: strings.projectFiles, extensions: ['vedit'] }],
    });
    return result.filePaths[0] ? openProject(result.filePaths[0]) : undefined;
  });
  register('stage', async (value) => {
    const project = parseProject(value);
    if (!active || active.project.id !== project.id) throw new Error(strings.operationFailed);
    if (!working) checkpoint = Date.now();
    working = { file: active.file, project };
  });
  register('save', persist);
  register('saveAs', async (value, name, folder) => {
    const project = parseProject(value);
    if (!active || active.project.id !== project.id) throw new Error(strings.operationFailed);
    const old = active;
    const saved = await activate(await createProject({ name, folder, settings: project.settings }, project));
    working = undefined;
    await discardAutosave(old.file).catch(logError);
    return saved;
  });
  register('missing', async (id) => {
    if (!active || active.project.id !== id) throw new Error(strings.operationFailed);
    return missingAssets(active.project);
  });
  register('relink', async (id, assetId) => {
    if (!active || active.project.id !== id || !/^[\w-]+$/.test(assetId)) throw new Error(strings.operationFailed);
    const opened = working ?? active;
    const asset = opened.project.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error(strings.relinkInvalid);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'], filters: [{ name: strings.mediaFiles, extensions: mediaExtensions }],
    });
    const file = result.filePaths[0];
    if (!file) return undefined;
    let replacement;
    try { replacement = await probeAsset(file, asset.id); }
    catch (error) { await logError(error); throw new Error(strings.relinkInvalid); }
    const longest = opened.project.tracks.flatMap((track) => track.clips)
      .filter((clip) => clip.assetId === assetId && clip.type !== 'image')
      .reduce((end, clip) => Math.max(end, clip.sourceOut ?? (clip.sourceIn ?? 0) + clip.duration * (clip.speed ?? 1)), 0);
    if (replacement.type !== asset.type || (replacement.duration ?? 0) + 0.05 < longest ||
      (asset.hasAudio && !replacement.hasAudio)) throw new Error(strings.relinkInvalid);
    const cached = await populateAssetCache(dirname(opened.file), replacement, logError);
    const saved = await persist({ ...opened.project, assets: opened.project.assets.map((item) => item.id === assetId ? cached : item) });
    if (needsProxy(cached)) queueProxy(saved, cached, (update) => reportProxy(saved, update), logError);
    return saved;
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
      const task = exportProject(active.project, settings, file, rasters,
        (progress) => window?.webContents.send(exportProgressChannel, progress), controller.signal);
      exportJob = task;
      const result = await task;
      if (settings.openFolder && result.files[0]) shell.showItemInFolder(result.files[0]);
      return result;
    } catch (error) {
      if (error instanceof Error && [strings.exportExists, strings.exportMissing, strings.exportSpace]
        .some((message) => message === error.message)) throw error;
      await logError(error);
      throw new Error(strings.exportFailed);
    } finally {
      exporting = undefined;
      exportJob = undefined;
    }
  }, false);
  register('cancelExport', async () => { exporting?.abort(); }, false);
  register('openLog', async () => { shell.showItemInFolder(join(app.getPath('userData'), 'editor.log')); });
}

function createWindow() {
  window = new BrowserWindow({
    title: strings.app, width: 1440, height: 840, minWidth: 1280, minHeight: 720,
    backgroundColor: '#10111a',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  let closing = false;
  let confirmed = false;
  window.on('close', (event) => {
    if (confirmed) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    void confirmClose().then((allowed) => {
      if (allowed) { confirmed = true; window?.close(); }
    }).catch(async (error) => {
      await logError(error);
      dialog.showErrorBox(strings.app, strings.operationFailed);
    }).finally(() => { closing = false; });
  });
  window.on('closed', () => { window = undefined; active = undefined; working = undefined; });
  void window.loadURL(url).catch(logError);
}

void app.whenReady().then(async () => {
  const data = app.getPath('userData');
  await mkdir(data, { recursive: true });
  const defaultFolder = join(app.getPath('documents'), 'VideoEditorProjects');
  const settings = await Settings.load(join(data, 'settings.json'), defaultFolder);
  registerHandlers(settings);
  protocol.handle('editor-media', async (request) => {
    const { pathname, hostname } = new URL(request.url);
    const current = active;
    const asset = current?.project.assets.find((item) => encodeURIComponent(item.id) === pathname.slice(1));
    const missing = () => new Response(null, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (hostname === 'recent') {
      const key = pathname.slice(1);
      if (!/^[\da-f]{64}$/.test(key) || !settings.read().recent.some((item) => item.thumbnail === key)) return missing();
      return net.fetch(pathToFileURL(join(data, 'project-thumbnails', key + '.jpg')).href).catch(missing);
    }
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

