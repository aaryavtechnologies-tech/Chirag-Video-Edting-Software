import { useEffect, useState } from 'react';
import { Modal } from '../app/Modal';
import { strings as s } from '../lib/strings';
import { frameRates } from '../lib/schema';
import { projectDuration } from '../timeline/operations';
import type { Project } from '../types/project';
import type { ExportProgress, ExportResult, ExportSettings, TextPng } from '../types/export';
import { loadTextFont, rasterizeText } from '../text/rasteriser';
import { estimateExportBytes, exportPresets, exportSizes, qualityFactors, suggestedBitrate } from './exportPresets';

const videoFormats = { h264: 'MP4 · H.264', hevc: 'MP4 · H.265 / HEVC', vp9: 'WebM · VP9' } as const;
const audioFormats = { mp3: 'MP3', wav: 'WAV', m4a: 'AAC / M4A' } as const;
const even = (size: number) => Math.min(3840, Math.max(16, Math.round(size / 2) * 2));

async function encodePng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(s.exportFailed)), 'image/png'));
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error(s.exportFailed));
    reader.readAsDataURL(blob);
  });
}

async function prepareRasters(project: Project, settings: ExportSettings, cancelled: () => boolean) {
  const rasters: TextPng[] = [];
  if (settings.mode === 'audio') return rasters;
  const scale = Math.min(settings.width / project.settings.width, settings.height / project.settings.height);
  for (const track of project.tracks) {
    if (track.kind !== 'video' || track.hidden) continue;
    for (const clip of track.clips) {
      if (cancelled()) return rasters;
      if (clip.type !== 'text') continue;
      const text = clip.text ?? '';
      await loadTextFont(text, clip.style);
      const png = await encodePng(rasterizeText(text, clip.style, scale));
      rasters.push({ id: clip.id, png });
    }
  }
  return rasters;
}

