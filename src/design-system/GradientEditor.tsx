import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { strings as s } from '../lib/strings';
import { ColorPicker } from './ColorPicker';
import { NumberInput } from './Controls';
import { IconButton } from './IconButton';
import { Select } from './Select';
import type { TextStyle } from '../types/project';

type Gradient = NonNullable<NonNullable<TextStyle['fill']>['gradient']>;
const clamp = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;

export function GradientEditor({ gradient, change }: { gradient: Gradient; change(value: Gradient): void }) {
  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState<number>();
  const strip = useRef<HTMLDivElement>(null);
  const saved = gradient.stops ?? [{ offset: 0, color: gradient.from ?? '#ffffff' }, { offset: 1, color: gradient.to ?? '#8b7bff' }];
  const selected = Math.min(active, saved.length - 1);
  const stops = saved.map((stop, index) => index === selected && draft !== undefined ? { ...stop, offset: draft } : stop);
  const current = stops[selected];
  const position = (x: number) => {
    const bounds = strip.current?.getBoundingClientRect();
    return bounds ? clamp((x - bounds.left) / bounds.width) : 0;
  };
  function update(index: number, patch: Partial<typeof current>) {
    change({ ...gradient, stops: saved.map((stop, i) => i === index ? { ...stop, ...patch } : stop) });
  }
  function add(offset: number) {
    if (saved.length >= 4) return;
    setActive(saved.length);
    change({ ...gradient, stops: [...saved, { offset, color: current.color }] });
  }
  function remove(index: number) {
    if (saved.length <= 2) return;
    setActive(Math.min(index, saved.length - 2));
    change({ ...gradient, stops: saved.filter((_, i) => i !== index) });
  }
  return <div className="gradient-editor">
    <div className="gradient-strip" ref={strip}
      style={{ backgroundImage: `linear-gradient(90deg,${[...stops].sort((a, b) => a.offset - b.offset)
        .map((stop) => `${stop.color} ${100 * stop.offset}%`).join(',')})` }}
      onPointerDown={(event) => { if (event.button === 0 && event.target === event.currentTarget) add(position(event.clientX)); }}>
      {stops.map((stop, index) => <button type="button" key={index} aria-pressed={selected === index}
        aria-label={s.gradientStop + ' ' + (index + 1)} style={{ left: `${stop.offset * 100}%`, backgroundColor: stop.color }}
        onClick={() => setActive(index)} onPointerDown={(event) => {
          if (event.button !== 0) return;
          setActive(index);
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setDraft(position(event.clientX));
        }} onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const bounds = strip.current?.getBoundingClientRect();
          if (bounds && (event.clientY < bounds.top - 22 || event.clientY > bounds.bottom + 22) && saved.length > 2) {
            event.preventDefault();
            remove(index);
          } else if (draft !== undefined && draft !== saved[index].offset) update(index, { offset: draft });
          setDraft(undefined);
        }} onLostPointerCapture={() => setDraft(undefined)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Delete'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          setActive(index);
          if (event.key === 'Delete') remove(index);
          else update(index, { offset: clamp(stop.offset + (event.key === 'ArrowLeft' ? -0.05 : 0.05)) });
        }} />)}
    </div>
    <div className="gradient-stop-controls">
      <ColorPicker label={s.gradientStop + ' ' + (selected + 1)} value={current.color} change={(color) => update(selected, { color })} />
      <IconButton label={s.addGradientStop} disabled={saved.length >= 4} onClick={() => add(0.5)}><Plus size={14} /></IconButton>
      <IconButton label={s.removeGradientStop} disabled={saved.length <= 2} onClick={() => remove(selected)}><Trash2 size={14} /></IconButton>
    </div>
    <label>{s.stopPosition}<NumberInput label={s.stopPosition} value={current.offset} min={0} max={1} step={0.05}
      change={(offset) => update(selected, { offset })} /></label>
    <label>{s.gradientKind}<Select label={s.gradientKind} value={gradient.kind ?? 'linear'}
      onChange={(event) => change({ ...gradient, kind: event.target.value === 'radial' ? 'radial' : 'linear' })}>
      <option value="linear">{s.linear}</option><option value="radial">{s.radial}</option>
    </Select></label>
    {gradient.kind !== 'radial' && <label>{s.angle}<NumberInput label={s.angle} value={gradient.angle ?? 0} min={0} max={360} step={1}
      change={(angle) => change({ ...gradient, angle })} /></label>}
  </div>;
}
