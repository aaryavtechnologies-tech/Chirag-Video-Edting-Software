import { expect, test, _electron as electron } from '@playwright/test';
import { execFile } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { strings as s } from '../../src/lib/strings';
import { createProject, saveProject } from '../../electron/services/projects';

test('creates a 4K60 project and reopens it from Home', async ({}, testInfo) => {
  const { app, projects } = await launch(testInfo.outputPath('workspace'));
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: s.newProject }).click();
    await page.getByLabel(s.name).fill('Sample');
    await page.getByLabel(s.resolution).selectOption('4K');
    await page.getByLabel(s.frameRate).selectOption('60');
    await page.getByRole('button', { name: s.create }).click();
    await expect(page.getByRole('heading', { name: 'Sample' })).toBeVisible();
    await page.getByRole('button', { name: s.save, exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(s.saved);
    await page.getByRole('button', { name: s.home, exact: true }).click();
    await page.getByRole('button', { name: /Sample/ }).click();
    await expect(page.getByRole('heading', { name: 'Sample' })).toBeVisible();
    const file = join(projects, 'Sample', 'Sample.vedit');
    expect(JSON.parse(await readFile(file, 'utf8')).settings)
      .toMatchObject({ width: 3840, height: 2160, fps: 60 });
  } finally {
    await app.close();
  }
});

test('imports a video, builds a proxy, and persists media across reopening', async ({}, testInfo) => {
  const root = testInfo.outputPath('workspace');
  const { app, projects } = await launch(root);
  try {
    if (!ffmpeg) throw new Error('FFmpeg not available');
    const source = join(root, 'large.mp4');
    await promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
      'color=blue:s=2048x1152:r=24:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'libx264', '-c:a', 'aac', '-threads', '2', '-y', source]);
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, source);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: s.newProject }).click();
    await page.getByRole('button', { name: s.create }).click();
    await page.getByRole('button', { name: s.importMedia }).click();
    await expect(page.getByText('large.mp4', { exact: true })).toBeVisible();
    await expect(page.getByText(s.proxyReady)).toBeVisible();
    await expect.poll(() => page.locator('.media-thumb img').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: s.undo, exact: true }).click();
    await expect(page.getByText('large.mp4', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: s.redo, exact: true }).click();
    await expect(page.getByText(s.proxyReady)).toBeVisible();
    await page.locator('.media-grid li').dragTo(page.locator('.timeline-row[data-track-id] .track-lane').first(), {
      targetPosition: { x: 0, y: 20 },
    });
    await expect(page.locator('[data-clip-id]')).toHaveCount(1);
    await expect(page.locator('.clip-wave')).toHaveCount(1);
    await page.locator('.ruler .track-lane').click({ position: { x: 40, y: 10 } });
    await expect.poll(() => page.getByLabel(s.preview, { exact: true }).evaluate((canvas: HTMLCanvasElement) =>
      canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[2]))
      .toBeGreaterThan(200);
    await page.getByRole('button', { name: s.split, exact: true }).click();
    await expect(page.locator('[data-clip-id]')).toHaveCount(2);
    await page.getByRole('button', { name: s.home, exact: true }).click();
    await page.getByRole('button', { name: new RegExp(s.defaultName) }).click();
    await expect(page.getByText(s.proxyReady)).toBeVisible();
    await expect(page.locator('[data-clip-id]')).toHaveCount(2);
    await page.locator('.timeline-clip').first().click({ button: 'right' });
    await page.getByRole('button', { name: s.detachAudio, exact: true }).click();
    await expect(page.locator('.clip-audio')).toHaveCount(1);
    await expect(page.locator('.clip-audio .clip-wave')).toHaveCount(1);
    const file = join(projects, s.defaultName, s.defaultName + '.vedit');
    expect(JSON.parse(await readFile(file, 'utf8')).assets[0]).toMatchObject({
      path: source, width: 2048, height: 1152, fps: 24,
      thumbPath: expect.stringMatching(/^cache\//), proxyPath: expect.stringMatching(/^cache\//),
      waveformPath: expect.stringMatching(/^cache\//),
    });
  } finally {
    await app.close();
  }
});

async function launch(root: string) {
  const profile = resolve(root, 'profile');
  const projects = resolve(root, 'projects');
  await mkdir(profile, { recursive: true });
  await mkdir(projects, { recursive: true });
  await writeFile(join(profile, 'settings.json'), JSON.stringify({
    preferences: { folder: projects, theme: 'dark', autosave: 30 }, recent: [],
  }));
  const app = await electron.launch({
    args: [`--user-data-dir=${profile}`, '.'],
  });
  return { app, projects };
}

