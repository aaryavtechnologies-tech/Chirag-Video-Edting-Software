import { useState, type ReactNode } from 'react';
import { strings as s } from '../../lib/strings';
import { builtInStyles, bundledFonts } from '../../lib/textPresets';
import { clipTransform, type Transform } from '../../preview/compositor';
import { findClip } from '../../timeline/operations';
import type { Clip, Project, TextStyle } from '../../types/project';

type Edit = (recipe: (draft: Project) => void) => void;
const defaults = {
  stroke: { color: '#000000', width: 3 },
  shadow: { color: '#000000', blur: 8, offsetX: 2, offsetY: 4, opacity: 0.7 },
  glow: { color: '#8b7bff', blur: 12 },
  background: { color: '#000000', opacity: 0.8, padding: 12, radius: 8 },
};

export function TextInspector({ clip, project, edit }: { clip: Clip; project: Project; edit: Edit }) {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontError, setFontError] = useState(false);
  const style = clip.style ?? {};
  const transform = clipTransform(clip);
  const locked = findClip(project, clip.id)?.track.locked;
  const change = (update: (clip: Clip) => void) => edit((draft) => {
    const found = findClip(draft, clip.id);
    if (found && !found.track.locked) update(found.clip);
  });
  const set = (patch: Partial<TextStyle>) => change((item) => { item.style = { ...item.style, ...patch }; });
  const apply = (value: TextStyle) => change((item) => { item.style = value; });
  const move = (key: keyof Transform, value: number) => change((item) => {
    item.transform = { ...item.transform, [key]: value };
  });
  const gradient = style.fill?.type === 'gradient';
  const fill = style.fill?.color ?? '#ffffff';
  const from = style.fill?.gradient?.from ?? '#ffffff';
  const to = style.fill?.gradient?.to ?? '#8b7bff';
  const setGradient = (patch: Partial<NonNullable<NonNullable<TextStyle['fill']>['gradient']>>) => {
    set({ fill: { type: 'gradient', gradient: { from, to, angle: 0, ...style.fill?.gradient, ...patch } } });
  };
  const queryFonts = async () => {
    const browser = window as Window & { queryLocalFonts?: () => Promise<{ family: string }[]> };
    try {
      const result = await browser.queryLocalFonts?.();
      setSystemFonts([...new Set(result?.map((font) => font.family) ?? [])].sort());
      setFontError(!result?.length);
    } catch {
      setFontError(true);
    }
  };

  return <aside className="inspector">
    <h2 className="font-semibold">{s.styles}</h2>
    <fieldset disabled={locked}>
      <legend>{s.content}</legend>
      <label>{s.text}<textarea key={clip.text} defaultValue={clip.text} rows={3} maxLength={5000}
        onBlur={(event) => change((item) => { item.text = event.target.value; })} /></label>
      <Choice label={s.alignment} value={style.align ?? 'center'} values={['left', 'center', 'right']}
        change={(align) => set({ align })} />
      <NumberField label={s.lineHeight} value={style.lineHeight ?? 1.2} min={0.5} max={4} step={0.05}
        change={(lineHeight) => set({ lineHeight })} />
      <NumberField label={s.letterSpacing} value={style.letterSpacing ?? 0} min={-100} max={100}
        change={(letterSpacing) => set({ letterSpacing })} />
    </fieldset>
    <fieldset disabled={locked}>
      <legend>{s.font}</legend>
      <label>{s.fontFamily}<input key={style.fontFamily} defaultValue={style.fontFamily ?? 'Inter'}
        list="editor-fonts" onBlur={(event) => set({ fontFamily: event.target.value.trim() || 'Inter' })}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        <datalist id="editor-fonts">{[...new Set([...bundledFonts, ...systemFonts])].map((family) =>
          <option key={family} value={family} />)}</datalist>
      </label>
      <button onClick={() => void queryFonts()}>{s.systemFonts}</button>
      {fontError && <p className="muted">{s.fontUnavailable}</p>}
      <NumberField label={s.fontSize} value={style.fontSize ?? 64} min={1} max={1024}
        change={(fontSize) => set({ fontSize })} />
      {(['bold', 'italic', 'underline', 'uppercase'] as const).map((key) =>
        <Toggle key={key} label={s[key]} checked={!!style[key]} change={(value) => set({ [key]: value })} />)}
    </fieldset>
    <fieldset disabled={locked}>
      <legend>{s.fill}</legend>
      <Choice label={s.fillType} value={gradient ? 'gradient' : 'solid'} values={['solid', 'gradient']}
        change={(type) => type === 'gradient' ? setGradient({}) : set({ fill: { type, color: fill } })} />
      {gradient ? <>
        <ColorField label={s.gradientFrom} value={from} change={(value) => setGradient({ from: withAlpha(value, alpha(from)) })} />
        <ColorField label={s.gradientTo} value={to} change={(value) => setGradient({ to: withAlpha(value, alpha(to)) })} />
        <NumberField label={s.angle} value={style.fill?.gradient?.angle ?? 0} min={0} max={360}
          change={(angle) => setGradient({ angle })} />
      </> : <ColorField label={s.color} value={fill} change={(value) => set({ fill: { type: 'solid', color: withAlpha(value, alpha(fill)) } })} />}
      <NumberField label={s.opacity} value={alpha(gradient ? from : fill)} min={0} max={1} step={0.01}
        change={(opacity) => gradient ? setGradient({ from: withAlpha(from, opacity), to: withAlpha(to, opacity) })
          : set({ fill: { type: 'solid', color: withAlpha(fill, opacity) } })} />
    </fieldset>
    <Effect label={s.stroke} value={style.stroke} defaults={defaults.stroke} disabled={locked}
      change={(stroke) => set({ stroke })} fields={{ width: [s.width, 0, 100, 1] }} />
    <Effect label={s.shadow} value={style.shadow} defaults={defaults.shadow} disabled={locked}
      change={(shadow) => set({ shadow })} fields={{ blur: [s.blur, 0, 100, 1],
        offsetX: [s.offsetX, -200, 200, 1], offsetY: [s.offsetY, -200, 200, 1], opacity: [s.opacity, 0, 1, 0.01] }} />
    <Effect label={s.glow} value={style.glow} defaults={defaults.glow} disabled={locked}
      change={(glow) => set({ glow })} fields={{ blur: [s.blur, 0, 100, 1] }} />
    <Effect label={s.backgroundBox} value={style.background} defaults={defaults.background} disabled={locked}
      change={(background) => set({ background })} fields={{ opacity: [s.opacity, 0, 1, 0.01],
        padding: [s.padding, 0, 120, 1], radius: [s.radius, 0, 120, 1] }} />
    <fieldset disabled={locked}>
      <legend>{s.transform}</legend>
      {([
        ['x', s.positionX, 0, 1, 0.01], ['y', s.positionY, 0, 1, 0.01],
        ['scale', s.scale, 0.05, 20, 0.01], ['rotation', s.rotation, -3600, 3600, 1],
        ['opacity', s.opacity, 0, 1, 0.01],
      ] as const).map(([key, label, min, max, step]) =>
        <NumberField key={key} label={label} min={min} max={max} step={step} value={transform[key]}
          change={(value) => move(key, value)} />)}
    </fieldset>
    <fieldset disabled={locked}>
      <legend>{s.animation}</legend>
      <Choice label={s.enter} value={style.animationIn ?? 'none'} values={['none', 'fade', 'slideUp', 'pop']}
        change={(animationIn) => set({ animationIn })} />
      <Choice label={s.exit} value={style.animationOut ?? 'none'} values={['none', 'fade', 'slideDown']}
        change={(animationOut) => set({ animationOut })} />
      <label>{s.animationDuration}<input type="range" min={0.05} max={5} step={0.05}
        value={style.animationDuration ?? 0.4} onChange={(event) => set({ animationDuration: event.target.valueAsNumber })} />
        <span className="muted">{style.animationDuration ?? 0.4}{s.seconds}</span>
      </label>
    </fieldset>
    <fieldset disabled={locked}>
      <legend>{s.presets}</legend>
      <div className="style-presets">{Object.entries(builtInStyles).map(([key, value]) =>
        <button key={key} onClick={() => apply(value)}>{s.styleNames[key]}</button>)}</div>
      <button onClick={() => edit((draft) => { (draft.textPresets ??= []).push({ ...style }); })}>{s.saveStyle}</button>
      {project.textPresets?.map((preset, index) =>
        <button key={index} onClick={() => apply(preset)}>{s.savedStyle} {index + 1}</button>)}
    </fieldset>
  </aside>;
}

