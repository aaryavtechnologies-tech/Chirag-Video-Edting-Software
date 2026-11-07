import { useState, type ReactNode } from 'react';
import { strings as s } from '../../lib/strings';
import { builtInStyles } from '../../lib/textPresets';
import { bundledFonts } from '../../text/fontCatalog';
import { FontPicker } from '../../text/FontPicker';
import { TextLayerControls } from '../../text/TextLayerControls';
import { textStyleSchema } from '../../lib/schema';
import { AnimationInspector } from '../../animation/AnimationInspector';
import { ColorPicker } from '../../design-system/ColorPicker';
import { entrances, exits } from '../../lib/textMotion';
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

export function TextInspector({ clip, project, edit, previewAnimation }: {
  clip: Clip; project: Project; edit: Edit; previewAnimation(): void;
}) {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontError, setFontError] = useState(false);
  const [fontPicker, setFontPicker] = useState(false);
  const [tab, setTab] = useState<'basic' | 'styles' | 'position' | 'animation'>('styles');
  const [presetName, setPresetName] = useState('');
  const [presetError, setPresetError] = useState(false);
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
    <div className="inspector-tabs">
      {(['basic', 'styles', 'position', 'animation'] as const).map((item) =>
        <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{s[item]}</button>)}
    </div>
    <fieldset disabled={locked} hidden={tab !== 'animation'}>
      <legend>{s.animation}</legend>
      <details open={!!clip.animation} className="style-layers">
        <summary>{s.advancedAnimation}</summary>
        {tab === 'animation' && <AnimationInspector value={clip.animation} change={(animation) => change((item) => {
          const duration = Math.max(0.1, Math.min(3, item.style?.animationDuration ?? 0.4));
          item.animation = {
            in: item.style?.animationIn ? { preset: item.style.animationIn, duration } : undefined,
            out: item.style?.animationOut ? { preset: item.style.animationOut, duration } : undefined,
            ...animation,
          };
        })} />}
      </details>
      {!clip.animation && <>
      <Choice label={s.enter} value={style.animationIn ?? 'none'} values={entrances}
        change={(animationIn) => set({ animationIn })} />
      <Choice label={s.exit} value={style.animationOut ?? 'none'} values={exits}
        change={(animationOut) => set({ animationOut })} />
      <label>{s.animationDuration}<input type="range" min={0.05} max={5} step={0.05}
        value={style.animationDuration ?? 0.4} onChange={(event) => set({ animationDuration: event.target.valueAsNumber })} />
        <span className="muted">{style.animationDuration ?? 0.4}{s.seconds}</span>
      </label>
      </>}
      <button onClick={previewAnimation} disabled={clip.animation ?
        ![clip.animation.in, clip.animation.out, clip.animation.loop].some((slot) => slot && slot.preset !== 'none') :
        (!style.animationIn || style.animationIn === 'none') && (!style.animationOut || style.animationOut === 'none')}>{s.previewAnimation}</button>
    </fieldset>
    <fieldset disabled={locked} hidden={tab !== 'styles'}>
      <legend>{s.presets}</legend>
      <div className="style-presets">{Object.entries(builtInStyles).map(([key, value]) => {
        const gradient = value.fill?.gradient;
        return <button key={key} aria-label={s.styleNames[key]} onClick={() => apply({
          animationIn: style.animationIn, animationOut: style.animationOut, animationDuration: style.animationDuration,
          ...value,
        })}>
          <span aria-hidden="true" className="preset-swatch" style={{
            backgroundColor: value.background?.color,
            color: gradient ? 'transparent' : value.fill?.color ?? '#ffffff',
            fontFamily: value.fontFamily, fontWeight: value.bold ? 700 : 400,
            fontStyle: value.italic ? 'italic' : 'normal',
            backgroundImage: gradient ? `linear-gradient(${(gradient.angle ?? 0) + 90}deg, ${gradient.from}, ${gradient.to})` : undefined,
            backgroundClip: gradient ? 'text' : undefined,
            textShadow: value.glow?.color ? `0 0 6px ${value.glow.color}` : undefined,
          }}>{s.styleSample}</span>
          {s.styleNames[key]}
        </button>;
      })}</div>
      <label>{s.presetName}<input value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={80} /></label>
      <button onClick={() => edit((draft) => {
        const presets = draft.textPresets ?? (draft.textPresets = []);
        presets.push({ ...style, presetName: presetName.trim() || s.savedStyle + ' ' + (presets.length + 1) });
      })}>{s.saveStyle}</button>
      {project.textPresets?.map((preset, index) =>
        <div className="grid gap-1" key={index}>
          <button onClick={() => apply(preset)}>{preset.presetName ?? s.savedStyle + ' ' + (index + 1)}</button>
          <div className="flex gap-1">
            <button disabled={!presetName.trim()} onClick={() => edit((draft) => {
              if (draft.textPresets?.[index]) draft.textPresets[index].presetName = presetName.trim();
            })}>{s.rename}</button>
            <button onClick={() => edit((draft) => { draft.textPresets?.splice(index, 1); })}>{s.delete}</button>
          </div>
        </div>)}
      <button onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(style, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = (presetName.trim() || 'style').replace(/[^\p{L}\p{N}._ -]/gu, '_') + '.vstyle';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>{s.exportStyle}</button>
      <label>{s.importStyle}<input type="file" accept=".vstyle" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setPresetError(false);
        void (async () => {
          if (file.size > 1_000_000) throw new Error(s.invalidStyle);
          const preset = textStyleSchema.parse(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
          edit((draft) => { (draft.textPresets ??= []).push({ presetName: file.name.replace(/\.vstyle$/i, ''), ...preset }); });
          apply(preset);
        })().catch(() => setPresetError(true));
      }} /></label>
      {presetError && <p className="error" role="alert">{s.invalidStyle}</p>}
    </fieldset>
    <fieldset disabled={locked} hidden={tab !== 'basic'}>
      <legend>{s.content}</legend>
      <label>{s.text}<textarea key={clip.text} defaultValue={clip.text} rows={3} maxLength={5000}
        onBlur={(event) => change((item) => { item.text = event.target.value; })} /></label>
      <Choice label={s.alignment} value={style.align ?? 'center'} values={['left', 'center', 'right']}
        change={(align) => set({ align })} />
      <NumberField label={s.lineHeight} value={style.lineHeight ?? 1.2} min={0.5} max={4} step={0.05}
        change={(lineHeight) => set({ lineHeight })} />
      <NumberField label={s.letterSpacing} value={style.letterSpacing ?? 0} min={-100} max={100}
        change={(letterSpacing) => set({ letterSpacing })} />
      <NumberField label={s.wordSpacing} value={style.wordSpacing ?? 0} min={-40} max={150}
        change={(wordSpacing) => set({ wordSpacing })} />
      <Choice label={s.direction} value={style.direction ?? 'auto'} values={['auto', 'ltr', 'rtl']}
        change={(direction) => set({ direction })} />
      <NumberField label={s.boxWidth} value={style.boxWidth ?? 0} min={0} max={7680} change={(boxWidth) => set({ boxWidth })} />
      <NumberField label={s.boxHeight} value={style.boxHeight ?? 0} min={0} max={7680} change={(boxHeight) => set({ boxHeight })} />
      <Choice label={s.verticalAlign} value={style.verticalAlign ?? 'top'} values={['top', 'middle', 'bottom']}
        change={(verticalAlign) => set({ verticalAlign })} />
    </fieldset>
    <fieldset disabled={locked} hidden={tab !== 'basic'}>
      <legend>{s.font}</legend>
      <label>{s.fontFamily}<input key={style.fontFamily} defaultValue={style.fontFamily ?? 'Inter'}
        list="editor-fonts" onBlur={(event) => set({ fontFamily: event.target.value.trim() || 'Inter' })}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        <datalist id="editor-fonts">{[...new Set([...bundledFonts, ...systemFonts])].map((family) =>
          <option key={family} value={family} />)}</datalist>
      </label>
      <button onClick={() => setFontPicker(true)}>{s.chooseFont}</button>
      <button onClick={() => void queryFonts()}>{s.systemFonts}</button>
      {fontError && <p className="muted">{s.fontUnavailable}</p>}
      <NumberField label={s.fontSize} value={style.fontSize ?? 64} min={1} max={1024}
        change={(fontSize) => set({ fontSize })} />
      {(['bold', 'italic', 'underline', 'uppercase'] as const).map((key) =>
        <Toggle key={key} label={s[key]} checked={!!style[key]} change={(value) => set({ [key]: value })} />)}
    </fieldset>
    <fieldset disabled={locked} hidden={tab !== 'styles'}>
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
    <div hidden={tab !== 'styles'}>
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
      <TextLayerControls style={style} set={set} />
      <NumberField label={s.outlineOffset} value={style.outlineOffset ?? 0} min={0} max={50}
        change={(outlineOffset) => set({ outlineOffset })} />
      <NumberField label={s.curve} value={style.curve ?? 0} min={-100} max={100} change={(curve) => set({ curve })} />
    </fieldset>
    </div>
    <fieldset disabled={locked} hidden={tab !== 'position'}>
      <legend>{s.transform}</legend>
      {([
        ['x', s.positionX, 0, 1, 0.01], ['y', s.positionY, 0, 1, 0.01],
        ['scale', s.scale, 0.05, 20, 0.01], ['rotation', s.rotation, -3600, 3600, 1],
        ['opacity', s.opacity, 0, 1, 0.01],
      ] as const).map(([key, label, min, max, step]) =>
        <NumberField key={key} label={label} min={min} max={max} step={step} value={transform[key]}
          change={(value) => move(key, value)} />)}
    </fieldset>
    {fontPicker && <FontPicker text={clip.text ?? ''} select={(fontFamily) => set({ fontFamily })} close={() => setFontPicker(false)} />}
  </aside>;
}

function Choice<T extends keyof typeof s>({ label, value, values, change }: {
  label: string; value: T; values: readonly T[]; change(value: T): void;
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
  return <ColorPicker label={label} value={hex(value)} change={change} />;
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
