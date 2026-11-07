import type { z } from 'zod';
import type { captionSegmentSchema, captionTemplateSchema, captionTrackSchema } from '../lib/schema';

export type CaptionSegment = z.infer<typeof captionSegmentSchema>;
export type CaptionTemplate = z.infer<typeof captionTemplateSchema>;
export type CaptionTrack = z.infer<typeof captionTrackSchema>;
