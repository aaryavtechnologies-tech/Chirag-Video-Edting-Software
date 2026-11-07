import type { z } from 'zod';
import type { assetSchema, clipSchema, projectSchema, projectSettingsSchema, textStyleSchema, trackSchema } from '../lib/schema';

export type Project = z.infer<typeof projectSchema>;
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Track = z.infer<typeof trackSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
