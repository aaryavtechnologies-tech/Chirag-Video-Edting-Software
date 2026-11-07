import type { ExportSettings } from '../types/export';

export const exportSizes = { '480p': 854, '720p': 1280, '1080p': 1920, '1440p': 2560, '2K': 2048, '4K': 3840 };

export function suggestedBitrate(width: number, height: number, fps: number) {
  if (width * height >= 8_000_000) return fps >= 50 ? 60 : 35;
  return Math.max(2, Math.round(10 * (width * height / (1920 * 1080)) ** 0.7 * Math.sqrt(fps / 30)));
}

export const qualityFactors = { low: 0.5, medium: 0.75, high: 1, max: 1.5, customBitrate: 1 } as const;
export const exportPresets = {
  youtube1080: { mode: 'video', width: 1920, height: 1080, fps: 30, bitrate: 10, videoFormat: 'h264' },
  youtube4k: { mode: 'video', width: 3840, height: 2160, fps: 60, bitrate: 60, videoFormat: 'h264' },
  reel: { mode: 'video', width: 1080, height: 1920, fps: 30, bitrate: 10, videoFormat: 'h264' },
  mp3Preset: { mode: 'audio', audioFormat: 'mp3', audioBitrate: 320 },
} satisfies Record<string, Partial<ExportSettings>>;

export function estimateExportBytes(settings: ExportSettings, duration: number) {
  const audioMbps = settings.audioFormat === 'wav' ? 1.536 : settings.audioBitrate / 1000;
  const video = settings.mode === 'audio' ? 0 : settings.bitrate + 0.192;
  const audio = settings.mode === 'video' ? 0 : audioMbps;
  return Math.ceil(duration * (video + audio) * 1_000_000 / 8 * 1.03);
}
