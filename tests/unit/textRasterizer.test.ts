import { expect, it } from 'vitest';
import { prepareText } from '../../src/text/rasteriser';
import { animateText } from '../../src/lib/textMotion';
import { wrapText } from '../../src/text/wrap';
import { defaultTransform } from '../../src/preview/compositor';

it('wraps by measured width without breaking Devanagari graphemes', () => {
  const segmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' });
  const measure = (text: string) => [...segmenter.segment(text)].length;
  expect(wrapText(['one two', 'नमस्ते'], 3, measure)).toEqual(['one', 'two', 'नमस्ते']);
  expect(wrapText(['किकीकु'], 1, measure)).toEqual(['कि', 'की', 'कु']);
});

it('normalizes multiline text, font, spacing and effect dimensions at the requested scale', () => {
  expect(prepareText('Line one\r\nLine two', {
    fontFamily: 'Inter', fontSize: 80, bold: true, italic: true, uppercase: true,
    lineHeight: 1.5, letterSpacing: 4, stroke: { width: 6 },
    shadow: { blur: 12, offsetX: -4, opacity: 2 },
  }, 0.5)).toMatchObject({
    lines: ['LINE ONE', 'LINE TWO'], font: 'italic 700 40px "Inter", "Noto Sans Devanagari", "Noto Sans Gujarati", "Noto Sans Arabic", sans-serif',
    size: 40, line: 60, spacing: 2, stroke: { width: 3 },
    shadow: { blur: 6, x: -2, opacity: 1 },
  });
});

it('maps text animation to preview transform and opacity over the clip bounds', () => {
  const clip = { id: 'text', type: 'text' as const, start: 1, duration: 2,
    style: { animationIn: 'pop' as const, animationOut: 'fade' as const, animationDuration: 0.5 } };
  expect(animateText(clip, defaultTransform, 1).scale).toBe(0.75);
  expect(animateText(clip, defaultTransform, 1.5).scale).toBe(1);
  expect(animateText(clip, defaultTransform, 2.75).opacity).toBe(0.5);
});

it('slides from the left and shrinks toward the end of a short clip', () => {
  const clip = { id: 'text', type: 'text' as const, start: 1, duration: 0.5,
    style: { animationIn: 'slideRight' as const, animationOut: 'shrinkOut' as const, animationDuration: 3 } };
  expect(animateText(clip, defaultTransform, 1).x).toBeCloseTo(0.34);
  const middle = animateText(clip, defaultTransform, 1.25);
  expect(middle.x).toBeCloseTo(0.42);
  expect(middle.scale).toBeCloseTo(0.675);
  expect(middle.opacity).toBeCloseTo(0.5);
});
