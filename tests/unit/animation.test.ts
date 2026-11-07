import { expect, it } from 'vitest';
import { ease } from '../../src/animation/easing';
import { animationWindows, evaluateAnimation, staggerRanks } from '../../src/animation/evaluate';
import { easingNames, type AnimationSet } from '../../src/animation/schema';

const canvas = { width: 1920, height: 1080 };

it('keeps easing endpoints exact including custom curves and overshoot easings', () => {
  for (const name of easingNames) {
    expect(ease(name, 0)).toBe(0);
    expect(ease(name, 1)).toBe(1);
  }
  expect(ease([0.25, 0.25, 0.75, 0.75], 0.33)).toBeCloseTo(0.33);
  expect(ease('easeOutBack', 0.65)).toBeGreaterThan(1);
});

it('ranks staggered units in stable orders and compresses overlapping animation windows', () => {
  expect(staggerRanks(5, 'center')).toEqual([3, 1, 0, 2, 4]);
  expect(staggerRanks(3, 'backward')).toEqual([2, 1, 0]);
  expect(staggerRanks(12, 'random', 41)).toEqual(staggerRanks(12, 'random', 41));
  expect(staggerRanks(12, 'random', 41)).not.toEqual(staggerRanks(12, 'random', 42));
  const animation: AnimationSet = { in: { preset: 'fade', duration: 2 }, out: { preset: 'fade', duration: 1 } };
  const { inEnd, outStart } = animationWindows({ duration: 1.5, animation });
  expect(inEnd).toBe(1);
  expect(outStart).toBe(1);
});

it('repeats a seeded render state at the same timestamp after scrubbing', () => {
  const animation: AnimationSet = { in: { preset: 'glitch', duration: 1, granularity: 'char', staggerOrder: 'random', seed: 41 },
    loop: { preset: 'float' } };
  const clip = { text: 'किकीकु', duration: 3, animation };
  const frame = evaluateAnimation(clip, 0.45, canvas);
  expect(frame.perUnitStates).toHaveLength(3);
  expect(frame.perUnitStates[0]).not.toEqual(frame.perUnitStates[1]);
  expect(evaluateAnimation(clip, 1.25, canvas).translateY).not.toBe(0);
  expect(evaluateAnimation(clip, 0.45, canvas)).toEqual(frame);
});
