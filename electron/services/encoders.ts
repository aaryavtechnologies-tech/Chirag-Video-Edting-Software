import { runMediaTool } from './ffmpeg';
import type { ExportSettings } from '../../src/types/export';

export function softwareEncoder(format: ExportSettings['videoFormat']) {
  return format === 'vp9' ? 'libvpx-vp9' : format === 'hevc' ? 'libx265' : 'libx264';
}

export function hardwareCandidates(format: ExportSettings['videoFormat'], platform = process.platform) {
  if (format === 'vp9') return [];
  return (platform === 'darwin' ? ['videotoolbox'] : ['nvenc', 'qsv', 'amf'])
    .map((suffix) => `${format}_${suffix}`);
}

const cache = new Map<string, string>();
export async function selectEncoder(settings: ExportSettings, signal: AbortSignal) {
  const fallback = softwareEncoder(settings.videoFormat);
  const candidates = hardwareCandidates(settings.videoFormat);
  if (!settings.hardware || !candidates.length) return fallback;
  const { width, height, fps, videoFormat } = settings;
  const key = [width, height, fps, videoFormat].join(':');
  const known = cache.get(key);
  if (known) return known;
  const list = await runMediaTool('ffmpeg', ['-hide_banner', '-encoders'], undefined, signal);
  for (const codec of candidates) {
    if (!new RegExp(`\\b${codec}\\b`).test(list)) continue;
    try {
      await runMediaTool('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'lavfi', '-i',
        `color=black:s=${width}x${height}:r=${fps}:d=1`, '-frames:v', '1',
        '-an', '-c:v', codec, '-pix_fmt', 'yuv420p', '-f', 'null', '-',
      ], undefined, AbortSignal.any([signal, AbortSignal.timeout(8000)]));
      cache.set(key, codec);
      return codec;
    } catch {
      signal.throwIfAborted();
    }
  }
  cache.set(key, fallback);
  return fallback;
}
