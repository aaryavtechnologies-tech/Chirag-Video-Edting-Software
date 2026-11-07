import type { Asset, Clip, Project } from '../types/project';
import { captionLayers } from '../captions/model';
import { cropRect, visualProgress } from '../lib/visual';

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
  return [...tracks.flatMap((track) => track.clips.filter((clip) =>
    time >= clip.start && time < clip.start + clip.duration)), ...captionLayers(project, time)];
}

export function fittedSize(width: number, height: number, sourceWidth: number, sourceHeight: number, cover: boolean) {
  const fit = cover ? Math.max(width / sourceWidth, height / sourceHeight) :
    Math.min(width / sourceWidth, height / sourceHeight);
  return { width: sourceWidth * fit, height: sourceHeight * fit };
}

export function layerSize(clip: Clip, asset: Asset | undefined, width: number, height: number) {
  const crop = cropRect(clip);
  return fittedSize(width, height, (asset?.width || width) * crop.width, (asset?.height || height) * crop.height, clip.fit === 'cover');
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
  const visual = clip.visual;
  const progress = visual?.motion && visual.motion !== 'none' ? visualProgress(clip, time) : 1;
  const x = transform.x + (visual?.motion === 'slide' ? 0.18 * (1 - progress) : 0);
  const scale = transform.scale * (visual?.motion === 'zoom' ? 0.6 + progress * 0.4 : 1);
  ctx.translate(x * ctx.canvas.width, transform.y * ctx.canvas.height);
  ctx.rotate(radians(transform.rotation + (visual?.motion === 'spin' ? (1 - progress) * -180 : 0)));
  ctx.scale(scale * (visual?.flipX ? -1 : 1), scale * (visual?.flipY ? -1 : 1));
  ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity)) * fadeOpacity(clip, time);
  const left = -size.width / 2;
  const top = -size.height / 2;
  if (visual) {
    if (visual.motion === 'wipe') {
      ctx.beginPath();
      ctx.rect(left, top, size.width * progress, size.height);
      ctx.clip();
    }
    ctx.filter = `brightness(${Math.max(0, 1 + (visual.brightness ?? 0))}) contrast(${visual.contrast ?? 1}) saturate(${visual.saturation ?? 1})` +
      (visual.blur ? ` blur(${visual.blur * ctx.canvas.height / 1080}px)` : '') +
      (visual.temperature ? ` sepia(${Math.abs(visual.temperature) * 0.35}) hue-rotate(${visual.temperature < 0 ? 160 : -18}deg)` : '');
  }
  if (visual?.crop && (source instanceof HTMLImageElement || source instanceof HTMLVideoElement || source instanceof ImageBitmap)) {
    const w = source instanceof HTMLVideoElement ? source.videoWidth : source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const h = source instanceof HTMLVideoElement ? source.videoHeight : source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    const crop = cropRect(clip);
    ctx.drawImage(source, crop.x * w, crop.y * h, crop.width * w, crop.height * h, left, top, size.width, size.height);
  } else ctx.drawImage(source, left, top, size.width, size.height);
  if (visual?.vignette) {
    ctx.filter = 'none';
    const gradient = ctx.createRadialGradient(0, 0, Math.min(size.width, size.height) * 0.17,
      0, 0, Math.hypot(size.width, size.height) / 2);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, `rgba(0,0,0,${visual.vignette})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(left, top, size.width, size.height);
  }
  ctx.restore();
}
