import { ColorPicker } from '../design-system/ColorPicker';
import { strings as s } from '../lib/strings';
import { shapeKinds } from '../lib/visual';
import type { Clip, Project } from '../types/project';
import { findClip } from '../timeline/operations';

export function ShapeInspector({ clip, project, edit }: { clip: Clip; project: Project; edit(recipe: (draft: Project) => void): void }) {
  const shape = clip.shape!;
  const locked = findClip(project, clip.id)?.track.locked;
  function change(patch: Partial<NonNullable<Clip['shape']>>) {
    edit((draft) => {
      const target = findClip(draft, clip.id);
      if (target?.clip.shape && !target.track.locked) Object.assign(target.clip.shape, patch);
    });
  }
  return <aside className="inspector">
    <h2>{s[shape.kind]}</h2>
    <fieldset disabled={locked}>
      {(['fill', 'stroke'] as const).map((item) => <ColorPicker key={item} label={s[item]} value={shape[item]}
        change={(color) => change({ [item]: color })} />)}
      {(['width', 'height', 'strokeWidth'] as const).map((item) => <label key={item}>{s[item]}
        <input key={shape[item]} type="number" min={item === 'strokeWidth' ? 0 : 1}
          max={item === 'strokeWidth' ? 100 : 4096} defaultValue={shape[item]} onBlur={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isFinite(value)) change({ [item]: Math.min(item === 'strokeWidth' ? 100 : 4096, Math.max(item === 'strokeWidth' ? 0 : 1, value)) });
          }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      </label>)}
    </fieldset>
  </aside>;
}

export function VisualTools({ tab, clip, addShape, edit }: {
  tab: 'shapes' | 'effects' | 'transitions'; clip?: Clip; addShape(kind: typeof shapeKinds[number]): void;
  edit(recipe: (draft: Project) => void): void;
}) {
  const eligible = clip?.type === 'video' || clip?.type === 'image';
  const effects = {
    blur: { blur: 10 }, brightness: { brightness: 0.15 }, contrast: { contrast: 1.25 },
    saturation: { saturation: 1.5 }, vignette: { vignette: 0.65 }, blackAndWhite: { saturation: 0 },
  };
  const transitions = ['crossFade', 'fadeToBlack', 'wipe', 'slide'] as const;
  function apply(action: (clip: Clip) => void) {
    if (!eligible || !clip) return;
    edit((draft) => {
      const target = findClip(draft, clip.id);
      if (target && !target.track.locked) action(target.clip);
    });
  }
  return <section className="media-bin">
    <h2>{s[tab]}</h2>
    <div className="grid gap-2 mt-2">
      {tab === 'shapes' ? shapeKinds.map((shape) => <button key={shape} onClick={() => addShape(shape)}>{s[shape]}</button>) :
        tab === 'effects' ? Object.entries(effects).map(([key, value]) =>
          <button disabled={!eligible} key={key} onClick={() => apply((clip) => {
            clip.visual = { ...clip.visual, ...value };
          })}>{s.effectNames[key]}</button>) :
          transitions.map((kind) => <button disabled={!eligible} key={kind} onClick={() => apply((clip) => {
            if (kind === 'crossFade') clip.fadeIn = Math.min(0.5, clip.duration);
            else if (kind === 'fadeToBlack') clip.fadeOut = Math.min(0.5, clip.duration);
            else clip.visual = { ...clip.visual, motion: kind };
          })}>{s[kind]}</button>)}
    </div>
    {tab !== 'shapes' && <p className="muted mt-2">{eligible && tab === 'transitions' ? s.crossFadeHint : !eligible ? s.selectVisual : ''}</p>}
  </section>;
}
