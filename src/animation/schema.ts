import { z } from 'zod';

export const easingNames = [
  'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeInQuart', 'easeOutQuart', 'easeInOutQuart', 'easeInExpo', 'easeOutExpo', 'easeInOutExpo',
  'easeOutBack', 'easeOutElastic', 'easeOutBounce',
] as const;
export const granularityValues = ['whole', 'line', 'word', 'char'] as const;
export const staggerOrders = ['forward', 'backward', 'center', 'random'] as const;
export const directions = ['up', 'down', 'left', 'right'] as const;

const finite = z.number().finite();
export const easingSchema = z.union([z.enum(easingNames), z.tuple([finite, finite, finite, finite])]);
export const animationSlotSchema = z.object({
  preset: z.string(), duration: finite.min(0.1).max(3).optional(), delay: finite.optional(),
  easing: easingSchema.optional(), granularity: z.enum(granularityValues).optional(),
  stagger: finite.min(0).max(0.3).optional(), staggerOrder: z.enum(staggerOrders).optional(),
  seed: finite.int().optional(), direction: z.enum(directions).optional(), intensity: finite.min(0).max(2).optional(),
}).passthrough();
export const animationSetSchema = z.object({
  in: animationSlotSchema.optional(), out: animationSlotSchema.optional(), loop: animationSlotSchema.optional(),
}).passthrough();

export type Easing = z.infer<typeof easingSchema>;
export type AnimationSlot = z.infer<typeof animationSlotSchema>;
export type AnimationSet = z.infer<typeof animationSetSchema>;
export type AnimationPhase = 'in' | 'out' | 'loop';
export type Granularity = typeof granularityValues[number];
