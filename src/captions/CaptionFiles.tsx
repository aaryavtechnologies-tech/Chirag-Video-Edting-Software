import { useMemo, useState } from 'react';
import { strings as s } from '../lib/strings';
import type { Project } from '../types/project';
import type { CaptionTrack } from './types';
import { addCaptionTrack, captionTrack, reflowCaption, retimeCaption } from './model';
import { builtInTemplates, getTemplate } from './templates';
import { captionFormats, decodeCaptions, parseCaptions, type CaptionFormat } from './parsers';
import { captionExportFormats, exportCaptions, type CaptionExportFormat } from './exporters';

export function CaptionFiles({ project, track, edit, select }: {
  project: Project; track?: CaptionTrack; edit(recipe: (draft: Project) => void): void;
  select(id?: string, trackId?: string): void;
}) {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<CaptionFormat>('txt');
  const [rate, setRate] = useState(2.5);
  const [sourceFps, setSourceFps] = useState(0);
  const [offset, setOffset] = useState(0);
  const [target, setTarget] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [split, setSplit] = useState(false);
  const [failed, setFailed] = useState(false);
  const [outFormat, setOutFormat] = useState<CaptionExportFormat>('srt');
  const templates = [...builtInTemplates, ...(project.captionTemplates ?? [])];
  const parsed = useMemo(() => {
    if (!text.trim()) return { segments: [] };
    try {
      let index = 0;
      return { segments: parseCaptions(text, format, () => String(index++), rate) };
    } catch { return { segments: [], invalid: true }; }
  }, [text, format, rate]);

  async function read(file: File) {
    setFailed(false);
    try {
      const extension = file.name.split('.').at(-1)?.toLowerCase() as CaptionFormat;
      if (!captionFormats.includes(extension) || file.size > 10_000_000) throw new Error(s.invalidCaptions);
      setFormat(extension);
      setText(decodeCaptions(new Uint8Array(await file.arrayBuffer())));
    } catch { setFailed(true); }
  }

  function commit() {
    const trackId = target || crypto.randomUUID();
    edit((draft) => {
      const destination = captionTrack(draft, trackId) ?? addCaptionTrack(draft, trackId);
      if (destination.locked) return;
      const chosen = templates.find((item) => item.id === templateId);
      if (chosen) { destination.templateId = chosen.id; destination.templateSnapshot = chosen; }
      const { maxCharsPerLine = 32, maxLines = 2 } = getTemplate(draft, destination);
      const ratio = sourceFps > 0 ? sourceFps / draft.settings.fps : 1;
      for (const item of parsed.segments) {
        const start = item.start * ratio + offset;
        if (start + item.duration * ratio <= 0) continue;
        const segment = { ...item, id: crypto.randomUUID() };
        retimeCaption(segment, Math.max(0, start), item.duration * ratio + Math.min(0, start));
        const parts = split ? reflowCaption(segment, maxCharsPerLine, maxLines, () => crypto.randomUUID()) : [segment];
        destination.segments.push(...parts);
      }
      destination.segments.sort((a, b) => a.start - b.start);
    });
    select(undefined, trackId);
    setText('');
  }

  function download() {
    const segments = track?.segments ?? (project.captionTracks ?? []).flatMap((item) => item.segments);
    const url = URL.createObjectURL(new Blob([exportCaptions(segments, outFormat)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = project.name.replace(/[<>:"/\\|?*]/g, '_') + '.' + outFormat;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="grid gap-2 mt-2" onDragOver={(event) => {
    if (event.dataTransfer.types.includes('Files')) event.preventDefault();
  }} onDrop={(event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void read(file);
  }}>
    <label>{s.captionFile}<input type="file" accept={captionFormats.map((ext) => '.' + ext).join(',')}
      onChange={(event) => { if (event.target.files?.[0]) void read(event.target.files[0]); event.target.value = ''; }} /></label>
    <label>{s.captionPaste}<textarea rows={3} value={text} onChange={(event) => { setText(event.target.value); setFormat('txt'); }} /></label>
    {format === 'txt' && <label>{s.wordsPerSecond}<input type="number" min="0.1" max="20" step="0.1"
      value={rate} onChange={(event) => setRate(Number(event.target.value))} /></label>}
    <label>{s.targetTrack}<select value={target} onChange={(event) => setTarget(event.target.value)}>
      <option value="">{s.addCaptionTrack}</option>
      {(project.captionTracks ?? []).map((item) => <option key={item.id} value={item.id} disabled={item.locked}>{item.name}</option>)}
    </select></label>
    <label>{s.importOffset}<input type="number" value={offset} step="0.05" onChange={(event) => setOffset(Number(event.target.value))} /></label>
    <label>{s.sourceFps}<input type="number" value={sourceFps} min="0" max="240" step="0.001"
      onChange={(event) => setSourceFps(Number(event.target.value))} /></label>
    <label>{s.captionTemplate}<select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
      <option value="">{s.trackDefault}</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <label className="toggle-field"><input type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)} />{s.splitLongCaptions}</label>
    {parsed.segments.length > 0 && <ol className="caption-preview">{parsed.segments.slice(0, 10).map((item) => <li key={item.id}>
      <time>{item.start.toFixed(2)} {s.seconds}</time> {item.text}
    </li>)}</ol>}
    {(failed || parsed.invalid || (text.trim() && !parsed.segments.length)) && <p className="error" role="alert">{s.invalidCaptions}</p>}
    <button className="primary" disabled={!parsed.segments.length} onClick={commit}>{s.importCaptions}</button>
    <label>{s.captionExportFormat}<select value={outFormat} onChange={(event) => setOutFormat(captionExportFormats[event.target.selectedIndex])}>
      {captionExportFormats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
    </select></label>
    <button disabled={!project.captionTracks?.some((item) => item.segments.length)} onClick={download}>{s.exportCaptions}</button>
  </div>;
}
