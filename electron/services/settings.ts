import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { HomeState, OpenProject, Preferences } from '../../src/types/desktop';
import { recentProject, writeJson } from './projects';

export const preferencesSchema = z.object({
  folder: z.string().min(1), theme: z.enum(['dark', 'light']),
  autosave: z.number().int().min(5).max(3600),
});

const recentSchema = z.object({
  file: z.string(), name: z.string(), editedAt: z.string(), duration: z.number(),
  width: z.number(), height: z.number(), background: z.string(),
});

const settingsSchema = z.object({
  preferences: preferencesSchema, recent: z.array(recentSchema).max(30),
});

export class Settings {
  private constructor(private file: string, private value: HomeState) {}

  static async load(file: string, defaultFolder: string) {
    const defaults: HomeState = {
      preferences: { folder: defaultFolder, theme: 'dark', autosave: 30 }, recent: [],
    };
    try {
      const result = settingsSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
      return new Settings(file, result.success ? result.data : defaults);
    } catch (error) {
      if (error instanceof SyntaxError ||
        (error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        return new Settings(file, defaults);
      }
      throw error;
    }
  }

  read() { return this.value; }

  private async write(value: HomeState) {
    await writeJson(this.file, value);
    this.value = value;
    return value;
  }

  update(preferences: Preferences) {
    return this.write({ ...this.value, preferences: preferencesSchema.parse(preferences) });
  }

  remember(project: OpenProject) {
    return this.write({
      ...this.value,
      recent: [recentProject(project), ...this.value.recent.filter((item) => item.file !== project.file)].slice(0, 30),
    });
  }

  forget(file: string) {
    return this.write({ ...this.value, recent: this.value.recent.filter((item) => item.file !== file) });
  }
}
