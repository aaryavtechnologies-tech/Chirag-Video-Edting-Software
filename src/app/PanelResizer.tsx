import { useRef } from 'react';
import { strings as s } from '../lib/strings';

export function PanelResizer({ width, right, resize, onCommit }: {
  width: number; right?: boolean; resize(value: number): void; onCommit(value: number): void;
}) {
  const drag = useRef<{ x: number; width: number }>();
  const direction = right ? -1 : 1;
  const clamp = (value: number) => Math.round(Math.min(420, Math.max(160, value)));
  return <div className="panel-resizer" role="separator" aria-label={s.resizing} aria-orientation="vertical"
    aria-valuemin={160} aria-valuemax={420} aria-valuenow={width} tabIndex={0}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      drag.current = { x: event.clientX, width };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (drag.current) resize(clamp(drag.current.width + (event.clientX - drag.current.x) * direction));
    }}
    onPointerUp={(event) => {
      if (drag.current) onCommit(clamp(drag.current.width + (event.clientX - drag.current.x) * direction));
    }}
    onLostPointerCapture={() => { drag.current = undefined; }}
    onKeyDown={(event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      onCommit(clamp(width + (event.key === 'ArrowRight' ? 10 : -10) * direction));
    }} />;
}
