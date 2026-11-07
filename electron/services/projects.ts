import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { projectSchema, projectSettingsSchema } from '../../src/lib/schema';
import { strings } from '../../src/lib/strings';
import type { NewProject, OpenProject, RecentProject } from '../../src/types/desktop';
import type { Project } from '../../src/types/project';

export const ownedFolderMarker = '.video-editor-project';
export const thumbnailKey = (file: string) => createHash('sha256').update(file).digest('hex');
export const nameSchema = z.string().trim().min(1).max(120).refine(
  (name) => !/[<>:"/\\|?*\u0000-\u001f]/u.test(name) && !/[. ]$/.test(name) &&
    !/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name),
  strings.invalidName,
);

export function parseProject(value: unknown): Project {
  if (typeof value === 'object' && value !== null && 'version' in value && value.version !== 1) {
    throw new Error(strings.unsupportedVersion);
  }
  const result = projectSchema.safeParse(value);
  if (!result.success) throw new Error(strings.invalidProject);
  return result.data;
}

export async function loadProject(file: string): Promise<OpenProject> {
  const contents = await readFile(file, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(contents.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(strings.invalidProject);
  }
  return { file, project: parseProject(value) };
}

export async function writeJson(file: string, value: unknown) {
  const temp = join(dirname(file), `.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function saveProject(file: string, value: Project): Promise<OpenProject> {
  const project = parseProject({ ...value, updatedAt: new Date().toISOString() });
  await writeJson(file, project);
  return { file, project };
}

export async function createProject(request: NewProject, source?: Project): Promise<OpenProject> {
  const name = nameSchema.parse(request.name);
  const settings = projectSettingsSchema.parse(request.settings);
  const { width, height } = settings;
  if (!source && [width, height].some((size) => size > 3840 || size % 2 !== 0)) {
    throw new Error(strings.invalidSize);
  }
  const parent = resolve(z.string().min(1).parse(request.folder));
  const folder = join(parent, name);
  await mkdir(parent, { recursive: true });
  try {
    await mkdir(folder);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new Error(strings.alreadyExists);
    }
    throw error;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    await mkdir(join(folder, 'cache'));
    await mkdir(join(folder, 'exports'));
    const assets = source?.assets.map((asset) => ({
      ...asset, proxyPath: null, thumbPath: null, waveformPath: null,
    })) ?? [];
    const tracks = source?.tracks ?? [
      { id: randomUUID(), kind: 'video', name: strings.trackVideo + '1', order: 0, clips: [] },
      { id: randomUUID(), kind: 'video', name: strings.trackVideo + '2', order: 1, clips: [] },
      { id: randomUUID(), kind: 'audio', name: strings.trackAudio + '1', order: 0, clips: [] },
    ];
    const project = parseProject({
      ...source, version: 1, id, name, createdAt: now, updatedAt: now, settings, assets, tracks,
    });
    await writeFile(join(folder, ownedFolderMarker), id, { flag: 'wx' });
    return await saveProject(join(folder, name + '.vedit'), project);
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw error;
  }
}

export function recentProject({ file, project }: OpenProject, thumbnail?: string): RecentProject {
  const duration = project.tracks.reduce((end, track) =>
    track.clips.reduce((latest, clip) => Math.max(latest, clip.start + clip.duration), end), 0);
  const { width, height, background = '#000000' } = project.settings;
  return { file, name: project.name, editedAt: project.updatedAt ?? project.createdAt ?? '',
    duration, width, height, background, thumbnail };
}

