import { animationWindows } from '../animation/evaluate';
import { strings as s } from '../lib/strings';
import { textMotion } from '../lib/textMotion';
import { clipTransform, fittedSize } from '../preview/compositor';
import { drawAnimatedText } from '../text/drawAnimatedText';
import type { Clip, Project } from '../types/project';
import type { ExportSettings, TextFrameBatch } from '../types/export';

export function encodePng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(s.exportFailed)), 'image/png'))
    .then((blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error(s.exportFailed));
      reader.readAsDataURL(blob);
    }));
}

export function needsTextFrames(clip: Clip) {
  return !!(clip.animation && [clip.animation.in, clip.animation.out, clip.animation.loop]
    .some((slot) => slot && slot.preset !== 'none')) ||
    (!clip.animation && !![clip.style?.animationIn, clip.style?.animationOut].find((preset) => preset && preset !== 'none')) ||
    !!(clip.caption?.wordEffect?.type && clip.caption.wordEffect.type !== 'none');
}

export async function stageTextFrames(
  project: Project, clip: Clip, raster: HTMLCanvasElement, settings: ExportSettings,
  cancelled: () => boolean, report: (count: number) => void,
) {
  const { width, height, fps } = settings;
  const size = fittedSize(width, height, project.settings.width, project.settings.height, false);
  const stage = { ...size, x: (width - size.width) / 2, y: (height - size.height) / 2 };
  const transform = clipTransform(clip);
  const centerX = stage.x + transform.x * stage.width;
  const centerY = stage.y + transform.y * stage.height;
  const region = Math.min(stage.width, stage.height);
  const slots = [clip.animation?.in, clip.animation?.out, clip.animation?.loop];
  const full = slots.some((slot) => slot?.preset === 'letterSpread');
  const padding = Math.hypot(raster.width, raster.height) * Math.max(1, Math.abs(transform.scale)) * 1.8 +
    region * 0.65 + 16;
  const left = full ? 0 : Math.max(0, Math.min(width - 2, Math.floor((centerX - padding) / 2) * 2));
  const top = full ? 0 : Math.max(0, Math.min(height - 2, Math.floor((centerY - padding) / 2) * 2));
  const right = full ? width : Math.min(width, Math.max(left + 2, Math.ceil((centerX + padding) / 2) * 2));
  const bottom = full ? height : Math.min(height, Math.max(top + 2, Math.ceil((centerY + padding) / 2) * 2));
  const canvas = document.createElement('canvas');
  canvas.width = right - left;
  canvas.height = bottom - top;
  const ctx = canvas.getContext('2d')!;
  const startFrame = Math.ceil(clip.start * fps - 1e-7);
  const endFrame = Math.ceil((clip.start + clip.duration) * fps - 1e-7);
  const count = Math.max(1, endFrame - startFrame);
  const timing = animationWindows(clip);
  const legacyDuration = textMotion(clip).duration;
  const inEnd = clip.animation ? timing.inEnd : clip.style?.animationIn && clip.style.animationIn !== 'none' ? legacyDuration : 0;
  const outStart = clip.animation ? timing.outStart : clip.style?.animationOut && clip.style.animationOut !== 'none'
    ? clip.duration - legacyDuration : clip.duration;
  const hold = !clip.caption?.wordEffect?.type && (!clip.animation?.loop || clip.animation.loop.preset === 'none') &&
    !clip.fadeIn && !clip.fadeOut;
  let holdFrame: number | undefined;
  const frames: TextFrameBatch['frames'] = [];
  for (let index = 0; index < count && !cancelled(); index++) {
    const time = (index + startFrame) / fps;
    const local = time - clip.start;
    const staticMiddle = hold && local >= inEnd && local < outStart;
    if (staticMiddle && holdFrame !== undefined) frames.push({ index, repeat: holdFrame });
    else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawAnimatedText(ctx, raster, clip, time, transform, { ...stage, x: stage.x - left, y: stage.y - top });
      frames.push({ index, png: await encodePng(canvas) });
      if (staticMiddle) holdFrame = index;
    }
    if (cancelled()) return;
    if (frames.length >= 4 || index + 1 === count) {
      await window.desktop.stageTextFrames({ id: clip.id, fps, startFrame, x: left, y: top, frames });
      frames.length = 0;
      report(index + 1);
    }
  }
}
