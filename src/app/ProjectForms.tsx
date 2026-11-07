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

export function NewProjectForm({ preferences, onCreate, onFolder, busy }: {
  preferences: Preferences; onCreate(value: NewProject): void;
  onFolder(current: string, change: (folder: string) => void): void; busy: boolean;
}) {
  const [name, setName] = useState(s.defaultName);
  const [ratio, setRatio] = useState<keyof typeof ratios | 'custom'>('16:9');
  const [resolution, setResolution] = useState<keyof typeof resolutions>('1080p');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState<ProjectSettings['fps']>(30);
  const [background, setBackground] = useState('#000000');
  const [folder, setFolder] = useState(preferences.folder);
  const dimensions = ratio === 'custom' ? { width, height } : projectDimensions(ratio, resolution);

  return <form onSubmit={(event) => {
    event.preventDefault();
    onCreate({ name, folder, settings: { ...dimensions, fps, background, sampleRate: 48000 } });
  }}>
    <fieldset disabled={busy}>
      <label>{s.name}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></label>
      <div className="grid grid-cols-2 gap-4">
        <label>{s.aspect}<select value={ratio} onChange={(e) => setRatio(e.target.value as typeof ratio)}>
          {Object.keys(ratios).map((value) => <option key={value}>{value}</option>)}
          <option value="custom">{s.custom}</option>
        </select></label>
        <label>{s.resolution}<select value={resolution} disabled={ratio === 'custom'}
          onChange={(e) => setResolution(e.target.value as typeof resolution)}>
          {Object.keys(resolutions).map((value) => <option key={value}>{value}</option>)}
        </select></label>
        {ratio === 'custom' && <>
          <label>{s.width}<input type="number" min={16} max={3840} step={2} required value={width || ''}
            onChange={(e) => setWidth(e.target.valueAsNumber)} /></label>
          <label>{s.height}<input type="number" min={16} max={3840} step={2} required value={height || ''}
            onChange={(e) => setHeight(e.target.valueAsNumber)} /></label>
        </>}
        <label>{s.frameRate}<select value={fps} onChange={(e) => setFps(frameRates[e.target.selectedIndex])}>
          {frameRates.map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label>{s.background}<input type="color" value={background} onChange={(e) => setBackground(e.target.value)} /></label>
      </div>
      <p className="muted">{dimensions.width} × {dimensions.height}</p>
      <FolderField label={s.location} folder={folder} onPick={() => onFolder(folder, setFolder)} />
      <button className="primary justify-self-end">{s.create}</button>
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
      <label>{s.theme}<select value={value.theme}
        onChange={(e) => setValue({ ...value, theme: e.target.value === 'light' ? 'light' : 'dark' })}>
        <option value="dark">{s.dark}</option><option value="light">{s.light}</option>
      </select></label>
      <label>{s.autosave}<input type="number" min={5} max={3600} required value={value.autosave || ''}
        onChange={(e) => setValue({ ...value, autosave: e.target.valueAsNumber })} /></label>
      <button className="primary justify-self-end">{s.save}</button>
    </fieldset>
  </form>;
}
