import { useRef, type CSSProperties } from 'react';
import { strings as s } from '../lib/strings';
import type { Track } from '../types/project';

export function TimelineNavigator({ tracks, duration, start, span, pan, resize }: {
  tracks: Track[]; duration: number; start: number; span: number;
  pan(time: number): void; resize(start: number, span: number): void;
}) {
  const drag = useRef<{ x: number; start: number; span: number; scale: number; edge: string | undefined }>();
  const percent = (time: number) => 100 * time / duration + '%';
  return <div className="timeline-navigator" role="slider" aria-label={s.timelineNavigator}
    tabIndex={0} aria-valuemin={0} aria-valuemax={Math.round(duration * 100) / 100} aria-valuenow={Math.round(start * 100) / 100}
    onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      pan(event.key === 'Home' ? 0 : event.key === 'End' ? duration : start + (event.key === 'ArrowRight' ? span : -span) / 4);
    }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const target = event.target as HTMLElement;
      const inside = !!target.closest('.navigator-window');
      const scale = duration / bounds.width;
      const next = inside ? start : Math.max(0, Math.min(duration - span, (event.clientX - bounds.left) * scale - span / 2));
      if (!inside) pan(next);
      drag.current = { x: event.clientX, start: next, span, scale, edge: target.dataset.edge };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      const active = drag.current;
      if (!active) return;
      const delta = (event.clientX - active.x) * active.scale;
      if (active.edge === 'left') {
        const next = Math.max(0, active.start + Math.min(delta, active.span * 0.9));
        resize(next, active.start + active.span - next);
      } else if (active.edge === 'right') resize(active.start, Math.max(active.span * 0.1, active.span + delta));
      else pan(active.start + delta);
    }}
    onLostPointerCapture={() => { drag.current = undefined; }}>
    {tracks.map((track, index) => <div className="navigator-track" key={track.id} data-kind={track.kind}
      style={{ '--lane': index, '--lanes': tracks.length } as CSSProperties}>
      {track.clips.map((clip) => <span key={clip.id} style={{ left: percent(clip.start), width: percent(clip.duration) }} />)}
    </div>)}
    <div className="navigator-window" style={{ left: percent(start), width: percent(span) }}>
      <i data-edge="left" /><i data-edge="right" />
    </div>
  </div>;
}
