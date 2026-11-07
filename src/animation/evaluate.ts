import { clamp01, ease } from './easing';
import { defaultGranularity } from './presets';
import type { AnimationPhase, AnimationSet, AnimationSlot, Granularity } from './schema';

type Size = { width: number; height: number };
type Reveal = { direction: 'left' | 'right' | 'up' | 'down' | 'center'; amount: number };
export type MotionState = {
  opacity: number; translateX: number; translateY: number; scaleX: number; scaleY: number;
  rotation: number; blur: number; letterSpacingDelta: number; clipReveal?: Reveal;
  hue: number; glow: number;
};
export type RenderState = MotionState & { granularity: Granularity; perUnitStates: MotionState[] };
type Animatable = { duration: number; text?: string; animation?: AnimationSet };

export const neutral: MotionState = {
  opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, blur: 0,
  letterSpacingDelta: 0, hue: 0, glow: 0,
};

function random(seed: number) {
  let bits = seed | 0;
  return () => {
    bits = (Math.imul(1664525, bits) + 1013904223) | 0;
    return (bits >>> 0) / 4294967296;
  };
}

export function staggerRanks(count: number, order: AnimationSlot['staggerOrder'], seed = 1) {
  const indices = Array.from({ length: count }, (_, index) => index);
  if (order === 'backward') indices.reverse();
  if (order === 'center') indices.sort((a, b) => Math.abs(a - (count - 1) / 2) - Math.abs(b - (count - 1) / 2));
  if (order === 'random') {
    const next = random(seed);
    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
  }
  const ranks: number[] = [];
  indices.forEach((index, rank) => { ranks[index] = rank; });
  return ranks;
}

const chars = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function textUnits(text: string, granularity: Granularity) {
  if (granularity === 'line') return text.split(/\r?\n/);
  if (granularity === 'word') return text.match(/\S+/gu) ?? [];
  if (granularity === 'char') return [...chars.segment(text)].map(({ segment }) => segment).filter((unit) => !/^\s+$/u.test(unit));
  return [text];
}

const cache = new Map<string, number>();
function unitCount(text: string, granularity: Granularity) {
  if (granularity === 'whole') return 1;
  const key = granularity + ':' + text;
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const count = textUnits(text, granularity).length;
  if (cache.size >= 96) cache.delete(cache.keys().next().value!);
  cache.set(key, count);
  return count;
}

function envelope(slot: AnimationSlot | undefined, text: string) {
  if (!slot || slot.preset === 'none') return undefined;
  const granularity = slot.granularity ?? defaultGranularity(slot.preset);
  const count = unitCount(text, granularity);
  const duration = slot.duration ?? 0.5;
  const delay = Math.max(0, slot.delay ?? 0);
  const stagger = slot.stagger ?? 0.04;
  return { slot, granularity, count, duration, delay, stagger,
    total: duration + delay + Math.max(0, count - 1) * stagger };
}

export function animationWindows(clip: Animatable) {
  const enter = envelope(clip.animation?.in, clip.text ?? '');
  const exit = envelope(clip.animation?.out, clip.text ?? '');
  const requested = (enter?.total ?? 0) + (exit?.total ?? 0);
  const factor = requested > clip.duration ? clip.duration / requested : 1;
  return { enter, exit, factor, inEnd: (enter?.total ?? 0) * factor,
    outStart: clip.duration - (exit?.total ?? 0) * factor };
}

