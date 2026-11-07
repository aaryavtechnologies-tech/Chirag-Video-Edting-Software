import { useState } from 'react';
import type { Clip, Project, Track } from '../../types/project';
import { strings as s } from '../../lib/strings';
import { changeSpeed, detachAudio } from '../../timeline/audioEdits';
import { findClip } from '../../timeline/operations';

interface Props {
  project: Project; clipId?: string; trackId?: string; edit(recipe: (draft: Project) => void): void;
}

export function AudioInspector({ project, clipId, trackId, edit }: Props) {
  const [error, setError] = useState('');
  const found = clipId ? findClip(project, clipId) : undefined;
  const track = found?.track ?? project.tracks.find((item) => item.id === trackId);
  const clip = found?.clip;
  const hasAudio = clip?.type === 'audio' || (clip?.type === 'video' &&
    project.assets.some((asset) => asset.id === clip.assetId && asset.hasAudio));
  const showSpeed = clip?.type === 'video' || clip?.type === 'audio';
  const visual = clip?.type === 'video' || clip?.type === 'image';
  const updateTrack = (value: Partial<Track>) => edit((draft) => {
    const target = draft.tracks.find((item) => item.id === track?.id);
    if (target) Object.assign(target, value);
  });
  const updateClip = (value: Partial<Clip>) => edit((draft) => {
    const target = clip && findClip(draft, clip.id);
    if (target && !target.track.locked) Object.assign(target.clip, value);
  });
  const updateVisual = (value: Partial<NonNullable<Clip['visual']>>) => updateClip({ visual: { ...clip?.visual, ...value } });

  return <aside className="inspector">
    <h2 className="font-semibold">{s.inspector}</h2>
    {!track && <p className="muted mt-3">{s.selectClip}</p>}
    {track && <fieldset>
      <legend>{track.name}</legend>
      <label className="toggle-field"><input type="checkbox" checked={!!track.muted}
        onChange={(event) => updateTrack({ muted: event.target.checked })} />{s.muteTrack}</label>
      {track.kind === 'audio' && <label className="toggle-field"><input type="checkbox" checked={!!track.solo}
        onChange={(event) => updateTrack({ solo: event.target.checked })} />{s.soloTrack}</label>}
      <NumberControl label={s.trackVolume} value={track.volume ?? 1} min={0} max={2} step={0.05}
        change={(volume) => updateTrack({ volume })} />
    </fieldset>}
    {clip && visual && <fieldset disabled={track?.locked}>
      <legend>{s.video}</legend>
      <label>{s.fit}<select value={clip.fit ?? 'contain'} onChange={(event) => {
        const fit = event.target.value === 'cover' ? 'cover' : 'contain';
        edit((draft) => {
          const target = findClip(draft, clip.id);
          if (target && !target.track.locked) target.clip.fit = fit;
        });
      }}><option value="contain">{s.contain}</option><option value="cover">{s.cover}</option></select></label>
      <NumberControl label={s.opacity} value={clip.transform?.opacity ?? 1} min={0} max={1} step={0.05}
        change={(opacity) => edit((draft) => {
          const target = findClip(draft, clip.id);
          if (target && !target.track.locked) target.clip.transform = { ...target.clip.transform, opacity };
        })} />
      <NumberControl label={s.fadeIn} value={clip.fadeIn ?? 0} min={0} max={clip.duration} step={0.05}
        change={(fadeIn) => updateClip({ fadeIn })} />
      <NumberControl label={s.fadeOut} value={clip.fadeOut ?? 0} min={0} max={clip.duration} step={0.05}
        change={(fadeOut) => updateClip({ fadeOut })} />
      {(['flipX', 'flipY'] as const).map((key) => <label key={key} className="toggle-field"><input type="checkbox"
        checked={!!clip.visual?.[key]} onChange={(event) => updateVisual({ [key]: event.target.checked })} />
        {key === 'flipX' ? s.flipHorizontal : s.flipVertical}</label>)}
      <details><summary>{s.crop}</summary>
        {([['x', s.positionX], ['y', s.positionY], ['width', s.width], ['height', s.height]] as const)
          .map(([key, label]) => <NumberControl key={key} label={label} step={0.01}
            min={key === 'x' || key === 'y' ? 0 : 0.05} max={key === 'x' || key === 'y' ? 0.95 : 1}
            value={clip.visual?.crop?.[key] ?? (key === 'x' || key === 'y' ? 0 : 1)}
            change={(value) => updateVisual({ crop: { ...clip.visual?.crop, [key]: value } })} />)}
      </details>
      <label>{s.visualMotion}<select value={clip.visual?.motion ?? 'none'} onChange={(event) =>
        updateVisual({ motion: event.target.value as NonNullable<Clip['visual']>['motion'] })}>
        {(['none', 'slide', 'zoom', 'spin', 'wipe'] as const).map((name) => <option key={name} value={name}>{s[name]}</option>)}
      </select></label>
      <details><summary>{s.adjust}</summary>
        {([
          ['brightness', 0, -1, 1], ['contrast', 1, 0, 2], ['saturation', 1, 0, 3],
          ['temperature', 0, -1, 1], ['vignette', 0, 0, 1], ['blur', 0, 0, 40],
        ] as const).map(([key, fallback, min, max]) => <NumberControl key={key} label={s.effectNames[key]}
          value={clip.visual?.[key] ?? fallback} min={min} max={max} step={0.05}
          change={(value) => updateVisual({ [key]: value })} />)}
      </details>
      <button onClick={() => updateClip({ visual: undefined })}>{s.resetSection}</button>
    </fieldset>}
    {clip && (hasAudio || showSpeed) && <fieldset disabled={track?.locked}>
      <legend>{s.audio}</legend>
      {hasAudio && <>
        <label className="toggle-field"><input type="checkbox" checked={!!clip.muted}
          onChange={(event) => updateClip({ muted: event.target.checked })} />{s.muteClip}</label>
        <NumberControl label={s.clipVolume} value={clip.volume ?? 1} min={0} max={2} step={0.05}
          change={(volume) => updateClip({ volume })} />
        <label className="toggle-field"><input type="checkbox" checked={clip.preservePitch !== false}
          onChange={(event) => updateClip({ preservePitch: event.target.checked })} />{s.preservePitch}</label>
        <NumberControl label={s.waveformZoom} value={clip.waveformZoom ?? 1} min={0.5} max={4} step={0.1}
          change={(waveformZoom) => updateClip({ waveformZoom })} />
        {!visual && <>
          <NumberControl label={s.fadeIn} value={clip.fadeIn ?? 0} min={0} max={clip.duration} step={0.05}
            change={(fadeIn) => updateClip({ fadeIn })} />
          <NumberControl label={s.fadeOut} value={clip.fadeOut ?? 0} min={0} max={clip.duration} step={0.05}
            change={(fadeOut) => updateClip({ fadeOut })} />
        </>}
      </>}
      {showSpeed && <NumberControl label={s.speed} value={clip.speed ?? 1} min={0.25} max={4} step={0.05}
        change={(value) => {
          let changed = false;
          edit((draft) => { changed = changeSpeed(draft, clip.id, value); });
          setError(changed ? '' : s.editBlocked);
        }} />}
      {hasAudio && clip.type === 'video' && <button onClick={() => {
        let changed = false;
        edit((draft) => { changed = detachAudio(draft, clip.id, crypto.randomUUID(), crypto.randomUUID()); });
        setError(changed ? '' : s.editBlocked);
      }}>{s.detachAudio}</button>}
    </fieldset>}
    {error && <p className="muted" role="status">{error}</p>}
  </aside>;
}

function NumberControl({ label, value, min, max, step, change }: {
  label: string; value: number; min: number; max: number; step: number; change(value: number): void;
}) {
  return <label>{label}<input key={value} type="number" defaultValue={Number(value.toFixed(3))}
    min={min} max={max} step={step} onBlur={(event) => {
      const next = event.currentTarget.valueAsNumber;
      if (Number.isFinite(next) && next >= min && next <= max && next !== value) change(next);
      else event.currentTarget.value = String(Number(value.toFixed(3)));
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}
