import { Segmented, Slider } from '../design-system/Controls';
import { Select } from '../design-system/Select';
import { useMemo, useState } from 'react';
import type { AnimationPhase, AnimationSet, AnimationSlot, Easing } from './schema';
import { directions, easingNames, granularityValues, staggerOrders } from './schema';
import { defaultGranularity, presets } from './presets';
import { AnimationPreview } from './AnimationPreview';
import { strings as s } from '../lib/strings';

function AnimationCard({ phase, id, pressed, select }: {
  phase: AnimationPhase; id: string; pressed: boolean; select(): void;
}) {
  const [hover, setHover] = useState(false);
  const animation = useMemo(() => ({ [phase]: { preset: id, duration: 0.8 } } satisfies AnimationSet), [phase, id]);
  return <button aria-pressed={pressed} onClick={select} onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
    <AnimationPreview animation={animation} text={s.styleSample} play={hover} />
    {s.animationNames[id] ?? id}
  </button>;
}

function Numeric({ label, value, min, max, step, change }: {
  label: string; value: number; min: number; max: number; step: number; change(value: number): void;
}) {
  return <label>{label}<input type="number" key={value} defaultValue={value} min={min} max={max} step={step}
    onBlur={(event) => {
      const next = event.currentTarget.valueAsNumber;
      if (Number.isFinite(next) && next >= min && next <= max) change(next);
      else event.currentTarget.value = String(value);
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

export function AnimationInspector({ value, change }: { value?: AnimationSet; change(value: AnimationSet): void }) {
  const [phase, setPhase] = useState<AnimationPhase>('in');
  const slot = value?.[phase];
  const curve = Array.isArray(slot?.easing) ? slot.easing : undefined;
  const set = (patch: Partial<AnimationSlot>) => change({ ...value, [phase]: { preset: 'none', ...slot, ...patch } });
  return <>
    <Segmented label={s.animation}>
      {(['in', 'out', 'loop'] as const).map((item) => <button key={item} aria-pressed={phase === item}
        onClick={() => setPhase(item)}>{s.animationPhases[item]}</button>)}
    </Segmented>
    <div className="style-presets animation-grid">
      {['none', ...presets[phase]].map((id) => <AnimationCard key={id} phase={phase} id={id}
        pressed={(slot?.preset ?? 'none') === id} select={() => set({ preset: id, granularity: defaultGranularity(id) })} />)}
    </div>
    {slot && slot.preset !== 'none' && <>
      <div className="inspector-slider-row"><span>{s.animationDuration}</span>
        <Slider label={s.animationDuration} value={slot.duration ?? 0.5} min={0.1} max={3} step={0.05}
          reset={0.5} change={(duration) => set({ duration })} /></div>
      <Numeric label={s.animationDelay} value={slot.delay ?? 0} min={0} max={30} step={0.05} change={(delay) => set({ delay })} />
      <Numeric label={s.intensity} value={slot.intensity ?? 1} min={0} max={2} step={0.05} change={(intensity) => set({ intensity })} />
      <label>{s.direction}<Select label={s.direction} value={slot.direction ?? 'right'} onChange={(event) => set({ direction: directions[event.target.selectedIndex] })}>
        {directions.map((direction) => <option key={direction} value={direction}>{s.animationDirections[direction]}</option>)}
      </Select></label>
      <label>{s.easing}<Select label={s.easing} value={typeof slot.easing === 'string' ? slot.easing : curve ? 'custom' : ''} onChange={(event) => {
        const selected = event.target.value;
        set({ easing: selected === 'custom' ? [0.25, 0.1, 0.25, 1] : selected ? selected as Easing : undefined });
      }}>
        <option value="">{s.animationDefault}</option>
        {easingNames.map((name) => <option key={name} value={name}>{name}</option>)}
        <option value="custom">{s.customBezier}</option>
      </Select></label>
      {curve && <div className="grid grid-cols-2 gap-1">
        {(['X1', 'Y1', 'X2', 'Y2'] as const).map((axis, index) => <Numeric key={axis} label={axis} value={curve[index]}
          min={index % 2 ? -3 : 0} max={index % 2 ? 3 : 1} step={0.01} change={(point) => {
            const next = [...curve] as typeof curve;
            next[index] = point;
            set({ easing: next });
          }} />)}
      </div>}
      {phase !== 'loop' && <>
        <Segmented label={s.granularity}>
          {granularityValues.map((unit) => <button key={unit} title={s.granularityNames[unit]}
            aria-pressed={(slot.granularity ?? defaultGranularity(slot.preset)) === unit}
            onClick={() => set({ granularity: unit })}>{s.shortGranularity[unit]}</button>)}
        </Segmented>
        <Numeric label={s.stagger} value={slot.stagger ?? 0.04} min={0} max={0.3} step={0.01} change={(stagger) => set({ stagger })} />
        <label>{s.staggerOrder}<Select label={s.staggerOrder} value={slot.staggerOrder ?? 'forward'} onChange={(event) => set({ staggerOrder: staggerOrders[event.target.selectedIndex] })}>
          {staggerOrders.map((order) => <option key={order} value={order}>{s.staggerNames[order]}</option>)}
        </Select></label>
        <Numeric label={s.animationSeed} value={slot.seed ?? 1} min={-2147483648} max={2147483647} step={1}
          change={(seed) => set({ seed: Math.round(seed) })} />
      </>}
    </>}
  </>;
}
