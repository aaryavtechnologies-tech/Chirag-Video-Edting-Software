import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Asset } from '../../src/types/project';
import { runMediaTool } from './ffmpeg';

export async function generateWaveform(root: string, asset: Asset) {
  const block = Math.max(100, Math.ceil((asset.duration ?? 1) * 1000 / 2000));
  const raw = await runMediaTool('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', asset.path,
    '-vn', '-map', '0:a:0', '-ac', '1',
    '-af', `aformat=channel_layouts=mono,aresample=1000,asetnsamples=n=${block}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-`,
    '-f', 'null', '-',
  ]);
  const peaks = Array.from(raw.matchAll(/lavfi\.astats\.Overall\.Peak_level=([^\r\n]+)/g),
    ([, decibels]) => Math.min(1, 10 ** (Number(decibels) / 20)) || 0);
  if (!peaks.length) throw new Error('Waveform generation returned no peaks');
  const file = `cache/${asset.id}.wave.json`;
  await writeFile(join(root, file), JSON.stringify({ step: block / 1000, peaks }));
  return file;
}
