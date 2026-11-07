import { useRef } from 'react';
import { strings as s } from '../lib/strings';
import type { Project } from '../types/project';
import type { CaptionSegment, CaptionTrack } from './types';
import { alignFrame } from '../lib/time';
import { captionTrack, retimeCaption, splitCaption } from './model';

type Edge = 'move' | 'left' | 'right';

export function CaptionTimelineRow({ track, zoom, fps, edit, selected, select, playhead }: {
  track: CaptionTrack; zoom: number; fps: number; edit(recipe: (draft: Project) => void): void;
  selected: ReadonlySet<string>; select(id?: string, trackId?: string, extend?: boolean): void; playhead: number;
}) {
  const gesture = useRef<{ id: string; x: number; edge: Edge }>();
  function change(operation: (draft: CaptionTrack) => void) {
    edit((draft) => {
      const target = captionTrack(draft, track.id);
      if (target && !target.locked) operation(target);
    });
  }
  function move(segment: CaptionSegment, edge: Edge, delta: number) {
    const frame = 1 / fps;
    const finish = segment.start + segment.duration;
    if (edge === 'move') retimeCaption(segment, Math.max(0, alignFrame(segment.start + delta, fps)), segment.duration);
    else if (edge === 'left') {
      const start = Math.max(0, Math.min(finish - frame, alignFrame(segment.start + delta, fps)));
      retimeCaption(segment, start, finish - start);
    } else retimeCaption(segment, segment.start, Math.max(frame, alignFrame(finish + delta, fps) - segment.start));
  }
  return <div className="timeline-row caption-track">
    <div className="track-label"><button onClick={() => select(undefined, track.id)}>{track.name ?? s.captions}</button></div>
    <div className="track-lane">
      {track.segments.map((item) => <div className="caption-clip" key={item.id} role="button" tabIndex={0}
        data-selected={selected.has(item.id)} aria-label={item.text} style={{ left: item.start * zoom, width: Math.max(6, item.duration * zoom) }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          select(item.id, track.id, event.shiftKey || event.ctrlKey || event.metaKey);
          if (track.locked) return;
          const edge = (event.target as HTMLElement).dataset.edge as Edge | undefined;
          gesture.current = { id: item.id, x: event.clientX, edge: edge ?? 'move' };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          const active = gesture.current;
          gesture.current = undefined;
          if (!active || active.id !== item.id || Math.abs(event.clientX - active.x) < 2) return;
          change((draft) => {
            const segment = draft.segments.find((entry) => entry.id === item.id);
            if (!segment) return;
            move(segment, active.edge, (event.clientX - active.x) / zoom);
            draft.segments.sort((a, b) => a.start - b.start);
          });
        }}
        onLostPointerCapture={() => { gesture.current = undefined; }}
        onKeyDown={(event) => {
          const key = event.key.toLowerCase();
          if (!['arrowleft', 'arrowright', 's', 'delete', 'backspace', 'enter', ' '].includes(key)) return;
          event.preventDefault();
          event.stopPropagation();
          if (key === 'enter' || key === ' ') { select(item.id, track.id, event.shiftKey); return; }
          change((draft) => {
            const segment = draft.segments.find((entry) => entry.id === item.id);
            if (!segment) return;
            if (key === 's') splitCaption(draft, item.id, playhead, crypto.randomUUID());
            else if (key === 'delete' || key === 'backspace') {
              draft.segments = draft.segments.filter((entry) => entry.id !== item.id);
              if (event.shiftKey) for (const after of draft.segments) {
                if (after.start >= segment.start + segment.duration) after.start -= segment.duration;
              }
              select(undefined, track.id);
            } else {
              move(segment, 'move', (key === 'arrowleft' ? -1 : 1) / fps);
              draft.segments.sort((a, b) => a.start - b.start);
            }
          });
        }}>
        <span data-edge="left" className="caption-edge caption-edge-left" />
        <span className="caption-clip-label">{item.overrides && '● '}{item.text}</span>
        <span data-edge="right" className="caption-edge caption-edge-right" />
      </div>)}
    </div>
  </div>;
}
