import { rm, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { OpenProject } from '../../src/types/desktop';
import { loadProject, saveProject } from './projects';

function autosaveFile(file: string) {
  return file.slice(0, -extname(file).length) + '.autosave.vedit';
}

export async function newerAutosave(file: string) {
  try {
    const [original, autosave] = await Promise.all([stat(file), stat(autosaveFile(file))]);
    // Explicit saves remove the checkpoint. Cache metadata may change the original's mtime.
    return original.isFile() && autosave.isFile();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function readAutosave(opened: OpenProject): Promise<OpenProject | undefined> {
  if (!await newerAutosave(opened.file)) return;
  const recovery = await loadProject(autosaveFile(opened.file));
  if (recovery.project.id === opened.project.id) return { file: opened.file, project: recovery.project };
}

export function writeAutosave(opened: OpenProject) {
  return saveProject(autosaveFile(opened.file), opened.project);
}

export function discardAutosave(file: string) {
  return rm(autosaveFile(file), { force: true });
}
