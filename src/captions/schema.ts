import { z } from 'zod';
import { animationSetSchema } from '../animation/schema';

const n = z.number().finite();
export const captionCategories = ['Basic', 'Viral', 'Karaoke', 'Cinematic', 'Minimal', 'Bold', 'Gaming', 'Podcast', 'News', 'Regional', 'Aesthetic', 'Custom'] as const;
export const wordEffects = ['none', 'highlightColor', 'scalePop', 'pillSlide', 'karaokeFill', 'underlineSweep', 'wordByWord', 'oneWordAtATime', 'bounceActive'] as const;
export const wordEffectSchema = z.object({
  type: z.enum(wordEffects).optional(), activeColor: z.string().optional(), inactiveOpacity: n.min(0).max(1).optional(),
  pillColor: z.string().optional(), pillRadius: n.optional(), scale: n.optional(),
}).passthrough();
export const placementSchema = z.object({
  anchor: z.enum(['top', 'middle', 'bottom', 'custom']).optional(), x: n.optional(), y: n.optional(),
  maxWidth: n.min(0.1).max(1).optional(), fontScale: n.optional(),
}).passthrough();
export const captionWordSchema = z.object({
  text: z.string(), start: n, end: n, estimated: z.boolean().optional(),
}).passthrough();
export type CaptionWord = z.infer<typeof captionWordSchema>;

export function captionSchemas<Style extends z.ZodTypeAny>(style: Style) {
  const template = z.object({
    id: z.string(), name: z.string(), category: z.enum(captionCategories).optional(),
    style, animation: animationSetSchema.optional(), wordEffect: wordEffectSchema.optional(),
    landscape: placementSchema.optional(), portrait: placementSchema.optional(),
    maxLines: n.int().min(1).max(4).optional(), maxCharsPerLine: n.int().min(5).optional(),
    uppercase: z.boolean().optional(), thumbnailText: z.string().optional(),
  }).passthrough();
  const segment = z.object({
    id: z.string(), start: n.min(0), duration: n.positive(), text: z.string(), speaker: z.string().optional(),
    words: z.array(captionWordSchema).optional(), overrides: z.object({
      style: style.optional(), animation: animationSetSchema.optional(), wordEffect: wordEffectSchema.optional(),
      placement: placementSchema.optional(),
    }).passthrough().optional(),
  }).passthrough();
  const track = z.object({
    id: z.string(), kind: z.literal('caption'), name: z.string().optional(), language: z.string().optional(),
    templateId: z.string(), templateSnapshot: template.optional(), hidden: z.boolean().optional(), locked: z.boolean().optional(),
    segments: z.array(segment),
  }).passthrough();
  return { template, segment, track };
}
