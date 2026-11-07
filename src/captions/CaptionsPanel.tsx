import { useMemo, useState } from 'react';
import { strings as s } from '../lib/strings';
import type { Project } from '../types/project';
import { AnimationPreview } from '../animation/AnimationPreview';
import { captionCategories } from './schema';
import { addCaptionTrack, captionTrack, mergeCaption, reflowCaption, setCaptionText, splitCaption } from './model';
import { applyTemplate, builtInTemplates, getTemplate } from './templates';
import { estimateWords } from './wordTiming';
import type { CaptionTemplate } from './types';

type Edit = (recipe: (draft: Project) => void) => void;

function TemplateCard({ template, pressed, select }: { template: CaptionTemplate; pressed: boolean; select(): void }) {
  const [hover, setHover] = useState(false);
  const animation = useMemo(() => template.animation ?? {}, [template]);
  return <button aria-pressed={pressed} onClick={select} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
    <AnimationPreview text={template.thumbnailText ?? s.gallerySample} animation={animation} style={template.style} play={hover} />
    {template.name}
  </button>;
}

export function CaptionsPanel({ project, edit, trackId, selected, playhead, select, seek }: {
  project: Project; edit: Edit; trackId?: string; selected: ReadonlySet<string>; playhead: number;
  select(clipId?: string, trackId?: string, extend?: boolean): void; seek(time: number): void;
}) {
  const [tab, setTab] = useState<'templates' | 'transcript'>('templates');
  const [category, setCategory] = useState<string>('all');
  const [templateId, setTemplateId] = useState<string>();
  const [reset, setReset] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [shift, setShift] = useState(0);
  const track = captionTrack(project, trackId) ?? project.captionTracks?.[0];
  const library = [...builtInTemplates, ...(project.captionTemplates ?? [])];
  const template = library.find((item) => item.id === templateId);
  const id = () => crypto.randomUUID();
  function change(operation: (draft: NonNullable<typeof track>) => void) {
    edit((draft) => {
      const target = captionTrack(draft, track?.id);
      if (target && !target.locked) operation(target);
    });
  }
  function addTrack() {
    const trackId = id();
    edit((draft) => { addCaptionTrack(draft, trackId); });
    select(undefined, trackId);
  }
  function add() {
    const trackId = track?.id ?? id();
    const segmentId = id();
    edit((draft) => {
      const target = captionTrack(draft, trackId) ?? addCaptionTrack(draft, trackId);
      if (target.locked) return;
      const start = Math.max(0, playhead);
      target.segments.push({ id: segmentId, start, duration: 2, text: s.caption,
        words: estimateWords(s.caption, 2) });
      target.segments.sort((a, b) => a.start - b.start);
    });
    select(segmentId, trackId);
    setTab('transcript');
  }
  return <section className="media-bin caption-panel">
    <h2>{s.captions}</h2>
    <div className="flex flex-wrap gap-1 my-2">
      <button onClick={addTrack}>{s.addCaptionTrack}</button>
      <button disabled={track?.locked} onClick={add}>{s.addCaption}</button>
    </div>
    {project.captionTracks?.length ? <label>{s.tracks}<select value={track?.id ?? ''} onChange={(event) => select(undefined, event.target.value)}>
      {project.captionTracks.map((item) => <option key={item.id} value={item.id}>{item.name ?? s.captions}</option>)}
    </select></label> : null}
    <div className="inspector-tabs">
      <button aria-pressed={tab === 'templates'} onClick={() => setTab('templates')}>{s.templates}</button>
      <button aria-pressed={tab === 'transcript'} onClick={() => setTab('transcript')}>{s.transcript}</button>
    </div>
    {tab === 'templates' && <>
      <label className="my-2">{s.category}<select value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="all">{s.all}</option>{captionCategories.map((item) => <option key={item}>{item}</option>)}
      </select></label>
      <div className="style-presets animation-grid">
        {library.filter((item) => category === 'all' || item.category === category).map((item) =>
          <TemplateCard key={item.id} template={item} pressed={item.id === templateId} select={() => setTemplateId(item.id)} />)}
      </div>
      {template && <div className="grid gap-1 my-2">
        <button className="primary" disabled={!track || track.locked}
          onClick={() => change((target) => applyTemplate(target, template, undefined, reset))}>{s.applyCaptionTrack}</button>
        <button disabled={!track || !selected.size || track.locked}
          onClick={() => change((target) => applyTemplate(target, template, selected, reset))}>{s.applyCaptionSelection}</button>
        <label className="toggle-field"><input type="checkbox" checked={reset} onChange={(event) => setReset(event.target.checked)} />
          {s.resetCaptionEdits}</label>
      </div>}
    </>}
    {tab === 'transcript' && track && <div className="grid gap-2 my-2">
      <label>{s.findText}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>{s.replaceText}<input value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label>
      <button disabled={!query || track.locked} onClick={() => change((draft) => {
        for (const item of draft.segments) setCaptionText(item, item.text.replaceAll(query, replacement));
      })}>{s.replaceAll}</button>
      <label>{s.shiftCaptions}<input type="number" value={shift} step="0.1"
        onChange={(event) => setShift(Number(event.target.value))} /></label>
      <button disabled={!shift || track.locked} onClick={() => change((draft) => {
        const safe = Math.max(shift, -Math.min(...draft.segments.map((item) => item.start)));
        for (const item of draft.segments) item.start += safe;
      })}>{s.shiftCaptions}</button>
      <div className="flex flex-wrap gap-1">
        {(['uppercase', 'lowercase', 'titleCase', 'removePunctuation'] as const).map((action) => <button key={action} disabled={track.locked}
          onClick={() => change((draft) => {
            for (const item of draft.segments) setCaptionText(item, action === 'uppercase' ? item.text.toUpperCase() :
              action === 'lowercase' ? item.text.toLowerCase() :
              action === 'titleCase' ? item.text.toLowerCase().replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase()) :
              item.text.replace(/\p{P}/gu, ''));
          })}>{s[action]}</button>)}
      </div>
      <button disabled={track.locked} onClick={() => change((draft) => {
        const { maxCharsPerLine = 32, maxLines = 2 } = getTemplate(project, track);
        draft.segments = draft.segments.flatMap((item) => reflowCaption(item, maxCharsPerLine, maxLines, id));
      })}>{s.reflowCaptions}</button>
      {track.segments.filter((item) => item.text.toLowerCase().includes(query.toLowerCase())).map((item) => <div className="caption-row" key={item.id}>
        <button aria-pressed={selected.has(item.id)} onClick={(event) => {
          select(item.id, track.id, event.ctrlKey || event.shiftKey || event.metaKey);
          seek(item.start);
        }}>{item.start.toFixed(2)}{s.seconds}{item.overrides && <span className="edited-dot" title={s.captionEdited}> ●</span>}</button>
        <textarea key={item.text} rows={2} defaultValue={item.text} disabled={track.locked} aria-label={s.captionText}
          onBlur={(event) => change((draft) => {
            const segment = draft.segments.find((segment) => segment.id === item.id);
            if (segment) setCaptionText(segment, event.target.value);
          })} />
        <div className="flex flex-wrap gap-1">
          <button disabled={track.locked} onClick={() => change((draft) => splitCaption(draft, item.id, playhead, id()))}>{s.split}</button>
          <button disabled={track.locked} onClick={() => change((draft) => mergeCaption(draft, item.id))}>{s.mergeNext}</button>
        </div>
      </div>)}
    </div>}
  </section>;
}
