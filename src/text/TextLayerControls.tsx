import { Select } from '../design-system/Select';
import { strings as s } from '../lib/strings';
import type { TextStyle } from '../types/project';

type LayerKey = 'fills' | 'strokes' | 'shadows';

function NumberInput({ label, value, min, max, step = 1, change }: {
  label: string; value: number; min: number; max: number; step?: number; change(value: number): void;
}) {
  return <label>{label}<input type="number" min={min} max={max} step={step} defaultValue={value}
    key={value} onBlur={(event) => {
      const next = event.target.valueAsNumber;
      if (Number.isFinite(next)) change(Math.max(min, Math.min(max, next)));
    }} /></label>;
}

function ColorInput({ label = s.color, value, change }: { label?: string; value?: string; change(value: string): void }) {
  return <label>{label}<input type="color" value={/^#[\da-f]{6}$/i.test(value ?? '') ? value : '#ffffff'}
    onChange={(event) => change(event.target.value)} /></label>;
}

export function TextLayerControls({ style, set }: { style: TextStyle; set(value: Partial<TextStyle>): void }) {
  const counts: Record<LayerKey, number> = { fills: 3, strokes: 3, shadows: 4 };
  const groups = {
    fills: style.fills ?? (style.fill ? [style.fill] : []),
    strokes: style.strokes ?? (style.stroke ? [style.stroke] : []),
    shadows: style.shadows ?? (style.shadow ? [style.shadow] : []),
  };
  function add(key: LayerKey) {
    const layer = key === 'fills' ? { type: 'solid', color: '#ffffff' } :
      key === 'strokes' ? { color: '#000000', width: 3, alignment: 'outside' } :
      { color: '#000000', blur: 8, offsetX: 2, offsetY: 4 };
    set({ [key]: [...groups[key], layer] });
  }
  function update(key: LayerKey, index: number, patch: object) {
    set({ [key]: groups[key].map((layer, layerIndex) => layerIndex === index ? { ...layer, ...patch } : layer) });
  }

  return <>
    {(['fills', 'strokes', 'shadows'] as const).map((key) => <details className="style-layers" key={key}>
      <summary>{key === 'fills' ? s.fillLayers : key === 'strokes' ? s.strokeLayers : s.shadowLayers}</summary>
      {groups[key].map((layer, index) => <fieldset key={index}>
        <legend>{index + 1}</legend>
        <ColorInput value={layer.color} change={(color) => update(key, index, { color })} />
        {key === 'fills' && (() => {
          const fill = groups.fills[index];
          const gradient = fill.gradient ?? {};
          const stops = gradient.stops ?? [{ offset: 0, color: gradient.from ?? '#ffffff' }, { offset: 1, color: gradient.to ?? '#8b7bff' }];
          return <>
            <label>{s.fillType}<Select label={s.fillType} value={fill.type ?? 'solid'}
              onChange={(event) => update(key, index, { type: event.target.value })}>
              <option value="solid">{s.solid}</option><option value="gradient">{s.gradient}</option>
            </Select></label>
            {fill.type === 'gradient' && <>
              <label>{s.gradientKind}<Select label={s.gradientKind} value={gradient.kind ?? 'linear'}
                onChange={(event) => update(key, index, { gradient: { ...gradient, kind: event.target.value } })}>
                <option value="linear">{s.linear}</option><option value="radial">{s.radial}</option>
              </Select></label>
              {stops.map((stop, stopIndex) => <div className="grid grid-cols-2 gap-1" key={stopIndex}>
                <ColorInput label={s.gradientStop + ' ' + (stopIndex + 1)} value={stop.color}
                  change={(color) => update(key, index, { gradient: { ...gradient,
                    stops: stops.map((entry, i) => i === stopIndex ? { ...entry, color } : entry),
                  } })} />
                <NumberInput label={s.stopPosition} value={stop.offset} min={0} max={1} step={0.05}
                  change={(offset) => update(key, index, { gradient: { ...gradient,
                    stops: stops.map((entry, i) => i === stopIndex ? { ...entry, offset } : entry),
                  } })} />
              </div>)}
              <button disabled={stops.length >= 4} onClick={() => update(key, index, { gradient: {
                ...gradient, stops: [...stops, { offset: 0.5, color: '#ffffff' }],
              } })}>{s.gradientStop} +</button>
            </>}
            <NumberInput label={s.layerOpacity} value={fill.opacity ?? 1} min={0} max={1} step={0.05}
              change={(opacity) => update(key, index, { opacity })} />
          </>;
        })()}
        {key === 'strokes' && <>
          <NumberInput label={s.width} value={groups.strokes[index].width ?? 3} min={0} max={100}
            change={(width) => update(key, index, { width })} />
          <label>{s.alignment}<Select label={s.alignment} value={groups.strokes[index].alignment ?? 'center'}
            onChange={(event) => update(key, index, { alignment: event.target.value })}>
            <option value="outside">{s.outside}</option><option value="center">{s.center}</option><option value="inside">{s.inside}</option>
          </Select></label>
        </>}
        {key === 'shadows' && <>
          {([
            ['blur', s.blur, 8, 0, 100, 1], ['offsetX', s.offsetX, 2, -200, 200, 1],
            ['offsetY', s.offsetY, 4, -200, 200, 1], ['opacity', s.opacity, 0.7, 0, 1, 0.05],
          ] as const).map(([field, label, fallback, min, max, step]) =>
            <NumberInput key={field} label={label} value={groups.shadows[index][field] ?? fallback}
              min={min} max={max} step={step} change={(value) => update(key, index, { [field]: value })} />)}
        </>}
        <button onClick={() => set({
          [key]: groups[key].filter((_, item) => item !== index),
          ...(groups[key].length === 1 && { [key === 'fills' ? 'fill' : key === 'strokes' ? 'stroke' : 'shadow']: undefined }),
        })}>{s.removeLayer}</button>
      </fieldset>)}
      <button className="mt-2" disabled={groups[key].length >= counts[key]} onClick={() => add(key)}>{s.addLayer}</button>
    </details>)}
    <details className="style-layers"><summary>{s.extrude}</summary>
      <ColorInput value={style.extrude?.color ?? '#202030'} change={(color) => set({ extrude: { ...style.extrude, color } })} />
      <NumberInput label={s.depth} value={style.extrude?.depth ?? 0} min={0} max={50}
        change={(depth) => set({ extrude: { ...style.extrude, depth } })} />
      <NumberInput label={s.angle} value={style.extrude?.angle ?? 45} min={0} max={360}
        change={(angle) => set({ extrude: { ...style.extrude, angle } })} />
    </details>
    <details className="style-layers"><summary>{s.wordStyles}</summary>
      {(style.wordStyles ?? []).map((entry, index) => <div key={index}>
        <NumberInput label={s.wordIndex} value={entry.index + 1} min={1} max={1000}
          change={(word) => set({ wordStyles: style.wordStyles?.map((item, i) => i === index ? { ...item, index: Math.round(word) - 1 } : item) })} />
        <ColorInput value={entry.color}
          change={(color) => set({ wordStyles: style.wordStyles?.map((item, i) => i === index ? { ...item, color } : item) })} />
        <button onClick={() => set({ wordStyles: style.wordStyles?.filter((_, i) => i !== index) })}>{s.removeLayer}</button>
      </div>)}
      <button onClick={() => set({ wordStyles: [...(style.wordStyles ?? []), { index: style.wordStyles?.length ?? 0, color: '#ffd447' }] })}>{s.addLayer}</button>
    </details>
  </>;
}
