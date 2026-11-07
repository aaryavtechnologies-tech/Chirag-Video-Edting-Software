import type { Clip } from '../types/project';
import type { Transform } from '../preview/compositor';

export const entrances = ['none', 'fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'pop', 'zoomIn'] as const;
export const exits = ['none', 'fade', 'slideDown', 'slideUp', 'slideLeft', 'slideRight', 'shrinkOut'] as const;

type Motion = { x?: number; y?: number; scale?: number; fade?: boolean };
const motions: Record<typeof entrances[number] | typeof exits[number], Motion> = {
  none: {},
  fade: { fade: true },
  slideUp: { y: 0.12 },
  slideDown: { y: 0.12 },
  slideLeft: { x: 0.16 },
  slideRight: { x: 0.16 },
  pop: { scale: -0.25 },
  zoomIn: { scale: -0.65, fade: true },
  shrinkOut: { scale: -0.65, fade: true },
};

export function textMotion(clip: Clip) {
  const enter = clip.style?.animationIn ?? 'none';
  const exit = clip.style?.animationOut ?? 'none';
  return {
    duration: Math.min(clip.duration, Math.max(0.01, Math.min(5, clip.style?.animationDuration ?? 0.4))),
    enter: { ...motions[enter], ...(enter === 'slideDown' && { y: -0.12 }),
      ...(enter === 'slideRight' && { x: -0.16 }) },
    exit: { ...motions[exit], ...(exit === 'slideUp' && { y: -0.12 }),
      ...(exit === 'slideLeft' && { x: -0.16 }) },
  };
}

export function animateText(clip: Clip, transform: Transform, time: number): Transform {
  const { enter, exit, duration } = textMotion(clip);
  const progress = (elapsed: number) => Math.max(0, Math.min(1, elapsed / duration));
  const entering = progress(time - clip.start);
  const exiting = progress(clip.start + clip.duration - time);
  return {
    ...transform,
    x: transform.x + (enter.x ?? 0) * (1 - entering) + (exit.x ?? 0) * (1 - exiting),
    y: transform.y + (enter.y ?? 0) * (1 - entering) + (exit.y ?? 0) * (1 - exiting),
    scale: transform.scale * (1 + (enter.scale ?? 0) * (1 - entering)) * (1 + (exit.scale ?? 0) * (1 - exiting)),
    opacity: transform.opacity * (enter.fade ? entering : 1) * (exit.fade ? exiting : 1),
  };
}
