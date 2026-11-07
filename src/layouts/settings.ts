import { z } from 'zod';

export const layoutModeSchema = z.enum(['auto', 'landscape', 'portrait']);
export type LayoutMode = z.infer<typeof layoutModeSchema>;
export type ResolvedLayout = Exclude<LayoutMode, 'auto'>;
const panelWidth = z.number().int().min(160).max(420);
const panelSizes = z.object({ media: panelWidth, inspector: panelWidth });

export const layoutPreferencesSchema = z.object({
  mode: layoutModeSchema,
  panels: z.object({ landscape: panelSizes.optional(), portrait: panelSizes.optional() }).optional(),
});

export type LayoutPreferences = z.infer<typeof layoutPreferencesSchema>;
export const defaultPanels = {
  landscape: { media: 272, inspector: 255 },
  portrait: { media: 226, inspector: 305 },
} satisfies Record<ResolvedLayout, z.infer<typeof panelSizes>>;

export function resolveLayout(mode: LayoutMode, width: number, height: number): ResolvedLayout {
  return mode === 'auto' ? width <= height ? 'portrait' : 'landscape' : mode;
}
