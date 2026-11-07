import type { TextStyle } from '../types/project';

export const bundledFonts = [
  'Inter', 'Poppins', 'Montserrat', 'Roboto', 'Oswald', 'Bebas Neue',
  'Playfair Display', 'Lobster', 'Pacifico', 'Roboto Mono',
];

export const builtInStyles: Record<string, TextStyle> = {
  clean: { fontSize: 64, fontFamily: 'Inter' },
  headline: { fontSize: 96, bold: true, fontFamily: 'Montserrat' },
  lower: { fontSize: 46, fontFamily: 'Poppins', background: { color: '#151628', padding: 16 } },
  caption: { fontSize: 45, bold: true, stroke: { color: '#101010', width: 3 } },
  classic: { fontSize: 76, italic: true, fontFamily: 'Playfair Display' },
  glow: { fontSize: 78, fontFamily: 'Oswald', glow: { color: '#9972ff', blur: 24 } },
  sunset: { fontSize: 90, fontFamily: 'Bebas Neue', fill: { type: 'gradient', gradient: {
    from: '#ffd17c', to: '#ff427a', angle: 90,
  } } },
  bubble: { fontSize: 80, fontFamily: 'Lobster', fill: { type: 'solid', color: '#ffc2df' },
    stroke: { color: '#762962', width: 5 } },
  terminal: { fontSize: 55, fontFamily: 'Roboto Mono', fill: { type: 'solid', color: '#91fbb7' } },
  signature: { fontSize: 76, fontFamily: 'Pacifico', shadow: { color: '#000000', blur: 10 } },
  impact: { fontSize: 100, bold: true, uppercase: true, fontFamily: 'Roboto',
    animationIn: 'pop', animationOut: 'fade' },
};

export const textKinds = {
  title: { style: builtInStyles.headline, y: 0.5 },
  subtitle: { style: { ...builtInStyles.clean, fontSize: 52 }, y: 0.7 },
  caption: { style: builtInStyles.caption, y: 0.85 },
  lowerThird: { style: builtInStyles.lower, y: 0.8 },
} satisfies Record<string, { style: TextStyle; y: number }>;
