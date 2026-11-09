import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Copy, Pipette, Plus } from 'lucide-react';
import { IconButton } from './IconButton';
import { Segmented } from './Controls';
import { strings as s } from '../lib/strings';

const defaults = [
  '#ffffff', '#f4f4f5', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#27272a', '#101114',
  '#fecdd3', '#fb7185', '#e11d48', '#991b1b', '#ffedd5', '#fb923c', '#ea580c', '#9a3412',
  '#fef9c3', '#facc15', '#ca8a04', '#854d0e', '#dcfce7', '#4ade80', '#16a34a', '#166534',
  '#ccfbf1', '#2dd4bf', '#0d9488', '#115e59', '#cffafe', '#22d3ee', '#0284c7', '#164e63',
  '#dbeafe', '#60a5fa', '#2563eb', '#1e3a8a', '#ede9fe', '#a78bfa', '#7c3aed', '#581c87',
];
export const ProjectColors = createContext<readonly string[]>([]);
const hexColor = (value: string, alpha = true) => (alpha ? /^#[\da-f]{6}([\da-f]{2})?$/i : /^#[\da-f]{6}$/i).test(value);
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
const byte = (value: number) => Math.round(value).toString(16).padStart(2, '0');
const rgb = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
function stored(key: string) {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && hexColor(value)) : [];
  } catch { return []; }
}
function toHsv(hex: string) {
  const [r, g, b] = rgb(hex).map((channel) => channel / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const hue = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(hue * 60), Math.round(max ? d / max * 100 : 0), Math.round(max * 100)];
}
function toHex(h: number, s: number, v: number) {
  const value = v / 100;
  const saturation = s / 100;
  const channel = (step: number) => {
    const k = (step + h / 60) % 6;
    return byte(value * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return '#' + channel(5) + channel(3) + channel(1);
}

export function ColorPicker({ label, value, change, alpha = true }: {
  label: string; value: string; change(value: string): void; alpha?: boolean;
}) {
  const safe = hexColor(value, alpha) ? value : '#000000';
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="color-field">
    <span>{label}</span>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><button ref={trigger} className="color-trigger" type="button" aria-label={label}>
        <span className="color-chip"><i style={{ background: safe }} /></span>{safe.toUpperCase()}
      </button></Dialog.Trigger>
      {open && <ColorDetails label={label} value={safe} alpha={alpha} anchor={trigger}
        change={change} close={() => setOpen(false)} />}
    </Dialog.Root>
  </div>;
}

function ColorDetails({ label, value, alpha, anchor, change, close }: {
  label: string; value: string; alpha: boolean; anchor: RefObject<HTMLElement>; change(value: string): void; close(): void;
}) {
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [hex, setHex] = useState(value);
  const [hsv, setHsv] = useState(() => toHsv(value));
  const [opacity, setOpacity] = useState(() => value.length === 9 ? parseInt(value.slice(7), 16) : 255);
  const [mode, setMode] = useState<'HEX' | 'RGB' | 'HSL'>('HEX');
  const [palette, setPalette] = useState(() => stored('editor-palette'));
  const [recent] = useState(() => stored('editor-recent-colors'));
  const colors = useContext(ProjectColors);
  const picker = (window as Window & { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
  const [h, saturation, brightness] = hsv;
  const lightness = brightness * (1 - saturation / 200);
  const hsl = [h, lightness === 0 || lightness === 100 ? 0 :
    Math.round((brightness - lightness) / Math.min(lightness, 100 - lightness) * 100), Math.round(lightness)];
  const channels = mode === 'RGB' ? rgb(hexColor(hex, alpha) ? hex : toHex(h, saturation, brightness)) : hsl;

  useLayoutEffect(() => {
    function position() {
      const trigger = anchor.current?.getBoundingClientRect();
      if (!content || !trigger) return;
      const { offsetWidth: width, offsetHeight: height } = content;
      content.style.left = Math.max(8, Math.min(trigger.right - width, window.innerWidth - width - 8)) + 'px';
      const below = trigger.bottom + 6;
      const above = trigger.top - height - 6;
      const top = below + height <= window.innerHeight - 8 ? below : above;
      content.style.top = Math.max(8, Math.min(top, window.innerHeight - height - 8)) + 'px';
    }
    position();
    const observer = new ResizeObserver(position);
    if (content) observer.observe(content);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [anchor, content]);

  function fromHsv(next: number[], opacityByte = opacity) {
    setHsv(next);
    setOpacity(opacityByte);
    setHex(toHex(next[0], next[1], next[2]) + (alpha && opacityByte < 255 ? byte(opacityByte) : ''));
  }
  function apply(color: string) {
    const accepted = (alpha ? color : color.slice(0, 7)).toLowerCase();
    setHex(accepted);
    setHsv(toHsv(accepted));
    setOpacity(accepted.length === 9 ? parseInt(accepted.slice(7), 16) : 255);
  }
  function updateChannel(index: number, channel: number) {
    const next = [...channels];
    next[index] = channel;
    if (mode === 'RGB') apply('#' + next.map(byte).join('') + (alpha && opacity < 255 ? byte(opacity) : ''));
    else {
      const [hue, sat, light] = next;
      const v = light + sat * Math.min(light, 100 - light) / 100;
      fromHsv([hue, v ? 200 * (1 - light / v) : 0, v]);
    }
  }
  const swatches = (title: string, colors: readonly string[]) => colors.length > 0 && <section>
    <h4>{title}</h4>
    <div className="color-swatches">{colors.map((color) => <button key={color} type="button" className="color-chip"
      aria-label={color} title={color} onClick={() => apply(color)}><i style={{ background: color }} /></button>)}</div>
  </section>;
  const valid = hexColor(hex, alpha);
  return <Dialog.Portal><Dialog.Content ref={setContent} className="color-popover" aria-describedby={undefined}>
    <Dialog.Title className="sr-only">{label}</Dialog.Title>
    <div role="group" aria-label={s.colorPlane} tabIndex={0} className="color-plane" style={{ '--hue': h } as CSSProperties}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const bounds = event.currentTarget.getBoundingClientRect();
        fromHsv([h, clamp((event.clientX - bounds.left) * 100 / bounds.width, 100),
          clamp((bounds.bottom - event.clientY) * 100 / bounds.height, 100)]);
      }} onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        fromHsv([h, clamp((event.clientX - bounds.left) * 100 / bounds.width, 100),
          clamp((bounds.bottom - event.clientY) * 100 / bounds.height, 100)]);
      }} onKeyDown={(event) => {
        if (!event.key.startsWith('Arrow')) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 10 : 1;
        const x = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
        const y = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
        fromHsv([h, clamp(saturation + x, 100), clamp(brightness + y, 100)]);
      }}>
      <i style={{ left: saturation + '%', top: (100 - brightness) + '%' }} />
    </div>
    <input type="range" aria-label={s.hue} className="color-hue" min={0} max={360} value={h}
      onChange={(event) => fromHsv([event.target.valueAsNumber, saturation, brightness])} />
    {alpha && <input type="range" className="color-alpha" aria-label={s.opacity} min={0} max={255} value={opacity}
      style={{ '--solid-color': toHex(h, saturation, brightness) } as CSSProperties}
      onChange={(event) => fromHsv(hsv, event.target.valueAsNumber)} />}
    <Segmented label={s.colorFormat}>
      {(['HEX', 'RGB', 'HSL'] as const).map((item) => <button type="button" key={item} aria-pressed={mode === item}
        onClick={() => setMode(item)}>{item}</button>)}
    </Segmented>
    <div className="color-values">
      {mode === 'HEX' ? <input aria-label={s.hexColor} value={hex} maxLength={alpha ? 9 : 7} onChange={(event) => {
        if (hexColor(event.target.value, alpha)) apply(event.target.value);
        else setHex(event.target.value);
      }} /> : channels.map((channel, index) => {
        const max = mode === 'RGB' ? 255 : index === 0 ? 360 : 100;
        const name = (mode === 'RGB' ? s.rgbChannels : s.hslChannels)[index];
        return <input key={mode + index + channel} aria-label={name} title={name} type="number"
          min={0} max={max} defaultValue={channel} onBlur={(event) => {
            const next = event.target.valueAsNumber;
            if (Number.isFinite(next) && next !== channel) updateChannel(index, clamp(next, max));
            else event.target.value = String(channel);
          }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
      })}
      {picker && <IconButton label={s.eyedropper} onClick={() => void new picker().open()
        .then((picked) => apply(picked.sRGBHex)).catch(() => undefined)}><Pipette size={15} /></IconButton>}
      <IconButton label={s.copy} disabled={!valid} onClick={() => void navigator.clipboard.writeText(hex).catch(() => undefined)}>
        <Copy size={15} />
      </IconButton>
    </div>
    {swatches(s.recentColors, recent)}
    {swatches(s.projectColors, colors)}
    {swatches(s.presets, defaults)}
    {swatches(s.savedPalette, palette)}
    <footer>
      <IconButton label={s.saveColor} disabled={!valid || palette.includes(hex)} onClick={() => {
        const next = [...palette, hex].slice(-24);
        setPalette(next);
        localStorage.setItem('editor-palette', JSON.stringify(next));
      }}><Plus size={16} /></IconButton>
      <button type="button" className="primary" disabled={!valid} onClick={() => {
        localStorage.setItem('editor-recent-colors', JSON.stringify([hex, ...recent.filter((color) => color !== hex)].slice(0, 12)));
        if (hex !== value.toLowerCase()) change(hex);
        close();
      }}>{s.applyColor}</button>
    </footer>
  </Dialog.Content></Dialog.Portal>;
}
