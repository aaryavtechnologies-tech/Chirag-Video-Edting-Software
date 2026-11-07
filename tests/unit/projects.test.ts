import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject, loadProject, parseProject, saveProject } from '../../electron/services/projects';
import { Settings } from '../../electron/services/settings';
import { projectDimensions } from '../../src/lib/geometry';
import { strings } from '../../src/lib/strings';

let folder: string;
beforeEach(async () => { folder = await mkdtemp(join(tmpdir(), 'video-editor-test-')); });
afterEach(async () => { await rm(folder, { recursive: true, force: true }); });

const settings = { width: 3840, height: 2160, fps: 60 as const };

describe('project files', () => {
  it('creates and reopens a project with an atomic save', async () => {
    const { file, project } = await createProject({ name: 'Sample', folder, settings });
    expect((await readdir(join(folder, 'Sample'))).sort()).toEqual(
      ['.video-editor-project', 'Sample.vedit', 'cache', 'exports'],
    );
    expect(await loadProject(file)).toEqual({ file, project });
    const saved = await saveProject(file, { ...project, name: 'Renamed', metadata: { keep: true } });
    expect(await loadProject(file)).toEqual(saved);
    expect(saved.project.metadata).toEqual({ keep: true });
  });

  it('rejects invalid and unsupported input without inventing a migration', async () => {
    const file = join(folder, 'bad.vedit');
    await writeFile(file, '{');
    await expect(loadProject(file)).rejects.toThrow(strings.invalidProject);
    expect(() => parseProject({ version: 2 })).toThrow(strings.unsupportedVersion);
    expect(() => parseProject({ version: 1 })).toThrow(strings.invalidProject);
  });

  it('keeps optional fields optional and preserves nested extra properties', () => {
    const value = { version: 1, id: '', name: '', settings: { ...settings, hdr: false }, assets: [], tracks: [] };
    expect(parseProject(value)).toEqual(value);
    expect(() => parseProject({ ...value, settings: { ...settings, fps: 29.97 } }))
      .toThrow(strings.invalidProject);
    expect(() => parseProject({ ...value, tracks: [{ id: 't', name: 'V1', kind: 'video',
      clips: [{ id: 'c', start: 0, duration: 0, type: 'text' }],
    }] })).toThrow(strings.invalidProject);
  });

  it('protects existing folders and rejects unsafe names', async () => {
    await createProject({ name: 'Sample', folder, settings });
    await expect(createProject({ name: 'Sample', folder, settings })).rejects.toThrow(strings.alreadyExists);
    await expect(createProject({ name: '../Outside', folder, settings })).rejects.toThrow(strings.invalidName);
  });

  it('persists preferences and recent entries across sessions', async () => {
    const file = join(folder, 'settings.json');
    const store = await Settings.load(file, folder);
    const opened = await createProject({ name: 'Sample', folder, settings });
    await store.remember(opened);
    await store.remember(opened);
    await store.update({ folder, theme: 'light', autosave: 45 });
    expect((await Settings.load(file, folder)).read()).toMatchObject({
      preferences: { folder, theme: 'light', autosave: 45 },
      recent: [{ file: opened.file, duration: 0, name: 'Sample' }],
    });
  });
});

it('sizes 4K presets for landscape, portrait and square projects', () => {
  expect(projectDimensions('16:9', '4K')).toEqual({ width: 3840, height: 2160 });
  expect(projectDimensions('9:16', '4K')).toEqual({ width: 2160, height: 3840 });
  expect(projectDimensions('1:1', '4K')).toEqual({ width: 3840, height: 3840 });
});

