import type { Easing } from './schema';

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function bezier(t: number, first: number, second: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t ** 3;
}

function bounce(t: number) {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t - 1.5 / d) ** 2 + 0.75;
  if (t < 2.5 / d) return n * (t - 2.25 / d) ** 2 + 0.9375;
  return n * (t - 2.625 / d) ** 2 + 0.984375;
}

export function ease(easing: Easing = 'linear', value: number) {
  const t = clamp01(value);
  if (t === 0 || t === 1 || easing === 'linear') return t;
  if (typeof easing !== 'string') {
    let lo = 0;
    let hi = 1;
    for (let step = 0; step < 20; step += 1) {
      const at = (lo + hi) / 2;
      if (bezier(at, clamp01(easing[0]), clamp01(easing[2])) < t) lo = at;
      else hi = at;
    }
    return bezier((lo + hi) / 2, easing[1], easing[3]);
  }
  if (easing === 'easeOutBack') return 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  if (easing === 'easeOutElastic') return 1 + 2 ** (-10 * t) * Math.sin((10 * t - 0.75) * 2 * Math.PI / 3);
  if (easing === 'easeOutBounce') return bounce(t);
  const power = easing.endsWith('Quad') ? 2 : easing.endsWith('Cubic') ? 3 : 4;
  const entry = (x: number) => x <= 0 ? 0 : easing.endsWith('Expo') ? 2 ** (10 * x - 10) : x ** power;
  if (easing.startsWith('easeInOut')) return t < 0.5 ? entry(2 * t) / 2 : 1 - entry(2 * (1 - t)) / 2;
  return easing.startsWith('easeIn') ? entry(t) : 1 - entry(1 - t);
}
