import type { AnimationPhase } from './schema';

export const presets = {
  in: ['fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'zoomIn', 'zoomOut', 'pop', 'bounce',
    'elastic', 'typewriter', 'wipe', 'maskOpen', 'blurIn', 'riseFade', 'drop', 'flipX', 'flipY', 'rotateIn',
    'spinPop', 'glitch', 'shakeIn', 'letterSpread', 'karaokeSweep', 'neonOn', 'swing', 'scaleLine'],
  out: ['fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'zoomOut', 'zoomIn', 'blurOut',
    'wipe', 'dropAway', 'flip', 'rotateOut', 'shrinkPoint', 'glitchOut', 'typewriterErase', 'dissolve',
    'neonOff', 'shrinkOut'],
  loop: ['pulse', 'float', 'wiggle', 'shake', 'swing', 'breathe', 'glowPulse', 'colorCycle', 'flicker', 'rainbowSweep'],
} satisfies Record<AnimationPhase, string[]>;

export function defaultGranularity(preset: string) {
  return ['typewriter', 'typewriterErase', 'dissolve'].includes(preset) ? 'char' : 'whole';
}
