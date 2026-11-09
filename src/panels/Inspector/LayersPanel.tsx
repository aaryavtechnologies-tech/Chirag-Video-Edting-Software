import { memo, useState } from 'react';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { strings as s } from '../../lib/strings';
import type { Project } from '../../types/project';
import { reorderTrack } from '../../timeline/operations';
import { captionTrack } from '../../captions/model';
import { IconButton } from '../../design-system/IconButton';

const dragType = 'application/x-editor-layer-track';

export const LayersPanel = memo(function LayersPanel({ project, edit, onSelect, onCaptionSelect, active }: {
  project: Project; edit(recipe: (draft: Project) => void): void;
  onSelect(id?: string, trackId?: string): void; onCaptionSelect(id?: string, trackId?: string): void;
  active?: string;
}) {
  const [query, setQuery] = useState('');
  const assets = new Map(project.assets.map((asset) => [asset.id, asset.path.split(/[\\/]/).at(-1)]));
  const tracks = [...project.tracks.filter((track) => track.kind === 'video').reverse(),
    ...(project.captionTracks ?? []), ...project.tracks.filter((track) => track.kind === 'audio')];
  const match = (name: string) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  return <aside className="inspector layers-panel">
    <label>{s.searchLayers}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    {tracks.map((track) => {
      const name = track.name ?? s.captions;
      const clips = track.kind === 'caption' ? track.segments.map((item) => ({ id: item.id, name: item.text })) :
        track.clips.map((clip) => ({ id: clip.id, name: clip.text ?? assets.get(clip.assetId ?? '') ?? s[clip.type] }));
      const shown = match(name) ? clips : clips.filter((clip) => match(clip.name));
      if (!match(name) && !shown.length) return null;
      const select = track.kind === 'caption' ? onCaptionSelect : onSelect;
      const update = (operation: (item: typeof track) => void) => edit((draft) => {
        const item = track.kind === 'caption' ? captionTrack(draft, track.id) : draft.tracks.find((entry) => entry.id === track.id);
        if (item) operation(item);
      });
      const EyeIcon = track.hidden ? EyeOff : Eye;
      const LockIcon = track.locked ? Lock : Unlock;
      return <section className="layer-group" key={track.id}
        onDragOver={(event) => { if (event.dataTransfer.types.includes(dragType)) event.preventDefault(); }}
        onDrop={(event) => {
          const source = event.dataTransfer.getData(dragType);
          if (!source) return;
          event.preventDefault();
          edit((draft) => {
            if (track.kind !== 'caption') { reorderTrack(draft, source, track.id); return; }
            const tracks = draft.captionTracks ?? [];
            const from = tracks.findIndex((item) => item.id === source);
            const to = tracks.findIndex((item) => item.id === track.id);
            if (from >= 0 && to >= 0 && from !== to) tracks.splice(to, 0, tracks.splice(from, 1)[0]);
          });
        }}>
        <div className="layer-heading" draggable onDragStart={(event) => event.dataTransfer.setData(dragType, track.id)}>
          <input aria-label={s.rename + ' ' + name} key={name} defaultValue={name} onBlur={(event) => {
            const value = event.target.value.trim();
            if (value && value !== name) update((item) => { item.name = value; });
            else event.target.value = name;
          }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          {track.kind !== 'audio' && <IconButton label={s.layerVisibility} aria-pressed={!track.hidden}
            onClick={() => update((item) => { item.hidden = !item.hidden; })}><EyeIcon size={14} aria-hidden /></IconButton>}
          <IconButton label={s.lockTrack} aria-pressed={!!track.locked}
            onClick={() => update((item) => { item.locked = !item.locked; })}><LockIcon size={14} aria-hidden /></IconButton>
        </div>
        <button className="layer-track-select" onClick={() => select(undefined, track.id)}>{s.selectTrack}</button>
        {shown.map((clip) => <button key={clip.id} aria-pressed={clip.id === active}
          className="layer-clip" onClick={() => select(clip.id, track.id)}>{clip.name}</button>)}
      </section>;
    })}
  </aside>;
});
