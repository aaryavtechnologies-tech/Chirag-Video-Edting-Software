import { stat } from 'node:fs/promises';
import type { Asset, Project } from '../../src/types/project';

export async function missingAssets(project: Project) {
  const missing = await Promise.all(project.assets.map(async (asset) => {
    try { return (await stat(asset.path)).isFile() ? undefined : asset; }
    catch { return asset; }
  }));
  return missing.filter((asset): asset is Asset => !!asset);
}
