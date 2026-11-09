import { Segmented } from '../design-system/Controls';
import { ColorPicker } from '../design-system/ColorPicker';
import { Select } from '../design-system/Select';
import { useState } from 'react';
import { projectDimensions, ratios, resolutions } from '../lib/geometry';
import { frameRates } from '../lib/schema';
import { strings as s } from '../lib/strings';
import type { NewProject, Preferences } from '../types/desktop';
import type { ProjectSettings } from '../types/project';

export function FolderField({ label, folder, onPick }: {
  label: string; folder: string; onPick(): void;
}) {
  return <label>{label}
    <span className="flex gap-2">
      <input className="min-w-0 flex-1" value={folder} readOnly />
      <button type="button" onClick={onPick}>{s.browse}</button>
    </span>
  </label>;
}

export function NewProjectForm({ preferences, onCreate, onFolder, busy, initial, initialRatio, formId }: {
  preferences: Preferences; onCreate(value: NewProject): void;
  onFolder(current: string, change: (folder: string) => void): void; busy: boolean;
  initial?: ProjectSettings; initialRatio?: keyof typeof ratios; formId?: string;
}) {
  const [section, setSection] = useState<'general' | 'canvas' | 'audio'>('canvas');
  const [name, setName] = useState(s.defaultName);
  const [ratio, setRatio] = useState<keyof typeof ratios | 'custom'>(initial ? 'custom' : initialRatio ?? '16:9');
  const [resolution, setResolution] = useState<keyof typeof resolutions>('1080p');
  const [width, setWidth] = useState(initial?.width ?? 1920);
  const [height, setHeight] = useState(initial?.height ?? 1080);
  const [fps, setFps] = useState<ProjectSettings['fps']>(initial?.fps ?? 30);
  const [background, setBackground] = useState(initial?.background ?? '#000000');
  const [folder, setFolder] = useState(preferences.folder);
  const dimensions = ratio === 'custom' ? { width, height } : projectDimensions(ratio, resolution);

  return <form id={formId} onInvalid={() => { if (initial) setSection('canvas'); }} onSubmit={(event) => {
    event.preventDefault();
    onCreate({ name, folder, settings: { sampleRate: 48000, ...initial, ...dimensions, fps, background } });
  }}>
    <fieldset disabled={busy}>
      {initial && <Segmented label={s.projectSettings}>
        {(['general', 'canvas', 'audio'] as const).map((item) => <button type="button" key={item} aria-pressed={section === item}
          onClick={() => setSection(item)}>{s[item]}</button>)}
      </Segmented>}
      {!initial && <label>{s.name}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></label>}
      {!initial && <div className="ratio-cards" aria-label={s.aspect}>
        {(Object.keys(ratios) as (keyof typeof ratios)[]).map((value) => {
          const [x, y] = ratios[value];
          return <button type="button" key={value} aria-pressed={ratio === value} onClick={() => setRatio(value)}>
            <span aria-hidden="true" style={{ width: 32 * x / Math.max(x, y), height: 32 * y / Math.max(x, y) }} />
            {value}
          </button>;
        })}
        <button type="button" aria-pressed={ratio === 'custom'} onClick={() => setRatio('custom')}>
          <span aria-hidden="true" style={{ width: 28, height: 20, borderStyle: 'dashed' }} />{s.custom}
        </button>
      </div>}
      <div className="project-canvas-fields" hidden={!!initial && section !== 'canvas'}>
        {initial && <label>{s.aspect}<Select label={s.aspect} value={ratio} onChange={(e) => setRatio(e.target.value as typeof ratio)}>
          {Object.keys(ratios).map((value) => <option key={value}>{value}</option>)}
          <option value="custom">{s.custom}</option>
        </Select></label>}
        <label>{s.resolution}<Select label={s.resolution} value={resolution} disabled={ratio === 'custom'}
          onChange={(e) => setResolution(e.target.value as typeof resolution)}>
          {Object.keys(resolutions).map((value) => <option key={value}>{value}</option>)}
        </Select></label>
        {ratio === 'custom' && <>
          <label>{s.width}<input type="number" min={16} max={3840} step={2} required value={width || ''}
            onChange={(e) => setWidth(e.target.valueAsNumber)} /></label>
          <label>{s.height}<input type="number" min={16} max={3840} step={2} required value={height || ''}
            onChange={(e) => setHeight(e.target.valueAsNumber)} /></label>
        </>}
        <ColorPicker label={s.background} value={background} alpha={false} change={setBackground} />
      </div>
      {(!initial || section === 'general') && <div>{s.frameRate}<Segmented label={s.frameRate}>
        {frameRates.map((value) => <button type="button" key={value} aria-pressed={fps === value}
          onClick={() => setFps(value)}>{value}</button>)}
      </Segmented></div>}
      {initial && section === 'audio' && <p className="muted">{s.sampleRate} · {initial.sampleRate ?? 48000} Hz</p>}
      <p className="muted">{dimensions.width} × {dimensions.height} · {fps} fps</p>
      {!initial && <FolderField label={s.location} folder={folder} onPick={() => onFolder(folder, setFolder)} />}
      {!formId && <button className="primary justify-self-end">{initial ? s.save : s.create}</button>}
    </fieldset>
  </form>;
}

export function SaveAsForm({ initial, folder: defaultFolder, busy, onSave, onFolder }: {
  initial: string; folder: string; busy: boolean;
  onSave(name: string, folder: string): void;
  onFolder(current: string, change: (folder: string) => void): void;
}) {
  const [name, setName] = useState(initial);
  const [folder, setFolder] = useState(defaultFolder);
  return <form onSubmit={(event) => { event.preventDefault(); onSave(name, folder); }}>
    <fieldset disabled={busy}>
      <label>{s.name}<input value={name} required maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
      <FolderField label={s.location} folder={folder} onPick={() => onFolder(folder, setFolder)} />
      <button className="primary justify-self-end">{s.saveAs}</button>
    </fieldset>
  </form>;
}

export function PreferencesForm({ preferences, onSave, onFolder, busy }: {
  preferences: Preferences; onSave(value: Preferences): void;
  onFolder(current: string, change: (folder: string) => void): void; busy: boolean;
}) {
  const [value, setValue] = useState(preferences);
  return <form onSubmit={(event) => { event.preventDefault(); onSave(value); }}>
    <fieldset disabled={busy}>
      <FolderField label={s.defaultFolder} folder={value.folder}
        onPick={() => onFolder(value.folder, (folder) => setValue({ ...value, folder }))} />
      <label>{s.theme}<Select label={s.theme} value={value.theme}
        onChange={(e) => setValue({ ...value, theme: e.target.value === 'light' ? 'light' : 'dark' })}>
        <option value="dark">{s.dark}</option><option value="light">{s.light}</option>
      </Select></label>
      <label>{s.autosave}<input type="number" min={5} max={3600} required value={value.autosave || ''}
        onChange={(e) => setValue({ ...value, autosave: e.target.valueAsNumber })} /></label>
      <button className="primary justify-self-end">{s.save}</button>
    </fieldset>
  </form>;
}
