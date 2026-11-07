import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { Asset } from '../../src/types/project';
import type { ImportResult, MediaProgress, OpenProject } from '../../src/types/desktop';
import { runMediaTool } from './ffmpeg';
import { probeAsset } from './probe';

export function needsProxy(asset: Asset) {
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  return asset.type === 'video' && (Math.max(width, height) > 1920 || Math.min(width, height) > 1080);
}

let proxyQueue: Promise<void> = Promise.resolve();

export async function importMedia(
  project: OpenProject, files: string[],
  log: (error: unknown) => Promise<void>,
): Promise<ImportResult> {
  const root = dirname(project.file);
  await mkdir(join(root, 'cache'), { recursive: true });
  const imported: Asset[] = [];
  const failures: string[] = [];
  const seen = new Set(project.project.assets.map((asset) => asset.path));
  for (const file of files) {
    if (!isAbsolute(file) || seen.has(file)) continue;
    seen.add(file);
    try {
      const asset = await probeAsset(file, randomUUID());
      if (asset.type !== 'audio') {
        const thumbPath = `cache/${asset.id}.jpg`;
        try {
          await runMediaTool('ffmpeg', [
            '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', file,
            '-map', '0:V:0', '-vf', 'scale=320:180:force_original_aspect_ratio=decrease',
            '-frames:v', '1', '-update', '1', join(root, thumbPath),
          ]);
          asset.thumbPath = thumbPath;
        } catch (error) {
          await log(error);
        }
      }
      imported.push(asset);
    } catch (error) {
      failures.push(file);
      await log(error);
    }
  }
  const proxies = imported.filter(needsProxy).map((asset) => asset.id);
  return { assets: imported, failures, proxies };
}

export function queueProxy(
  project: OpenProject, asset: Asset, report: (update: MediaProgress) => void,
  log: (error: unknown) => Promise<void>,
) {
  const proxyPath = `cache/${asset.id}.proxy.mp4`;
  const file = join(dirname(project.file), proxyPath);
  const update = (state: Omit<MediaProgress, 'projectId' | 'assetId'>) =>
    report({ projectId: project.project.id, assetId: asset.id, ...state });
  proxyQueue = proxyQueue.then(async () => {
    try {
      update({ percent: 0 });
      await runMediaTool('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', asset.path,
        '-map', '0:V:0', '-map', '0:a:0?',
        '-vf', 'scale=960:960:force_original_aspect_ratio=decrease:force_divisible_by=2',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p',
        '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', '-progress', 'pipe:1', file,
      ], (time) => update({ percent: Math.max(0, Math.min(99, Math.floor(time / (asset.duration ?? 1) * 100))) }));
      update({ percent: 100, proxyPath });
    } catch (error) {
      await log(error);
      await rm(file, { force: true }).catch(log);
      update({ percent: 0, failed: true });
    }
  });
}

