import { expect, it } from 'vitest';
import { resolveLayout, layoutPreferencesSchema } from '../../src/layouts/settings';

it('selects a layout by ratio and respects a manual override', () => {
  expect(resolveLayout('auto', 1920, 1080)).toBe('landscape');
  expect(resolveLayout('auto', 1080, 1920)).toBe('portrait');
  expect(resolveLayout('auto', 1080, 1080)).toBe('portrait');
  expect(resolveLayout('landscape', 1080, 1920)).toBe('landscape');
});

it('validates and retains different panel widths per layout', () => {
  const preferences = { mode: 'auto', panels: {
    landscape: { media: 270, inspector: 260 }, portrait: { media: 210, inspector: 315 },
  } };
  expect(layoutPreferencesSchema.parse(preferences)).toEqual(preferences);
});
