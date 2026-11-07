import { expect, test, _electron as electron } from '@playwright/test';
import { execFile } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { strings as s } from '../../src/lib/strings';

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
      'color=blue:s=2048x1152:r=24:d=1', '-c:v', 'libx264', '-threads', '2', '-y', source]);
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
    await page.locator('.ruler .track-lane').click({ position: { x: 40, y: 10 } });
    await page.getByRole('button', { name: s.split, exact: true }).click();
    await expect(page.locator('[data-clip-id]')).toHaveCount(2);
    await page.getByRole('button', { name: s.home, exact: true }).click();
    await page.getByRole('button', { name: new RegExp(s.defaultName) }).click();
    await expect(page.getByText(s.proxyReady)).toBeVisible();
    await expect(page.locator('[data-clip-id]')).toHaveCount(2);
    const file = join(projects, s.defaultName, s.defaultName + '.vedit');
    expect(JSON.parse(await readFile(file, 'utf8')).assets[0]).toMatchObject({
      path: source, width: 2048, height: 1152, fps: 24,
      thumbPath: expect.stringMatching(/^cache\//), proxyPath: expect.stringMatching(/^cache\//),
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