export function ExportDialog({ project, volume, save, close, onCancelled }: {
  project: Project; volume: number; save(): Promise<void>; close(): void; onCancelled(): void;
}) {
  const total = projectDuration(project);
  const [value, setValue] = useState<ExportSettings>({
    mode: 'video', videoFormat: 'h264', audioFormat: 'mp3', audioBitrate: 320,
    width: even(project.settings.width), height: even(project.settings.height),
    fps: project.settings.fps, bitrate: suggestedBitrate(project.settings.width, project.settings.height, project.settings.fps),
    volume, hardware: true, openFolder: false,
  });
  const [resolution, setResolution] = useState('project');
  const [quality, setQuality] = useState<keyof typeof qualityFactors>('high');
  const [status, setStatus] = useState<'idle' | 'choosing' | 'preparing' | 'rendering'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ExportResult>();
  const [progress, setProgress] = useState<ExportProgress>();
  const [controller, setController] = useState<AbortController>();
  const busy = status !== 'idle';
  const duration = value.range ? value.range.end - value.range.start : total;
  const estimate = Number.isFinite(value.bitrate) ? estimateExportBytes(value, Math.max(0, duration)) : 0;
  const update = (changes: Partial<ExportSettings>) => setValue((current) => ({ ...current, ...changes }));
  const markers = [...new Set([0, ...(project.markers ?? []).map((marker) => marker.time)
    .filter((time) => time >= 0 && time <= total), total])].sort((a, b) => a - b);

  useEffect(() => window.desktop.onExportProgress(setProgress), []);

  async function run() {
    if (!(duration > 0) || busy) return;
    setResult(undefined);
    setProgress(undefined);
    setError('');
    setStatus('choosing');
    const control = new AbortController();
    setController(control);
    try {
      const settings = value.mode === 'audio' && !Number.isFinite(value.bitrate) ? { ...value, bitrate: 10 } : value;
      const file = await window.desktop.chooseExport(settings);
      if (!file) return;
      setStatus('preparing');
      await save();
      const rasters = await prepareRasters(project, settings, () => control.signal.aborted);
      if (control.signal.aborted) { onCancelled(); return; }
      setStatus('rendering');
      const exported = await window.desktop.startExport(settings, file, rasters);
      if (exported.cancelled) onCancelled();
      else setResult(exported);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^.*?Error: /, '') : s.exportFailed);
    } finally {
      setStatus('idle');
      setController(undefined);
    }
  }

  function setSize(key: string) {
    setResolution(key);
    const { width, height } = project.settings;
    const edge = key === 'project' ? Math.min(3840, Math.max(width, height)) : exportSizes[key as keyof typeof exportSizes];
    const nextWidth = even(edge * width / Math.max(width, height));
    const nextHeight = even(edge * height / Math.max(width, height));
    updateVideo(nextWidth, nextHeight, value.fps);
  }

  function updateVideo(width: number, height: number, fps: ExportSettings['fps']) {
    update({ width, height, fps, ...(quality !== 'customBitrate' &&
      { bitrate: Math.round(suggestedBitrate(width, height, fps) * qualityFactors[quality] * 10) / 10 }) });
  }

  function applyPreset(key: keyof typeof exportPresets) {
    const preset = exportPresets[key];
    update(preset);
    if ('width' in preset) {
      setResolution('preset');
      setQuality('high');
    }
  }

  return <Modal title={s.export} busy={busy} close={close}>
    <form onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <fieldset disabled={busy}>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(exportPresets) as (keyof typeof exportPresets)[]).map((key) =>
            <button type="button" key={key} onClick={() => applyPreset(key)}>{s[key]}</button>)}
        </div>
        <label>{s.exportMode}<select value={value.mode} onChange={(event) => update({ mode: event.target.value as ExportSettings['mode'] })}>
          <option value="video">{s.videoAndAudio}</option><option value="audio">{s.audioOnly}</option>
          <option value="both">{s.both}</option>
        </select></label>
        {value.mode !== 'audio' && <>
          <div className="grid grid-cols-2 gap-3">
            <label>{s.videoFormat}<select value={value.videoFormat}
              onChange={(event) => update({ videoFormat: event.target.value as ExportSettings['videoFormat'] })}>
              {Object.entries(videoFormats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label>{s.resolution}<select value={resolution} onChange={(event) => setSize(event.target.value)}>
              <option value="project">{s.projectResolution}</option>
              {resolution === 'preset' && <option value="preset">{s.presetResolution}</option>}
              {Object.keys(exportSizes).map((size) => <option key={size}>{size}</option>)}
            </select></label>
            <label>{s.frameRate}<select value={value.fps}
              onChange={(event) => updateVideo(value.width, value.height, frameRates[event.target.selectedIndex])}>
              {frameRates.map((rate) => <option key={rate}>{rate}</option>)}
            </select></label>
            <label>{s.exportQuality}<select value={quality} onChange={(event) => {
              const next = event.target.value as keyof typeof qualityFactors;
              setQuality(next);
              if (next !== 'customBitrate') update({
                bitrate: Math.round(suggestedBitrate(value.width, value.height, value.fps) * qualityFactors[next] * 10) / 10,
              });
            }}>
              {(Object.keys(qualityFactors) as (keyof typeof qualityFactors)[]).map((key) =>
                <option key={key} value={key}>{s[key]}</option>)}
            </select></label>
            <label>{s.bitrate}<input type="number" min={0.1} max={500} step={0.1} required
              value={Number.isFinite(value.bitrate) ? value.bitrate : ''}
              onChange={(event) => { setQuality('customBitrate'); update({ bitrate: event.target.valueAsNumber }); }} /></label>
          </div>
          <span className="muted">{value.width} × {value.height} · {value.fps} {s.fps}</span>
          {value.videoFormat !== 'vp9' && <label className="toggle-field"><input type="checkbox" checked={value.hardware}
            onChange={(event) => update({ hardware: event.target.checked })} />{s.hardwareAcceleration}</label>}
          {value.videoFormat === 'h264' && value.width * value.height >= 8_000_000 && value.fps >= 50 &&
            <p className="muted">{s.compatibility4k}</p>}
        </>}
        {value.mode !== 'video' && <div className="grid grid-cols-2 gap-3">
          <label>{s.audioFormat}<select value={value.audioFormat}
            onChange={(event) => update({ audioFormat: event.target.value as ExportSettings['audioFormat'] })}>
            {Object.entries(audioFormats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          {value.audioFormat !== 'wav' && <label>{s.audioBitrate}<select value={value.audioBitrate}
            onChange={(event) => update({ audioBitrate: event.target.value === '192' ? 192 : 320 })}>
            <option>192</option><option>320</option>
          </select></label>}
        </div>}
        <label>{s.range}<select value={value.range ? 'markers' : 'all'}
          onChange={(event) => update({ range: event.target.value === 'markers'
            ? { start: markers[0], end: markers.at(-1)! } : undefined })}>
          <option value="all">{s.wholeProject}</option>
          <option value="markers" disabled={markers.length < 3}>{s.markerRange}</option>
        </select></label>
        {value.range && <div className="grid grid-cols-2 gap-3">
          <label>{s.rangeStart}<select value={value.range.start} onChange={(event) =>
            update({ range: { start: Number(event.target.value), end: value.range!.end } })}>
            {markers.map((time) => <option key={time} value={time}>{time.toFixed(3)} {s.seconds}</option>)}
          </select></label>
          <label>{s.rangeEnd}<select value={value.range.end} onChange={(event) =>
            update({ range: { start: value.range!.start, end: Number(event.target.value) } })}>
            {markers.map((time) => <option key={time} value={time}>{time.toFixed(3)} {s.seconds}</option>)}
          </select></label>
        </div>}
        <label className="toggle-field"><input type="checkbox" checked={value.openFolder}
          onChange={(event) => update({ openFolder: event.target.checked })} />{s.openFolderAfter}</label>
        <p className="muted">{s.estimatedSize} {Math.ceil(estimate / 1_000_000)} {s.megabytes}</p>
        <button className="primary justify-self-end" disabled={!(duration > 0)}>{s.chooseOutput}</button>
      </fieldset>
    </form>
    {(status === 'preparing' || status === 'rendering') && <div className="grid gap-2 mt-3">
      <progress aria-label={s.exportProgress} max={100} value={progress?.percent ?? 0} />
      <p role="status">{status === 'preparing' ? s.preparingExport : progress?.verifying ? s.verifyingExport :
        `${progress?.percent ?? 0}% · ${s.elapsed} ${Math.round(progress?.elapsed ?? 0)} ${s.seconds}${progress?.eta === undefined ? '' :
          ` · ${s.eta} ${Math.round(progress.eta)} ${s.seconds}`}`}</p>
      {progress?.encoder && <p className="muted">{s.encoder} {progress.encoder}</p>}
      {progress?.fallback && <p className="muted">{s.softwareFallback}</p>}
      <button onClick={() => { controller?.abort(); void window.desktop.cancelExport(); }}>{s.cancelExport}</button>
    </div>}
    {error && <p className="error" role="alert">{error} <button onClick={() => void window.desktop.openLog()}>{s.openLog}</button></p>}
    {result && <div className="mt-3" role="status">
      <strong>{s.exportDone}</strong>
      {result.encoder && <p className="muted">{s.encoder} {result.encoder}</p>}
      <ul className="muted break-all">{result.files.map((file) => <li key={file}>{file}</li>)}</ul>
    </div>}
  </Modal>;
}
