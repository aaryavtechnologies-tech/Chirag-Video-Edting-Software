import { evaluateAnimation, neutral, type MotionState } from '../animation/evaluate';
import { clamp01 } from '../animation/easing';
import { animateText } from '../lib/textMotion';
import { drawLayer, fadeOpacity, radians, type Transform } from '../preview/compositor';
import type { Clip } from '../types/project';
import { rasterRegions, type TextRegion } from './rasteriser';

const tintCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
function tintRegion(source: HTMLCanvasElement, region: TextRegion, color: string) {
  let cache = tintCache.get(source);
  if (!cache) { cache = new Map(); tintCache.set(source, cache); }
  const key = JSON.stringify([region, color]);
  const known = cache.get(key);
  if (known) return known;
  const raster = document.createElement('canvas');
  raster.width = Math.ceil(region.width);
  raster.height = Math.ceil(region.height);
  const ctx = raster.getContext('2d')!;
  ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, raster.width, raster.height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = CSS.supports('color', color) ? color : '#ffd447';
  ctx.fillRect(0, 0, raster.width, raster.height);
  if (cache.size >= 96) cache.delete(cache.keys().next().value!);
  cache.set(key, raster);
  return raster;
}

function drawRegion(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, state: MotionState, region: TextRegion, index = 0, total = 1, tint?: string) {
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
  if (tint) ctx.drawImage(tintRegion(source, region, tint), left, top, region.width, region.height);
  else ctx.drawImage(source, region.x, region.y, region.width, region.height, left, top, region.width, region.height);
  ctx.restore();
}

function drawCaptionWords(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, clip: Clip, localTime: number) {
  const effect = clip.caption?.wordEffect;
  const words = clip.caption?.words;
  const regions = rasterRegions(source, 'word');
  if (!effect?.type || effect.type === 'none' || !regions?.length || !words?.length) return false;
  const active = words.findIndex((word) => word.start <= localTime && localTime < word.end);
  const word = words[active];
  const progress = word ? clamp01((localTime - word.start) / Math.max(0.001, word.end - word.start)) : 0;
  const region = regions[active];
  const highlight = effect.activeColor ?? '#ffd447';
  if (effect.type === 'pillSlide' && region) {
    const previous = regions[active - 1];
    const slide = previous && previous.y === region.y ? Math.min(1, progress * 5) : 1;
    const x = previous ? previous.x + (region.x - previous.x) * slide : region.x;
    const width = previous ? previous.width + (region.width - previous.width) * slide : region.width;
    ctx.save();
    ctx.fillStyle = effect.pillColor ?? '#453494';
    ctx.beginPath();
    ctx.roundRect(x - 3, region.y + region.height * 0.12, width + 6, region.height * 0.76, Math.max(0, effect.pillRadius ?? 10));
    ctx.fill();
    ctx.restore();
  }
  regions.forEach((area, index) => {
    const on = index === active;
    if (effect.type === 'wordByWord' && localTime < (words[index]?.start ?? Infinity)) return;
    if (effect.type === 'oneWordAtATime' && !on) return;
    const state = { ...neutral, opacity: on ? 1 : effect.inactiveOpacity ?? 1 };
    if (on && (effect.type === 'scalePop' || effect.type === 'bounceActive')) {
      state.scaleX = state.scaleY = 1 + ((effect.scale ?? 1.15) - 1) * Math.sin(progress * Math.PI);
      if (effect.type === 'bounceActive') state.translateY = -area.height * 0.25 * Math.sin(progress * Math.PI);
    }
    drawRegion(ctx, source, state, area, index, regions.length, on && effect.type === 'highlightColor' ? highlight : undefined);
    if (on && effect.type === 'karaokeFill') drawRegion(ctx, source,
      { ...state, clipReveal: { direction: 'right', amount: progress } }, area, index, regions.length, highlight);
    if (on && effect.type === 'underlineSweep') {
      ctx.save();
      ctx.fillStyle = highlight;
      ctx.fillRect(area.x, area.y + area.height * 0.88, area.width * progress, Math.max(1, area.height / 28));
      ctx.restore();
    }
  });
  return true;
}

export function drawAnimatedText(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, clip: Clip, time: number, transform: Transform) {
  if (!clip.animation && !clip.caption?.wordEffect?.type) {
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
  if (!state.perUnitStates.length && !state.letterSpacingDelta && !state.clipReveal && clip.caption?.wordEffect) {
    ctx.save();
    ctx.translate(source.width / 2 + state.translateX, source.height / 2 + state.translateY);
    ctx.rotate(radians(state.rotation));
    ctx.scale(state.scaleX, state.scaleY);
    ctx.translate(-source.width / 2, -source.height / 2);
    ctx.globalAlpha *= Math.max(0, Math.min(1, state.opacity));
    const rendered = drawCaptionWords(ctx, source, clip, time - clip.start);
    ctx.restore();
    if (rendered) { ctx.restore(); return; }
  }
  if (perUnit?.length && (state.perUnitStates.length || state.letterSpacingDelta)) {
    perUnit.forEach((region, index) => drawRegion(ctx, source, state.perUnitStates[index] ?? state, region, index, perUnit.length));
  } else drawRegion(ctx, source, state, { x: 0, y: 0, width: source.width, height: source.height });
  ctx.restore();
}
