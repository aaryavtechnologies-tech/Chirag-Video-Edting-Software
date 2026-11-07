import { useState } from 'react';
import { Pipette } from 'lucide-react';
import { strings as s } from '../lib/strings';
import { Modal } from '../app/Modal';

const defaults = ['#ffffff', '#101114', '#f36d83', '#ffc857', '#56e3ba', '#59b7ff', '#a786ff', '#ea8cff'];
const hexColor = (value: string) => /^#[\da-f]{6}$/i.test(value);
function stored(key: string) {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && hexColor(value)) : [];
  } catch { return []; }
}
function toHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const hue = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(hue * 60), Math.round(max ? d / max * 100 : 0), Math.round(max * 100)];
}
function toHex(h: number, s: number, v: number) {
  const value = v / 100;
  const saturation = s / 100;
  const channel = (step: number) => {
    const k = (step + h / 60) % 6;
    return Math.round(value * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, '0');
  };
  return '#' + channel(5) + channel(3) + channel(1);
}

export function ColorPicker({ label, value, change }: { label: string; value: string; change(value: string): void }) {
  const safe = hexColor(value) ? value : '#000000';
  const [open, setOpen] = useState(false);
  return <div className="color-field">
    <label>{label}<input type="color" value={safe} onChange={(event) => change(event.target.value)} /></label>
    <button type="button" onClick={() => setOpen(true)}>{s.colorDetails}</button>
    {open && <ColorDetails label={label} value={safe} change={change} close={() => setOpen(false)} />}
  </div>;
}

function ColorDetails({ label, value, change, close }: {
  label: string; value: string; change(value: string): void; close(): void;
}) {
  const [hex, setHex] = useState(value);
  const [hsv, setHsv] = useState(() => toHsv(value));
  const [palette, setPalette] = useState(() => stored('editor-palette'));
  const recent = stored('editor-recent-colors');
  const picker = (window as Window & { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
  const apply = (color: string) => { setHex(color); setHsv(toHsv(color)); };
  const swatches = (colors: string[]) => <div className="color-swatches">
    {colors.map((color) => <button key={color} aria-label={color} style={{ background: color }} onClick={() => apply(color)} />)}
  </div>;
  return <Modal title={label} close={close} busy={false}>
    <div className="grid gap-2 mt-2">
      <label>{s.hexColor}<input value={hex} onChange={(event) => {
        const text = event.target.value;
        if (hexColor(text)) apply(text);
        else setHex(text);
      }} /></label>
      {[s.hue, s.colorSaturation, s.colorValue].map((field, index) => <label key={field}>{field}
        <div className="grid grid-cols-2 gap-1"><input type="range" min={0} max={index === 0 ? 360 : 100}
          value={hsv[index]} aria-label={field} onChange={(event) => {
            const values = [...hsv];
            values[index] = event.target.valueAsNumber;
            setHsv(values);
            setHex(toHex(values[0], values[1], values[2]));
          }} /><output>{hsv[index]}</output></div>
      </label>)}
      {picker && <button onClick={() => void new picker().open().then((picked) => apply(picked.sRGBHex)).catch(() => undefined)}>
        <Pipette size={15} className="inline" aria-hidden /> {s.eyedropper}
      </button>}
      {swatches(defaults)}
      {!!recent.length && <><p>{s.recentColors}</p>{swatches(recent)}</>}
      <p>{s.savedPalette}</p>{swatches(palette)}
      <button disabled={!hexColor(hex) || palette.includes(hex)} onClick={() => {
        const next = [...palette, hex].slice(-24);
        setPalette(next);
        localStorage.setItem('editor-palette', JSON.stringify(next));
      }}>{s.saveColor}</button>
      <button className="primary" disabled={!hexColor(hex)} onClick={() => {
        localStorage.setItem('editor-recent-colors', JSON.stringify([hex, ...recent.filter((color) => color !== hex)].slice(0, 12)));
        change(hex);
        close();
      }}>{s.save}</button>
    </div>
  </Modal>;
}
