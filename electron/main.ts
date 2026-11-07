import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { channels, type DesktopApi, type OpenProject } from '../src/types/desktop';
import { strings } from '../src/lib/strings';
import { createProject, loadProject, nameSchema, ownedFolderMarker, parseProject, saveProject } from './services/projects';
import { Settings } from './services/settings';

let window: BrowserWindow | undefined;
let active: OpenProject | undefined;
let pending: Promise<unknown> = Promise.resolve();
const html = join(__dirname, '../renderer/index.html');
const url = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(html).href;

async function logError(error: unknown) {
  const line = error instanceof Error ? error.stack ?? error.message : String(error);
  await appendFile(join(app.getPath('userData'), 'editor.log'), `${new Date().toISOString()} ${line}\n`).catch(() => undefined);
}

function register<K extends keyof DesktopApi>(key: K, handler: (...args: Parameters<DesktopApi[K]>) => ReturnType<DesktopApi[K]>) {
  ipcMain.handle(channels[key], (event, ...args: Parameters<DesktopApi[K]>) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== url) {
      throw new Error(strings.operationFailed);
    }
    const task = pending.then(async () => {
      try {
        return await handler(...args);
      } catch (error) {
        await logError(error);
        const messages: string[] = [strings.invalidProject, strings.unsupportedVersion, strings.invalidName,
          strings.alreadyExists, strings.invalidSize, strings.recentUnavailable];
        const message = error instanceof Error && messages.includes(error.message) ? error.message :
          error instanceof Error && error.name === 'ZodError' ? strings.invalidName : strings.operationFailed;
        throw new Error(message);
      }
    });
    pending = task.catch(() => undefined);
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
    return activate(await saveProject(active.file, project));
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
  window.on('closed', () => { window = undefined; active = undefined; });
  void window.loadURL(url).catch(logError);
}

void app.whenReady().then(async () => {
  const data = app.getPath('userData');
  await mkdir(data, { recursive: true });
  const defaultFolder = join(app.getPath('documents'), 'VideoEditorProjects');
  registerHandlers(await Settings.load(join(data, 'settings.json'), defaultFolder));
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
}).catch(async (error) => {
  await logError(error);
  dialog.showErrorBox(strings.app, strings.operationFailed);
  app.quit();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

