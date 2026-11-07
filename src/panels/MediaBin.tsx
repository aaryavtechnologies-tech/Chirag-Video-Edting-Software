import { useState } from 'react';
import { strings as s } from '../lib/strings';
import type { MediaProgress } from '../types/desktop';
import type { Asset } from '../types/project';
import { assetDragType } from '../timeline/Timeline';

const filters = ['all', 'video', 'image', 'audio'] as const;

export function MediaBin({ assets, proxies, busy, importFiles, audioOnly }: {
  assets: Asset[]; proxies: Record<string, MediaProgress>; busy: boolean;
  importFiles(files?: string[]): void;
  audioOnly?: boolean;
}) {
  const [filter, setFilter] = useState<typeof filters[number]>('all');
  const shown = assets.filter((asset) => audioOnly ? asset.type === 'audio' || asset.hasAudio : filter === 'all' || asset.type === filter);

  return <section className="media-bin" onDragOver={(event) => {
    if (event.dataTransfer.types.includes('Files')) event.preventDefault();
  }} onDrop={(event) => {
    event.preventDefault();
    if (busy) return;
    const files = Array.from(event.dataTransfer.files, (file) => window.desktop.filePath(file)).filter(Boolean);
    if (files.length) importFiles(files);
  }}>
    <header className="media-header">
      <h2 className="font-semibold">{audioOnly ? s.audio : s.media}</h2>
      <button disabled={busy} className="primary" onClick={() => importFiles()}>{s.importMedia}</button>
    </header>
    {!audioOnly && <label>{s.filterMedia}
      <select value={filter} onChange={(event) => setFilter(filters[event.target.selectedIndex])}>
        {filters.map((kind) => <option key={kind} value={kind}>{s[kind]}</option>)}
      </select>
    </label>}
    {!shown.length && <p className="muted mt-3">{assets.length ? s.noMediaMatches : s.mediaEmpty}</p>}
    <ul className="media-grid">
      {shown.map((asset) => {
        const name = asset.path.split(/[\\/]/).at(-1) ?? asset.path;
        const progress = proxies[asset.id];
        return <li key={asset.id} title={name} draggable={!busy} onDragStart={(event) => {
          event.dataTransfer.setData(assetDragType, asset.id);
          event.dataTransfer.effectAllowed = 'copy';
        }}>
          <div className="media-thumb">
            {asset.thumbPath ? <img alt="" src={`editor-media://thumbnail/${encodeURIComponent(asset.id)}`} /> :
              <span className="muted">{s[asset.type]}</span>}
            {asset.duration !== undefined && <span className="media-duration">
              {asset.duration.toFixed(1)}{s.seconds}
            </span>}
          </div>
          <p className="truncate">{name}</p>
          {asset.proxyPath && <span className="muted">{s.proxyReady}</span>}
          {progress && !asset.proxyPath && <span className="muted">
            {progress.failed ? s.proxyFailed : `${s.proxyProgress} ${progress.percent}%`}
          </span>}
        </li>;
      })}
    </ul>
  </section>;
}
