import { z } from 'zod';
import type { Clip } from '../types/project';

export const shapeKinds = ['rectangle', 'circle', 'line', 'arrow'] as const;
export const shapeSchema = z.object({
  kind: z.enum(shapeKinds), width: z.number().min(1).max(4096), height: z.number().min(1).max(4096),
  fill: z.string(), stroke: z.string(), strokeWidth: z.number().min(0).max(100),
});
const number = (min: number, max: number) => z.number().min(min).max(max).optional();
export const visualSchema = z.object({
  brightness: number(-1, 1), contrast: number(0, 2), saturation: number(0, 3), temperature: number(-1, 1),
  vignette: number(0, 1), blur: number(0, 40), flipX: z.boolean().optional(), flipY: z.boolean().optional(),
  crop: z.object({ x: number(0, 0.95), y: number(0, 0.95), width: number(0.05, 1), height: number(0.05, 1) }).optional(),
  motion: z.enum(['none', 'slide', 'zoom', 'spin', 'wipe']).optional(),
});

export function cropRect(clip: Clip) {
  const { x = 0, y = 0, width = 1, height = 1 } = clip.visual?.crop ?? {};
  return { x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) };
}

export function visualProgress(clip: Clip, time: number) {
  return Math.min(1, Math.max(0, (time - clip.start) / Math.min(0.5, clip.duration)));
}
