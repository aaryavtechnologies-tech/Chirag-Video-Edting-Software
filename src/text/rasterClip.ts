import type { Clip } from '../types/project';
import { loadTextFont, rasterizeText } from './rasteriser';

export const loadClipFont = (clip: Clip) => clip.shape ? Promise.resolve() : loadTextFont(clip.text ?? '', clip.style);

export function rasterClip(clip: Clip, scale: number) {
  const shape = clip.shape;
  if (!shape) return rasterizeText(clip.text ?? '', clip.style, scale);
  const canvas = document.createElement('canvas');
  const width = Math.max(1, shape.width * scale);
  const height = Math.max(1, shape.height * scale);
  const stroke = shape.strokeWidth * scale;
  const edge = stroke / 2 + 2;
  canvas.width = Math.ceil(width + edge * 2);
  canvas.height = Math.ceil(height + edge * 2);
  const ctx = canvas.getContext('2d')!;
  ctx.translate(edge, edge);
  ctx.fillStyle = shape.fill;
  ctx.strokeStyle = shape.stroke;
  ctx.lineWidth = stroke;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (shape.kind === 'rectangle') ctx.rect(0, 0, width, height);
  else if (shape.kind === 'circle') ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, 2 * Math.PI);
  else if (shape.kind === 'line') { ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); }
  else {
    ctx.moveTo(0, height * 0.35);
    ctx.lineTo(width * 0.68, height * 0.35);
    ctx.lineTo(width * 0.68, 0);
    ctx.lineTo(width, height / 2);
    ctx.lineTo(width * 0.68, height);
    ctx.lineTo(width * 0.68, height * 0.65);
    ctx.lineTo(0, height * 0.65);
    ctx.closePath();
  }
  if (shape.kind !== 'line') ctx.fill();
  if (stroke) ctx.stroke();
  return canvas;
}
