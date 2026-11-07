import type { TextStyle } from '../types/project';
import { wrapText } from './wrap';
import type { Granularity } from '../animation/schema';

export type TextRegion = { x: number; y: number; width: number; height: number };
const layouts = new WeakMap<HTMLCanvasElement, Partial<Record<Granularity, TextRegion[]>>>();
export const rasterRegions = (canvas: HTMLCanvasElement, granularity: Granularity) => layouts.get(canvas)?.[granularity];

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value! : fallback));
}

export function prepareText(text: string, style: TextStyle = {}, scale = 1) {
  const size = bounded(style.fontSize, 64, 1, 1024) * scale;
  const family = (style.fontFamily || 'Inter').replace(/["\\\r\n]/g, '');
  const font = `${style.italic ? 'italic ' : ''}${style.bold ? '700' : '400'} ${size}px "${family}", "Noto Sans Devanagari", "Noto Sans Gujarati", "Noto Sans Arabic", sans-serif`;
  return {
    font, family, size, lines: (style.uppercase ? text.toUpperCase() : text).split(/\r?\n/),
    align: style.align ?? 'center', underline: !!style.underline,
    line: size * bounded(style.lineHeight, 1.2, 0.5, 4),
    spacing: bounded(style.letterSpacing, 0, -100, 100) * scale,
    fill: style.fill ?? { type: 'solid', color: '#ffffff' },
    stroke: style.stroke && { color: style.stroke.color, width: bounded(style.stroke.width, 3, 0, 100) * scale },
    shadow: style.shadow && {
      color: style.shadow.color, blur: bounded(style.shadow.blur, 8, 0, 100) * scale,
      x: bounded(style.shadow.offsetX, 2, -200, 200) * scale,
      y: bounded(style.shadow.offsetY, 4, -200, 200) * scale,
      opacity: bounded(style.shadow.opacity, 0.7, 0, 1),
    },
    glow: style.glow && { color: style.glow.color, blur: bounded(style.glow.blur, 12, 0, 100) * scale },
    box: style.background && {
      color: style.background.color, opacity: bounded(style.background.opacity, 0.8, 0, 1),
      padding: bounded(style.background.padding, 12, 0, 120) * scale,
      radius: bounded(style.background.radius, 8, 0, 120) * scale,
    },
  };
}

type TextInput = ReturnType<typeof prepareText>;

export async function loadTextFont(text: string, style: TextStyle | undefined) {
  const { font } = prepareText(text, style);
  await document.fonts.load(font, text || 'M').catch(() => undefined);
}

function color(value: string | undefined, fallback: string) {
  return value && CSS.supports('color', value) ? value : fallback;
}

function paintFill(ctx: CanvasRenderingContext2D, fill: TextInput['fill'], width: number, height: number) {
  if (fill.type !== 'gradient') return color(fill.color, '#ffffff');
  const angle = ((fill.gradient?.angle ?? 0) % 360) * Math.PI / 180;
  const x = Math.cos(angle), y = Math.sin(angle);
  const length = (Math.abs(width * x) + Math.abs(height * y)) / 2;
  const gradient = fill.gradient?.kind === 'radial'
    ? ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2)
    : ctx.createLinearGradient(width / 2 - x * length, height / 2 - y * length,
      width / 2 + x * length, height / 2 + y * length);
  const stops = fill.gradient?.stops ?? [
    { offset: 0, color: fill.gradient?.from ?? '#ffffff' },
    { offset: 1, color: fill.gradient?.to ?? '#8b7bff' },
  ];
  for (const stop of stops) gradient.addColorStop(stop.offset, color(stop.color, '#ffffff'));
  return gradient;
}

export function rasterizeText(text: string, style: TextStyle | undefined, scale: number) {
  const input = prepareText(text, style, scale);
  const { box, shadow, glow, stroke } = input;
  const fills = style?.fills?.length ? style.fills : [input.fill];
  const strokes = style?.strokes?.length ? style.strokes.map((layer) => ({
    ...layer, width: bounded(layer.width, 3, 0, 100) * scale,
  })) : stroke ? [{ ...stroke, alignment: 'center' as const }] : [];
  const shadows = style?.shadows?.length ? style.shadows.map((layer) => ({
    color: layer.color, blur: bounded(layer.blur, 8, 0, 100) * scale,
    x: bounded(layer.offsetX, 2, -200, 200) * scale, y: bounded(layer.offsetY, 4, -200, 200) * scale,
    opacity: bounded(layer.opacity, 0.7, 0, 1),
  })) : shadow ? [shadow] : [];
  const extrude = bounded(style?.extrude?.depth, 0, 0, 50) * scale;
  const outlineOffset = bounded(style?.outlineOffset, 0, 0, 50) * scale;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  function setup(context: CanvasRenderingContext2D) {
    context.font = input.font;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    context.direction = style?.direction === 'rtl' || (style?.direction !== 'ltr' && /^[\s\p{P}]*[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(text)) ? 'rtl' : 'ltr';
    context.letterSpacing = input.spacing + 'px';
    context.wordSpacing = bounded(style?.wordSpacing, 0, -40, 150) * scale + 'px';
    context.lineJoin = 'round';
  }
  setup(ctx);
  const boxWidth = bounded(style?.boxWidth, 0, 0, 7680) * scale;
  const lines = wrapText(input.lines, boxWidth, (line) => ctx.measureText(line).width);
  const metrics = lines.map((line) => ctx.measureText(line));
  const width = boxWidth || metrics.reduce((max, metric) => Math.max(max, metric.width), 1);
  const glyphs = ctx.measureText('Mg');
  const ascent = glyphs.fontBoundingBoxAscent || input.size;
  const descent = glyphs.fontBoundingBoxDescent || input.size * 0.2;
  const textHeight = Math.max(1, ascent + descent + (lines.length - 1) * input.line);
  const height = Math.max(textHeight, bounded(style?.boxHeight, 0, 0, 7680) * scale);
  const top = style?.verticalAlign === 'bottom' ? height - textHeight :
    style?.verticalAlign === 'middle' ? (height - textHeight) / 2 : 0;
  const edge = Math.ceil(Math.max(input.size * 0.18, extrude, outlineOffset + Math.max(0, ...strokes.map((layer) => layer.width)),
    ...shadows.map((layer) => layer.blur * 2 + Math.abs(layer.x) + Math.abs(layer.y)),
    (glow?.blur ?? 0) * 2));
  const padding = box?.padding ?? 0;
  canvas.width = Math.min(8192, Math.max(1, Math.ceil(width + (edge + padding) * 2)));
  canvas.height = Math.min(8192, Math.max(1, Math.ceil(height + (edge + padding) * 2)));
  setup(ctx);
  if (box) {
    ctx.fillStyle = color(box.color, '#000000');
    ctx.globalAlpha = box.opacity;
    ctx.beginPath();
    ctx.roundRect(edge, edge, width + padding * 2, height + padding * 2, box.radius);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const paints = fills.map((fill) => ({ fill, paint: paintFill(ctx, fill, canvas.width, canvas.height) }));
  const mask = strokes.some((layer) => outlineOffset || (layer.alignment && layer.alignment !== 'center'))
    ? document.createElement('canvas') : undefined;
  if (mask) { mask.width = canvas.width; mask.height = canvas.height; }
  const maskContext = mask?.getContext('2d');
  if (maskContext) setup(maskContext);
  const wordColors = new Map(style?.wordStyles?.map((entry) => [entry.index, entry.color]));
  let wordIndex = 0;
  const regions: Record<'line' | 'word' | 'char', TextRegion[]> = { line: [], word: [], char: [] };
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  lines.forEach((line, index) => {
    const measured = metrics[index].width;
    const offset = input.align === 'center' ? (width - measured) / 2 : input.align === 'right' ? width - measured : 0;
    const x = edge + padding + offset;
    const y = edge + padding + top + ascent + index * input.line;
    const firstY = index === 0 ? 0 : Math.max(0, y - ascent - input.line / 2 + ascent / 2);
    const lastY = index === lines.length - 1 ? canvas.height : Math.min(canvas.height, firstY + input.line);
    const region = (left: number, right: number) => ({
      x: left, y: firstY, width: Math.max(0, right - left), height: Math.max(1, lastY - firstY),
    });
    regions.line.push(region(0, canvas.width));
    function register(unit: string, start: number, end: number, output: TextRegion[]) {
      if (/^\s+$/u.test(unit)) return;
      const before = ctx.measureText(line.slice(0, start)).width;
      const after = ctx.measureText(line.slice(0, end)).width;
      const left = ctx.direction === 'rtl' ? x + measured - after : x + before;
      const right = ctx.direction === 'rtl' ? x + measured - before : x + after;
      output.push(region(Math.max(0, left), Math.min(canvas.width, right)));
    }
    for (const word of line.matchAll(/\S+/gu)) register(word[0], word.index, word.index + word[0].length, regions.word);
    for (const { segment, index: start } of segmenter.segment(line)) register(segment, start, start + segment.length, regions.char);
    // Draw each effect behind the glyph without painting its fill a second time.
    if (shadows.length || glow) {
      for (const effect of [glow && { ...glow, x: 0, y: 0, opacity: 1 }, ...shadows]) {
        if (!effect) continue;
        ctx.save();
        ctx.shadowColor = color(effect.color, '#000000');
        ctx.shadowBlur = effect.blur;
        const outside = canvas.width + 8192;
        ctx.shadowOffsetX = effect.x + outside;
        ctx.shadowOffsetY = effect.y;
        ctx.globalAlpha = effect.opacity;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, x - outside, y);
        ctx.restore();
      }
    }
    if (extrude) {
      const angle = (style?.extrude?.angle ?? 45) * Math.PI / 180;
      ctx.fillStyle = color(style?.extrude?.color, '#202030');
      for (let depth = extrude; depth > 0; depth -= 1) ctx.fillText(line, x + depth * Math.cos(angle), y + depth * Math.sin(angle));
    }
    function drawStroke(layer: typeof strokes[number]) {
      if (!(layer.width > 0)) return;
      const target = maskContext ?? ctx;
      if (maskContext) target.clearRect(0, 0, canvas.width, canvas.height);
      target.strokeStyle = color(layer.color, '#000000');
      target.lineWidth = 2 * (layer.width + outlineOffset);
      target.strokeText(line, x, y);
      if (mask && maskContext) {
        if (layer.alignment === 'inside') target.globalCompositeOperation = 'destination-in';
        else if (layer.alignment === 'outside' || outlineOffset) target.globalCompositeOperation = 'destination-out';
        if (target.globalCompositeOperation !== 'source-over') {
          target.fillText(line, x, y);
          if (outlineOffset && layer.alignment !== 'inside') {
            target.lineWidth = outlineOffset * 2;
            target.strokeText(line, x, y);
          }
          target.globalCompositeOperation = 'source-over';
        }
        ctx.drawImage(mask, 0, 0);
      }
    }
    strokes.filter((layer) => layer.alignment !== 'inside').forEach(drawStroke);
    for (const { fill, paint } of paints) {
      ctx.fillStyle = paint;
      ctx.globalAlpha = fill.opacity ?? 1;
      ctx.fillText(line, x, y);
      if (input.underline) ctx.fillRect(x, y + input.size * 0.08, measured, Math.max(1, input.size * 0.05));
    }
    ctx.globalAlpha = 1;
    if (wordColors.size) for (const word of line.matchAll(/\S+/gu)) {
      const tint = wordColors.get(wordIndex++);
      if (!tint) continue;
      const before = ctx.measureText(line.slice(0, word.index)).width;
      const advance = ctx.measureText(word[0]).width;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + (ctx.direction === 'rtl' ? measured - before - advance : before), y - ascent, advance, ascent + descent);
      ctx.clip();
      ctx.fillStyle = color(tint, '#ffffff');
      ctx.fillText(line, x, y);
      ctx.restore();
    }
    strokes.filter((layer) => layer.alignment === 'inside').forEach(drawStroke);
  });
  if (style?.curve) {
    const amplitude = bounded(style.curve, 0, -100, 100) * scale;
    const curved = document.createElement('canvas');
    curved.width = canvas.width;
    curved.height = Math.min(8192, canvas.height + Math.ceil(Math.abs(amplitude)));
    const target = curved.getContext('2d')!;
    const strip = Math.max(1, Math.round(scale * 2));
    for (let x = 0; x < canvas.width; x += strip) {
      const offset = amplitude * (2 * x / canvas.width - 1) ** 2;
      const width = Math.min(strip, canvas.width - x);
      target.drawImage(canvas, x, 0, width, canvas.height, x, Math.max(0, -amplitude) + offset, width, canvas.height);
    }
    layouts.set(curved, regions);
    return curved;
  }
  layouts.set(canvas, regions);
  return canvas;
}
