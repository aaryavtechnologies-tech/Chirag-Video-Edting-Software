import { ColorPicker } from '../design-system/ColorPicker';
import { Select } from '../design-system/Select';
import { useState } from 'react';
import { strings as s } from '../lib/strings';
import type { Project } from '../types/project';
import type { CaptionSegment, CaptionTemplate, CaptionTrack } from './types';
import { AnimationInspector } from '../animation/AnimationInspector';
import { captionTrack, retimeCaption, setCaptionText } from './model';
import { getTemplate } from './templates';
import { captionCategories, wordEffects } from './schema';
import { estimateWords } from './wordTiming';

export function CaptionInspector({ project, track, segment, edit }: {
  project: Project; track: CaptionTrack; segment?: CaptionSegment; edit(recipe: (draft: Project) => void): void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CaptionTemplate['category']>('Custom');
  const template = getTemplate(project, track);
  const override = segment?.overrides;
  const style = { ...template.style, ...override?.style };
  const animation = override?.animation ?? template.animation;
  const effect = override?.wordEffect ?? template.wordEffect;
  const words = segment?.words ?? (segment ? estimateWords(segment.text, segment.duration) : []);
  function update(patch: Partial<CaptionTemplate>) {
    edit((draft) => {
      const target = captionTrack(draft, track.id);
      if (!target || target.locked) return;
      if (!segment) {
        target.templateSnapshot = { ...getTemplate(draft, target), ...patch };
        return;
      }
      const current = target.segments.find((item) => item.id === segment.id);
      if (current) current.overrides = { ...current.overrides, style: patch.style ?? current.overrides?.style,
        animation: patch.animation ?? current.overrides?.animation, wordEffect: patch.wordEffect ?? current.overrides?.wordEffect };
    });
  }
  function updateSegment(operation: (draft: CaptionSegment) => void) {
    edit((draft) => {
      const target = captionTrack(draft, track.id);
      const current = target?.segments.find((item) => item.id === segment?.id);
      if (current && !target?.locked) operation(current);
    });
  }
  return <aside className="inspector">
    <h2 className="font-semibold">{segment ? s.caption : s.captionTemplate}</h2>
    <p className="muted">{template.name}{override && <span className="edited-dot"> · {s.captionEdited}</span>}</p>
    <fieldset disabled={track.locked}>
      {segment && <>
        <label>{s.captionText}<textarea key={segment.text} defaultValue={segment.text} rows={3}
          onBlur={(event) => updateSegment((item) => setCaptionText(item, event.target.value))} /></label>
        <label>{s.speaker}<input defaultValue={segment.speaker} key={segment.speaker}
          onBlur={(event) => updateSegment((item) => { item.speaker = event.target.value.trim() || undefined; })} /></label>
        <label>{s.rangeStart}<input type="number" min="0" step="0.01" key={segment.start} defaultValue={segment.start}
          onBlur={(event) => updateSegment((item) => retimeCaption(item, event.target.valueAsNumber, item.duration))} /></label>
        <label>{s.clipDuration}<input type="number" min="0.01" step="0.01" key={segment.duration} defaultValue={segment.duration}
          onBlur={(event) => updateSegment((item) => retimeCaption(item, item.start, event.target.valueAsNumber))} /></label>
        <details><summary>{s.wordTimings}</summary>
          {words.map((word, index) => <div className="grid grid-cols-2 gap-1 my-1" key={index}>
            <span className="col-span-2">{word.text}</span>
            {(['start', 'end'] as const).map((key) => <input key={key + word[key]} aria-label={word.text + ' ' + (key === 'start' ? s.rangeStart : s.rangeEnd)}
              type="number" min="0" max={segment.duration} step="0.01" defaultValue={word[key]} onBlur={(event) => {
                const time = event.target.valueAsNumber;
                if (Number.isFinite(time) && time >= 0 && time <= segment.duration &&
                  (key === 'start' ? time < word.end : time > word.start)) updateSegment((item) => {
                  item.words = words.map((entry, i) => i === index ? { ...entry, [key]: time, estimated: false } : entry);
                });
              }} />)}
          </div>)}
        </details>
        {override && <button onClick={() => updateSegment((item) => { delete item.overrides; })}>{s.resetTemplate}</button>}
      </>}
      <label>{s.fontFamily}<input defaultValue={style.fontFamily ?? 'Inter'} key={style.fontFamily}
        onBlur={(event) => update({ style: { ...(segment ? override?.style : style), fontFamily: event.target.value.trim() } })} /></label>
      <label>{s.fontSize}<input defaultValue={style.fontSize ?? 54} key={style.fontSize} type="number" min="1" max="1024"
        onBlur={(event) => {
          const fontSize = event.target.valueAsNumber;
          if (fontSize >= 1 && fontSize <= 1024) update({ style: { ...(segment ? override?.style : style), fontSize } });
        }} /></label>
      <ColorPicker label={s.color} value={style.fill?.color ?? '#ffffff'}
        change={(color) => update({ style: { ...(segment ? override?.style : style), fill: { type: 'solid', color } } })} />
      <label>{s.wordEffect}<Select label={s.wordEffect} value={effect?.type ?? 'none'} onChange={(event) =>
        update({ wordEffect: { ...effect, type: wordEffects[event.target.selectedIndex] } })}>
        {wordEffects.map((item) => <option key={item} value={item}>{s.wordEffectNames[item]}</option>)}
      </Select></label>
      <details><summary>{s.animation}</summary><AnimationInspector value={animation} change={(animation) => update({ animation })} /></details>
      <label>{s.presetName}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{s.category}<Select label={s.category} value={category} onChange={(event) => setCategory(captionCategories[event.target.selectedIndex])}>
        {captionCategories.map((item) => <option key={item}>{item}</option>)}
      </Select></label>
      <button disabled={!name.trim()} onClick={() => edit((draft) => {
        (draft.captionTemplates ??= []).push({ ...template, id: crypto.randomUUID(), name: name.trim(), category,
          style, animation, wordEffect: effect });
        setName('');
      })}>{s.saveTemplate}</button>
    </fieldset>
  </aside>;
}
