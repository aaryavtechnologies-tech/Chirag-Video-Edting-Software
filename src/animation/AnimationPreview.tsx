import { useEffect, useRef } from 'react';
import type { Clip, TextStyle } from '../types/project';
import { defaultTransform } from '../preview/compositor';
import { rasterizeText, loadTextFont } from '../text/rasteriser';
import { drawAnimatedText } from '../text/drawAnimatedText';
import type { AnimationSet } from './schema';

export function AnimationPreview({ text, animation, style, play, caption }: {
  text: string; animation: AnimationSet; style?: TextStyle; play: boolean; caption?: Clip['caption'];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const clip: Clip = { id: 'sample', type: 'text', start: 0, duration: 2.6, text, animation, style, caption };
    let raster = rasterizeText(text, { ...style, fontSize: 18, boxWidth: 0, boxHeight: 0 }, 1);
    let visible = false;
    let disposed = false;
    let frame = 0;
    const start = performance.now();
    const draw = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawAnimatedText(ctx, raster, clip, time, defaultTransform);
    };
    const tick = (now: number) => {
      draw(((now - start) / 1000) % clip.duration);
      frame = requestAnimationFrame(tick);
    };
    draw(1.3);
    void loadTextFont(text, style).then(() => {
      if (disposed) return;
      raster = rasterizeText(text, { ...style, fontSize: 18, boxWidth: 0, boxHeight: 0 }, 1);
      if (!visible || !play) draw(1.3);
    });
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible && play) frame = requestAnimationFrame(tick);
    });
    observer.observe(canvas);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [text, animation, style, play, caption]);
  return <canvas width={132} height={52} ref={ref} aria-hidden="true" className="animation-sample" />;
}
