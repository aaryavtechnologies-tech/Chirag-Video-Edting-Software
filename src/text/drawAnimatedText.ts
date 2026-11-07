import { evaluateAnimation, type MotionState } from '../animation/evaluate';
import { animateText } from '../lib/textMotion';
import { drawLayer, fadeOpacity, radians, type Transform } from '../preview/compositor';
import type { Clip } from '../types/project';
import { rasterRegions, type TextRegion } from './rasteriser';

function drawRegion(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, state: MotionState, region: TextRegion, index = 0, total = 1) {
  if (state.opacity <= 0 || region.width <= 0 || region.height <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, state.opacity));
  ctx.translate(region.x + region.width / 2 + state.translateX + (index - (total - 1) / 2) * state.letterSpacingDelta,
    region.y + region.height / 2 + state.translateY);
  ctx.rotate(radians(state.rotation));
  ctx.scale(state.scaleX, state.scaleY);
  const filters = [state.blur > 0 ? `blur(${state.blur}px)` : '',
    state.hue ? `hue-rotate(${state.hue}deg)` : '',
    state.glow > 0 ? `drop-shadow(0 0 ${state.glow}px #ad8aff)` : ''].filter(Boolean);
  if (filters.length) ctx.filter = filters.join(' ');
  const left = -region.width / 2;
  const top = -region.height / 2;
  const reveal = state.clipReveal;
  if (reveal) {
    const w = region.width * reveal.amount, h = region.height * reveal.amount;
    ctx.beginPath();
    if (reveal.direction === 'center') ctx.rect(-w / 2, -h / 2, w, h);
    else if (reveal.direction === 'left' || reveal.direction === 'right') {
      ctx.rect(reveal.direction === 'left' ? -left - w : left, top, w, region.height);
    } else ctx.rect(left, reveal.direction === 'up' ? -top - h : top, region.width, h);
    ctx.clip();
  }
  ctx.drawImage(source, region.x, region.y, region.width, region.height, left, top, region.width, region.height);
  ctx.restore();
}

export function drawAnimatedText(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, clip: Clip, time: number, transform: Transform) {
  if (!clip.animation) {
    drawLayer(ctx, source, clip, time, source, animateText(clip, transform, time));
    return;
  }
  const state = evaluateAnimation(clip, time - clip.start, ctx.canvas);
  const perUnit = state.letterSpacingDelta ? rasterRegions(source, 'char') : rasterRegions(source, state.granularity);
  ctx.save();
  ctx.translate(transform.x * ctx.canvas.width, transform.y * ctx.canvas.height);
  ctx.rotate(radians(transform.rotation));
  ctx.scale(transform.scale, transform.scale);
  ctx.translate(-source.width / 2, -source.height / 2);
  ctx.globalAlpha = transform.opacity * fadeOpacity(clip, time);
  if (perUnit?.length && (state.perUnitStates.length || state.letterSpacingDelta)) {
    perUnit.forEach((region, index) => drawRegion(ctx, source, state.perUnitStates[index] ?? state, region, index, perUnit.length));
  } else drawRegion(ctx, source, state, { x: 0, y: 0, width: source.width, height: source.height });
  ctx.restore();
}
