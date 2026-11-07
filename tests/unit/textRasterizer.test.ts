import { expect, it } from 'vitest';
import { animateText, prepareText } from '../../src/export/textRasterizer';
import { defaultTransform } from '../../src/preview/compositor';

it('normalizes multiline text, font, spacing and effect dimensions at the requested scale', () => {
  expect(prepareText('Line one\r\nLine two', {
    fontFamily: 'Inter', fontSize: 80, bold: true, italic: true, uppercase: true,
    lineHeight: 1.5, letterSpacing: 4, stroke: { width: 6 },
    shadow: { blur: 12, offsetX: -4, opacity: 2 },
  }, 0.5)).toMatchObject({
    lines: ['LINE ONE', 'LINE TWO'], font: 'italic 700 40px "Inter", sans-serif',
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
