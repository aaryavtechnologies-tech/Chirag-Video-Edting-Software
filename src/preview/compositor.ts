import type { Asset, Clip, Project } from '../types/project';

export interface Transform {
  x: number; y: number; scale: number; rotation: number; opacity: number;
}
export const defaultTransform: Transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };
export const radians = (degrees: number) => degrees * Math.PI / 180;

export function clipTransform(clip: Clip): Transform {
  return { ...defaultTransform, ...clip.transform };
}

export function activeLayers(project: Project, time: number) {
  const tracks = project.tracks.filter((track) => track.kind === 'video' && !track.hidden)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return tracks.flatMap((track) => track.clips.filter((clip) =>
    time >= clip.start && time < clip.start + clip.duration));
}

export function fittedSize(width: number, height: number, sourceWidth: number, sourceHeight: number, cover: boolean) {
  const fit = cover ? Math.max(width / sourceWidth, height / sourceHeight) :
    Math.min(width / sourceWidth, height / sourceHeight);
  return { width: sourceWidth * fit, height: sourceHeight * fit };
}

export function layerSize(clip: Clip, asset: Asset | undefined, width: number, height: number) {
  return fittedSize(width, height, asset?.width || width, asset?.height || height, clip.fit === 'cover');
}

export function fadeOpacity(clip: Clip, time: number) {
  const elapsed = time - clip.start;
  const remaining = clip.duration - elapsed;
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return clamp(clip.fadeIn ? elapsed / clip.fadeIn : 1) * clamp(clip.fadeOut ? remaining / clip.fadeOut : 1);
}

export function drawLayer(
  ctx: CanvasRenderingContext2D, source: CanvasImageSource, clip: Clip, time: number,
  size: { width: number; height: number }, transform: Transform,
) {
  ctx.save();
  ctx.translate(transform.x * ctx.canvas.width, transform.y * ctx.canvas.height);
  ctx.rotate(radians(transform.rotation));
  ctx.scale(transform.scale, transform.scale);
  ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity)) * fadeOpacity(clip, time);
  ctx.drawImage(source, -size.width / 2, -size.height / 2, size.width, size.height);
  ctx.restore();
}