test('plays three video layers at Half quality in track order', async ({}, testInfo) => {
  const root = testInfo.outputPath('workspace');
  const { app, projects } = await launch(root);
  try {
    if (!ffmpeg) throw new Error('FFmpeg not available');
    const binary = ffmpeg;
    const opened = await createProject({ name: 'Layers', folder: projects,
      settings: { width: 640, height: 360, fps: 30 } });
    const colors = ['red', 'lime', 'blue'];
    const assets = await Promise.all(colors.map(async (color, index) => {
      const path = join(root, color + '.mp4');
      await promisify(execFile)(binary, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
        `color=${color}:s=640x360:r=30:d=2`, '-f', 'lavfi', '-i',
        `sine=frequency=${440 + index * 137}:duration=2`,
        '-c:v', 'libx264', '-c:a', 'aac', '-threads', '2', '-y', path]);
      return { id: color, type: 'video' as const, path, duration: 2, width: 640, height: 360, hasAudio: true };
    }));
    await saveProject(opened.file, { ...opened.project, assets,
      tracks: [...assets.map((asset, order) => ({
        id: 'track-' + order, name: 'V' + (order + 1), kind: 'video' as const, order,
        clips: [{ id: 'clip-' + order, assetId: asset.id, type: 'video' as const, start: 0, duration: 2,
          muted: true, transform: { scale: [1, 0.7, 0.35][order] } }],
      })), ...assets.slice(0, 2).map((asset, order) => ({
        id: 'audio-track-' + order, name: 'A' + (order + 1), kind: 'audio' as const, order,
        clips: [{ id: 'audio-clip-' + order, assetId: asset.id, type: 'audio' as const, start: 0, duration: 2 }],
      }))],
    });
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, opened.file);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: s.openProject }).click();
    await expect(page.getByLabel(s.quality)).toHaveValue('half');
    const preview = page.getByLabel(s.preview, { exact: true });
    await expect.poll(() => preview.evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d')!;
      return [0.05, 0.2, 0.5].map((fraction, index) =>
        context.getImageData(canvas.width * fraction, canvas.height / 2, 1, 1).data[index] > 200);
    })).toEqual([true, true, true]);
    await page.getByRole('button', { name: s.play, exact: true }).click();
    await expect(page.locator('.timeline-time')).not.toHaveText('00:00:00:00');
    await expect.poll(() => page.getByLabel(s.audioMeter).evaluate((meter: HTMLMeterElement) => meter.value))
      .toBeGreaterThan(0.15);
    await page.getByRole('button', { name: s.pause, exact: true }).click();
  } finally {
    await app.close();
  }
});

test('edits a title on the canvas and saves its gradient style', async ({}, testInfo) => {
  const { app, projects } = await launch(testInfo.outputPath('workspace'));
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: s.newProject }).click();
    await page.getByRole('button', { name: s.create }).click();
    await page.getByRole('button', { name: s.text, exact: true }).click();
    await page.getByRole('button', { name: s.title, exact: true }).click();
    await page.getByRole('button', { name: s.styleNames.sunset, exact: true }).click();
    const preview = page.getByLabel(s.preview, { exact: true });
    await preview.dblclick();
    await page.getByLabel(s.inlineText).fill('Sunset');
    await page.getByLabel(s.inlineText).press('Control+Enter');
    await expect(page.locator('.clip-text')).toHaveText('Sunset');
    await page.getByRole('button', { name: s.save, exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(s.saved);
    const file = join(projects, s.defaultName, s.defaultName + '.vedit');
    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved.tracks.flatMap((track: { clips: unknown[] }) => track.clips)).toEqual([
      expect.objectContaining({ text: 'Sunset', style: expect.objectContaining({
        fill: expect.objectContaining({ type: 'gradient' }),
      }) }),
    ]);
    await preview.click({ position: { x: 12, y: 12 } });
    const output = join(projects, 'styled.mp4');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, output);
    await page.getByRole('button', { name: s.export, exact: true }).click();
    await page.getByRole('button', { name: s.chooseOutput }).click();
    await expect(page.getByText(s.exportDone)).toBeVisible();
    if (!ffmpeg) throw new Error('FFmpeg not available');
    const frame = join(projects, 'export-frame.png');
    await promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', output,
      '-frames:v', '1', '-update', '1', frame]);
    const png = (await readFile(frame)).toString('base64');
    const coverage = await preview.evaluate(async (canvas: HTMLCanvasElement, base64) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      const rendered = document.createElement('canvas');
      rendered.width = canvas.width;
      rendered.height = canvas.height;
      rendered.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const ink = (surface: HTMLCanvasElement) => {
        const pixels = surface.getContext('2d')!.getImageData(0, 0, surface.width, surface.height).data;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 80) count += 1;
        return count;
      };
      return { preview: ink(canvas), export: ink(rendered) };
    }, png);
    expect(coverage.preview).toBeGreaterThan(100);
    expect(coverage.export / coverage.preview).toBeGreaterThan(0.8);
    expect(coverage.export / coverage.preview).toBeLessThan(1.2);
  } finally {
    await app.close();
  }
});