function Choice<T extends keyof typeof s>({ label, value, values, change }: {
  label: string; value: T; values: T[]; change(value: T): void;
}) {
  return <label>{label}<select value={value} onChange={(event) => change(values[event.target.selectedIndex])}>
    {values.map((item) => <option value={item} key={item}>{String(s[item])}</option>)}
  </select></label>;
}

function Toggle({ label, checked, change }: { label: ReactNode; checked: boolean; change(value: boolean): void }) {
  return <label className="toggle-field"><input type="checkbox" checked={checked}
    onChange={(event) => change(event.target.checked)} />{label}</label>;
}

function NumberField({ label, value, min, max, step = 1, change }: {
  label: string; value: number; min: number; max: number; step?: number; change(value: number): void;
}) {
  return <label>{label}<input key={value} type="number" defaultValue={Number(value.toFixed(3))} min={min} max={max}
    step={step} onBlur={(event) => {
      const next = event.target.valueAsNumber;
      if (Number.isFinite(next) && next >= min && next <= max && next !== value) change(next);
      else event.target.value = String(Number(value.toFixed(3)));
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

function hex(value: string | undefined) { return value?.match(/^#[\da-f]{6}/i)?.[0] ?? '#000000'; }
function alpha(value: string) {
  return /^#[\da-f]{8}$/i.test(value) ? Number((parseInt(value.slice(7), 16) / 255).toFixed(2)) : 1;
}
function withAlpha(value: string, opacity: number) {
  return hex(value) + (opacity === 1 ? '' : Math.round(opacity * 255).toString(16).padStart(2, '0'));
}

function ColorField({ label, value, change }: { label: string; value?: string; change(value: string): void }) {
  return <label>{label}<input type="color" value={hex(value)} onChange={(event) => change(event.target.value)} /></label>;
}

function Effect({ label, value, defaults: initial, fields, disabled, change }: {
  label: string; value?: { color?: string; [key: string]: unknown };
  defaults: { color: string; [key: string]: number | string };
  fields: Record<string, [string, number, number, number]>;
  disabled?: boolean; change(value: { color?: string; [key: string]: unknown } | undefined): void;
}) {
  return <fieldset disabled={disabled}>
    <legend>{label}</legend>
    <Toggle label={s.enabled} checked={!!value} change={(enabled) => change(enabled ? initial : undefined)} />
    {value && <>
      <ColorField label={s.color} value={value.color ?? initial.color} change={(color) => change({ ...value, color })} />
      {Object.entries(fields).map(([key, [label, min, max, step]]) =>
        <NumberField key={key} label={label} value={Number(value[key] ?? initial[key])} min={min} max={max} step={step}
          change={(next) => change({ ...value, [key]: next })} />)}
    </>}
  </fieldset>;
}