function effect(slot: AnimationSlot, phase: AnimationPhase, progress: number, time: number, canvas: Size): MotionState {
  const id = slot.preset;
  const amount = slot.intensity ?? 1;
  const sine = Math.sin(progress * Math.PI * 2);
  const noise = random((slot.seed ?? 1) + Math.floor(time * 24))() * 2 - 1;
  const presetEase = id === 'pop' || id === 'spinPop' ? 'easeOutBack' : id === 'bounce' ? 'easeOutBounce' :
    id === 'elastic' ? 'easeOutElastic' : 'linear';
  const p = ease(slot.easing ?? presetEase, progress);
  const rest = (phase === 'out' ? p : 1 - p) * amount;
  const alpha = clamp01(phase === 'out' ? 1 - p : p);
  const unit = Math.min(canvas.width, canvas.height);
  const state = { ...neutral };
  const scale = (value: number) => { state.scaleX = value; state.scaleY = value; };
  if (phase === 'loop') {
    switch (id) {
      case 'pulse': scale(1 + 0.09 * sine * amount); break;
      case 'float': state.translateY = unit * 0.025 * sine * amount; break;
      case 'wiggle': state.rotation = sine * 8 * amount; break;
      case 'shake': state.translateX = unit * 0.018 * noise * amount; break;
      case 'swing': state.rotation = sine * 16 * amount; state.translateX = unit * 0.018 * sine * amount; break;
      case 'breathe': scale(1 + 0.05 * sine * amount); state.opacity = 1 - 0.2 * (0.5 - 0.5 * sine) * amount; break;
      case 'glowPulse': state.glow = unit * 0.018 * (0.5 + 0.5 * sine) * amount; break;
      case 'colorCycle': state.hue = progress * 360 * amount; break;
      case 'flicker': state.opacity = 1 - 0.35 * Math.abs(noise) * amount; break;
      case 'rainbowSweep': state.hue = 180 + 180 * sine * amount; state.glow = unit * 0.012 * (0.5 + 0.5 * sine); break;
    }
    return state;
  }
  const sign = phase === 'out' ? 1 : -1;
  switch (id) {
    case 'slideUp': state.translateY = -sign * unit * 0.16 * rest; break;
    case 'slideDown': state.translateY = sign * unit * 0.16 * rest; break;
    case 'slideLeft': state.translateX = -sign * unit * 0.2 * rest; break;
    case 'slideRight': state.translateX = sign * unit * 0.2 * rest; break;
    case 'fade': state.opacity = alpha; break;
    case 'zoomIn': case 'shrinkOut': scale(Math.max(0.01, 1 - 0.65 * rest)); state.opacity = alpha; break;
    case 'zoomOut': scale(1 + 0.65 * rest); state.opacity = alpha; break;
    case 'pop': case 'bounce': case 'elastic': scale(Math.max(0.01, 1 - 0.6 * rest)); break;
    case 'typewriter': case 'typewriterErase': state.opacity = phase === 'out' ? Number(progress < 0.8) : Number(progress >= 0.15); break;
    case 'wipe': case 'maskOpen': case 'karaokeSweep':
      state.clipReveal = { direction: id === 'maskOpen' ? 'center' : slot.direction ?? 'right', amount: alpha }; break;
    case 'blurIn': case 'blurOut': state.blur = Math.max(0, unit * 0.022 * rest); state.opacity = alpha; break;
    case 'riseFade': state.translateY = unit * 0.08 * rest; state.opacity = alpha; break;
    case 'drop': state.translateY = -unit * 0.24 * rest; break;
    case 'dropAway': state.translateY = unit * 0.24 * rest; state.opacity = alpha; break;
    case 'flipX': state.scaleY = Math.cos(rest * Math.PI / 2); break;
    case 'flipY': case 'flip': state.scaleX = Math.cos(rest * Math.PI / 2); break;
    case 'rotateIn': case 'rotateOut': state.rotation = sign * 80 * rest; state.opacity = alpha; break;
    case 'spinPop': state.rotation = -220 * rest; scale(Math.max(0.01, 1 - 0.7 * rest)); break;
    case 'shrinkPoint': scale(Math.max(0.001, 1 - rest)); state.opacity = alpha; break;
    case 'glitch': case 'glitchOut': state.translateX = noise * unit * 0.07 * rest; state.hue = noise * 160 * rest; state.opacity = alpha; break;
    case 'shakeIn': state.translateX = noise * unit * 0.035 * rest; state.opacity = alpha; break;
    case 'letterSpread': state.letterSpacingDelta = unit * 0.045 * rest; break;
    case 'dissolve': state.opacity = alpha; break;
    case 'neonOn': case 'neonOff': state.opacity = alpha * (1 - 0.65 * Math.abs(noise) * clamp01(rest)); state.glow = unit * 0.02 * alpha; break;
    case 'swing': state.rotation = 35 * rest; state.translateX = unit * 0.08 * rest; break;
    case 'scaleLine': state.scaleY = Math.max(0.001, 1 - rest); break;
  }
  return state;
}

export function evaluateAnimation(clip: Animatable, localTime: number, canvas: Size): RenderState {
  const { enter, exit, factor, inEnd, outStart } = animationWindows(clip);
  const time = Math.max(0, Math.min(localTime, clip.duration));
  const phase = time < inEnd ? 'in' : time >= outStart && exit ? 'out' : 'loop';
  if (phase === 'loop') {
    const loop = clip.animation?.loop;
    const start = inEnd + Math.max(0, loop?.delay ?? 0);
    return { ...(loop && time >= start ? effect(loop, phase, ((time - start) / (loop.duration ?? 0.5)) % 1, time, canvas) : neutral),
      granularity: 'whole', perUnitStates: [] };
  }
  const window = phase === 'in' ? enter : exit;
  if (!window) return { ...neutral, granularity: 'whole', perUnitStates: [] };
  const elapsed = time - (phase === 'in' ? 0 : outStart);
  const duration = Math.max(Number.EPSILON, window.duration * factor);
  const frame = (rank: number) => effect(window.slot, phase,
    clamp01((elapsed - (window.delay + rank * window.stagger) * factor) / duration), time, canvas);
  if (window.granularity === 'whole') return { ...frame(0), granularity: 'whole', perUnitStates: [] };
  return { ...neutral, granularity: window.granularity,
    perUnitStates: staggerRanks(window.count, window.slot.staggerOrder, window.slot.seed).map(frame) };
}
