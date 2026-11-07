import data from '../../assets/text-presets/library.json';
import { z } from 'zod';
import { textStyleSchema } from './schema';
const library = z.record(textStyleSchema).parse(data);
import type { TextStyle } from '../types/project';

export const builtInStyles = library;

export const textKinds = {
  title: { style: builtInStyles.headline, y: 0.5 },
  subtitle: { style: { ...builtInStyles.clean, fontSize: 52 }, y: 0.7 },
  caption: { style: builtInStyles.caption, y: 0.85 },
  lowerThird: { style: builtInStyles.lower, y: 0.8 },
} satisfies Record<string, { style: TextStyle; y: number }>;
