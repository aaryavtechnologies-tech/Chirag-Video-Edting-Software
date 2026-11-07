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
  arctic: { fontFamily: 'Montserrat', fontSize: 88, bold: true, fill: { type: 'gradient',
    gradient: { from: '#f0fcff', to: '#50aaff', angle: 105 } }, stroke: { color: '#14356d', width: 3 } },
  goldFoil: { fontFamily: 'Playfair Display', fontSize: 88, italic: true, fill: { type: 'gradient',
    gradient: { from: '#fff0b3', to: '#bd7717', angle: 115 } }, shadow: { blur: 14, opacity: 0.85 } },
  neonMint: { fontFamily: 'Oswald', fontSize: 86, uppercase: true, letterSpacing: 4,
    fill: { color: '#bcffea' }, stroke: { color: '#075b4c', width: 2 }, glow: { color: '#34f9bd', blur: 21 } },
  filmCredits: { fontFamily: 'Roboto Mono', fontSize: 48, uppercase: true, letterSpacing: 6,
    fill: { color: '#eee5d2' }, shadow: { color: '#050507', blur: 5, opacity: 0.9 } },
  comic: { fontFamily: 'Bebas Neue', fontSize: 102, fill: { color: '#ffe451' },
    stroke: { color: '#171022', width: 7 }, shadow: { color: '#e94784', blur: 0, offsetX: 8, offsetY: 8, opacity: 1 } },
  newsBanner: { fontFamily: 'Roboto', fontSize: 52, bold: true, uppercase: true,
    background: { color: '#c02539', opacity: 1, padding: 17, radius: 2 } },
  lavender: { fontFamily: 'Pacifico', fontSize: 78, fill: { color: '#ead5ff' },
    stroke: { color: '#442365', width: 3 }, glow: { color: '#ab64e9', blur: 14 } },
  forestBadge: { fontFamily: 'Poppins', fontSize: 56, letterSpacing: 2, fill: { color: '#eeffd0' },
    background: { color: '#143b2b', opacity: 0.95, padding: 22, radius: 35 } },
  retroWave: { fontFamily: 'Bebas Neue', fontSize: 96, fill: { type: 'gradient',
    gradient: { from: '#ff71c8', to: '#59f6ff', angle: 90 } }, stroke: { color: '#311252', width: 4 },
    shadow: { color: '#18052c', blur: 0, offsetX: 5, offsetY: 8, opacity: 1 } },
  paperNote: { fontFamily: 'Lobster', fontSize: 62, fill: { color: '#46342c' },
    background: { color: '#ffeac2', opacity: 1, padding: 20, radius: 5 } },
  blueprint: { fontFamily: 'Roboto Mono', fontSize: 52, letterSpacing: 3, fill: { color: '#c4efff' },
    background: { color: '#123777', opacity: 0.95, padding: 15, radius: 6 } },
  ember: { fontFamily: 'Oswald', fontSize: 94, bold: true, fill: { type: 'gradient',
    gradient: { from: '#fff3ae', to: '#f24916', angle: 90 } }, glow: { color: '#ff421e', blur: 19 } },
};

export const textKinds = {
  title: { style: builtInStyles.headline, y: 0.5 },
  subtitle: { style: { ...builtInStyles.clean, fontSize: 52 }, y: 0.7 },
  caption: { style: builtInStyles.caption, y: 0.85 },
  lowerThird: { style: builtInStyles.lower, y: 0.8 },
} satisfies Record<string, { style: TextStyle; y: number }>;
