import { expect, test, _electron as electron } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { strings as s } from '../../src/lib/strings';

test('creates a 4K60 project and reopens it from Home', async ({}, testInfo) => {
  const profile = resolve(testInfo.outputPath('profile'));
  const projects = resolve(testInfo.outputPath('projects'));
  await mkdir(profile, { recursive: true });
  await mkdir(projects, { recursive: true });
  await writeFileWithPreferences(profile, projects);
  const app = await electron.launch({
    args: [`--user-data-dir=${profile}`, '.'],
  });
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

async function writeFileWithPreferences(profile: string, folder: string) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(profile, 'settings.json'), JSON.stringify({
    preferences: { folder, theme: 'dark', autosave: 30 }, recent: [],
  }));
}
