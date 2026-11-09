import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return <button type="button" {...props} className={`ui-button ${variant} ${className}`} />;
}

export function Segmented({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className="ui-segmented">{children}</div>;
}

export function Switch({ label, checked, change }: { label: string; checked: boolean; change(value: boolean): void }) {
  return <label className="toggle-field ui-switch"><input role="switch" type="checkbox" checked={checked}
    onChange={(event) => change(event.target.checked)} />{label}</label>;
}

type Range = { label: string; value: number; min: number; max: number; step: number; change(value: number): void };
export function NumberInput({ label, value, min, max, step, change }: Range) {
  return <input className="ui-number" aria-label={label} type="number" min={min} max={max} step={step}
    key={value} defaultValue={Number(value.toFixed(3))} onBlur={(event) => {
      const next = event.target.valueAsNumber;
      if (Number.isFinite(next) && next >= min && next <= max && next !== value) change(next);
      else event.target.value = String(Number(value.toFixed(3)));
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}

export function Slider({ reset, numeric = true, ...range }: Range & { reset?: number; numeric?: boolean }) {
  return <div className="ui-slider">
    <input type="range" aria-label={range.label} min={range.min} max={range.max} step={range.step} value={range.value}
      onDoubleClick={() => { if (reset !== undefined) range.change(reset); }}
      onChange={(event) => range.change(event.target.valueAsNumber)} />
    {numeric && <NumberInput {...range} label={range.label} />}
  </div>;
}
