import type { TextStyle } from '../types/project';

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value! : fallback));
}

export function prepareText(text: string, style: TextStyle = {}, scale = 1) {
  const size = bounded(style.fontSize, 64, 1, 1024) * scale;
  const family = (style.fontFamily || 'Inter').replace(/["\\\r\n]/g, '');
  const font = `${style.italic ? 'italic ' : ''}${style.bold ? '700' : '400'} ${size}px "${family}", sans-serif`;
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
  const gradient = ctx.createLinearGradient(width / 2 - x * length, height / 2 - y * length,
    width / 2 + x * length, height / 2 + y * length);
  gradient.addColorStop(0, color(fill.gradient?.from, '#ffffff'));
  gradient.addColorStop(1, color(fill.gradient?.to, '#8b7bff'));
  return gradient;
}

export function rasterizeText(text: string, style: TextStyle | undefined, scale: number) {
  const input = prepareText(text, style, scale);
  const { box, shadow, glow, stroke } = input;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  function setup() {
    ctx.font = input.font;
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = input.spacing + 'px';
    ctx.lineJoin = 'round';
  }
  setup();
  const metrics = input.lines.map((line) => ctx.measureText(line));
  const width = Math.max(1, ...metrics.map((metric) => metric.width));
  const glyphs = ctx.measureText('Mg');
  const ascent = glyphs.fontBoundingBoxAscent || input.size;
  const descent = glyphs.fontBoundingBoxDescent || input.size * 0.2;
  const height = Math.max(1, ascent + descent + (input.lines.length - 1) * input.line);
  const edge = Math.ceil(Math.max(input.size * 0.18, stroke?.width ?? 0,
    (shadow?.blur ?? 0) * 2 + Math.abs(shadow?.x ?? 0) + Math.abs(shadow?.y ?? 0),
    (glow?.blur ?? 0) * 2));
  const padding = box?.padding ?? 0;
  canvas.width = Math.min(8192, Math.max(1, Math.ceil(width + (edge + padding) * 2)));
  canvas.height = Math.min(8192, Math.max(1, Math.ceil(height + (edge + padding) * 2)));
  setup();
  if (box) {
    ctx.fillStyle = color(box.color, '#000000');
    ctx.globalAlpha = box.opacity;
    ctx.beginPath();
    ctx.roundRect(edge, edge, width + padding * 2, height + padding * 2, box.radius);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const fill = paintFill(ctx, input.fill, canvas.width, canvas.height);
  input.lines.forEach((line, index) => {
    const measured = metrics[index].width;
    const offset = input.align === 'center' ? (width - measured) / 2 : input.align === 'right' ? width - measured : 0;
    const x = edge + padding + offset;
    const y = edge + padding + ascent + index * input.line;
    // Draw each effect behind the glyph without painting its fill a second time.
    if (shadow || glow) {
      for (const effect of [glow && { ...glow, x: 0, y: 0, opacity: 1 }, shadow]) {
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
    if (stroke && stroke.width > 0) {
      ctx.lineWidth = stroke.width * 2;
      ctx.strokeStyle = color(stroke.color, '#000000');
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(line, x, y);
    if (input.underline) ctx.fillRect(x, y + input.size * 0.08, measured, Math.max(1, input.size * 0.05));
  });
  return canvas;
}
