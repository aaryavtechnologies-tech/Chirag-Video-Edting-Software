import { z } from 'zod';

export const exportSettingsSchema = z.object({
  mode: z.enum(['video', 'audio', 'both']),
  videoFormat: z.enum(['h264', 'hevc', 'vp9']),
  audioFormat: z.enum(['mp3', 'wav', 'm4a']),
  width: z.number().int().min(16).max(3840).refine((size) => size % 2 === 0),
  height: z.number().int().min(16).max(3840).refine((size) => size % 2 === 0),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]),
  bitrate: z.number().finite().min(0.1).max(500),
  audioBitrate: z.union([z.literal(192), z.literal(320)]),
  volume: z.number().min(0).max(1),
  hardware: z.boolean(),
  range: z.object({ start: z.number().finite().min(0), end: z.number().finite().positive() }).optional(),
  openFolder: z.boolean(),
  burnCaptions: z.boolean().optional(),
});

export type ExportSettings = z.infer<typeof exportSettingsSchema>;
export type TextPng = { id: string; png: string };
export type TextFrameBatch = {
  id: string; fps: number; startFrame: number; x: number; y: number;
  frames: { index: number; png?: string; repeat?: number }[];
};
export type ExportProgress = {
  percent: number; elapsed: number; eta?: number; verifying?: boolean; encoder?: string; fallback?: boolean;
};
export type ExportResult = { files: string[]; encoder?: string; cancelled?: boolean };

export function videoExtension(format: ExportSettings['videoFormat']) {
  return format === 'vp9' ? 'webm' : 'mp4';
}
