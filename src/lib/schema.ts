import { z } from 'zod';
import { entrances, exits } from './textMotion';
import { animationSetSchema } from '../animation/schema';
import { captionSchemas, captionWordSchema, wordEffectSchema } from '../captions/schema';

// Draft-07 permits additional properties wherever the schema does not forbid them.
const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();
const str = z.string().optional();
const num = z.number().finite().optional();
const int = z.number().int().optional();
const bool = z.boolean().optional();
const path = z.string().nullable().optional();

export const frameRates = [24, 25, 30, 50, 60] as const;
const fps = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]);
export const projectSettingsSchema = object({
  width: z.number().int().min(16), height: z.number().int().min(16), fps,
  background: str, sampleRate: int,
});

export const assetSchema = object({
  id: z.string(), type: z.enum(['video', 'image', 'audio']), path: z.string(),
  duration: num, width: int, height: int, fps: num, hasAudio: bool,
  proxyPath: path, thumbPath: path, waveformPath: path,
});

export const transformSchema = object({
  x: num, y: num, scale: num, rotation: num, opacity: z.number().min(0).max(1).optional(),
});

const textFill = object({
  type: z.enum(['solid', 'gradient']).optional(), color: str, opacity: z.number().min(0).max(1).optional(),
  gradient: object({
    from: str, to: str, angle: num, kind: z.enum(['linear', 'radial']).optional(),
    stops: z.array(object({ color: z.string(), offset: z.number().min(0).max(1) })).min(2).max(4).optional(),
  }).optional(),
});
const textStroke = object({ color: str, width: num, alignment: z.enum(['outside', 'center', 'inside']).optional() });
const textShadow = object({ color: str, blur: num, offsetX: num, offsetY: num, opacity: num });

export const textStyleSchema = object({
  fontFamily: str, fontSize: num, bold: bool, italic: bool, underline: bool,
  uppercase: bool, align: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: num, letterSpacing: num, wordSpacing: num,
  boxWidth: num, boxHeight: num, verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  direction: z.enum(['auto', 'ltr', 'rtl']).optional(), curve: num, outlineOffset: num,
  fill: textFill.optional(), fills: z.array(textFill).max(3).optional(),
  stroke: textStroke.optional(), strokes: z.array(textStroke).max(3).optional(),
  shadow: textShadow.optional(), shadows: z.array(textShadow).max(4).optional(),
  extrude: object({ color: str, depth: num, angle: num }).optional(),
  wordStyles: z.array(object({ index: z.number().int().nonnegative(), color: z.string() })).optional(),
  presetName: str,
  glow: object({ color: str, blur: num }).optional(),
  background: object({ color: str, opacity: num, padding: num, radius: num }).optional(),
  animationIn: z.enum(entrances).optional(),
  animationOut: z.enum(exits).optional(),
  animationDuration: num,
});
export const { template: captionTemplateSchema, segment: captionSegmentSchema, track: captionTrackSchema } = captionSchemas(textStyleSchema);

export const clipSchema = object({
  id: z.string(), type: z.enum(['video', 'image', 'text', 'audio']), assetId: str,
  start: z.number().finite().min(0), duration: z.number().finite().positive(),
  sourceIn: num, sourceOut: num, speed: z.number().min(0.25).max(4).optional(),
  volume: z.number().min(0).max(2).optional(), muted: bool, fadeIn: num, fadeOut: num,
  transform: transformSchema.optional(), fit: z.enum(['contain', 'cover']).optional(),
  text: str, style: textStyleSchema.optional(), animation: animationSetSchema.optional(), linkedClipId: path,
  caption: object({ words: z.array(captionWordSchema), wordEffect: wordEffectSchema.optional() }).optional(),
});

export const trackSchema = object({
  id: z.string(), kind: z.enum(['video', 'audio']), name: z.string(),
  order: int, hidden: bool, locked: bool, muted: bool, solo: bool, volume: num,
  clips: z.array(clipSchema),
});

export const projectSchema = object({
  version: z.literal(1), id: z.string(), name: z.string(), createdAt: str, updatedAt: str,
  settings: projectSettingsSchema, assets: z.array(assetSchema), tracks: z.array(trackSchema),
  markers: z.array(object({ time: z.number().finite(), label: str })).optional(),
  textPresets: z.array(textStyleSchema).optional(),
  captionTracks: z.array(captionTrackSchema).optional(),
  captionTemplates: z.array(captionTemplateSchema).optional(),
});
