import { ArrowDownToLine, AudioLines, Film, FolderOpen, Image, LayoutGrid, List, Replace, Search, Trash2 } from 'lucide-react';
import { ContextActions } from '../design-system/ContextActions';
import { IconButton } from '../design-system/IconButton';
import { Select } from '../design-system/Select';
import { useState } from 'react';
import { strings as s } from '../lib/strings';
import type { MediaProgress } from '../types/desktop';
import type { Asset } from '../types/project';
import { assetDragType } from '../timeline/Timeline';

const assetIcons = { audio: AudioLines, image: Image, video: Film };
const assetName = (asset: Asset) => asset.path.split(/[\\/]/).at(-1) ?? asset.path;
const filters = ['all', 'video', 'image', 'audio'] as const;

export function MediaBin({ assets, proxies, busy, importFiles, audioOnly, canRemove, action }: {
  assets: Asset[]; proxies: Record<string, MediaProgress>; busy: boolean;
  importFiles(files?: string[]): void;
  audioOnly?: boolean; canRemove(id: string): boolean;
  action(kind: 'add' | 'replace' | 'reveal' | 'remove', asset: Asset): void;
}) {
  const [filter, setFilter] = useState<typeof filters[number]>('all');
  const [menu, setMenu] = useState<{ x: number; y: number; asset: Asset }>();
  const [query, setQuery] = useState('');
  const [list, setList] = useState(false);
  const shown = assets.filter((asset) =>
    (audioOnly ? asset.type === 'audio' || asset.hasAudio : filter === 'all' || asset.type === filter) &&
    assetName(asset).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

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
      <IconButton label={list ? s.gridView : s.listView} onClick={() => setList(!list)}>
        {list ? <LayoutGrid size={16} /> : <List size={16} />}
      </IconButton>
      <IconButton label={s.importMedia} disabled={busy} className="primary" onClick={() => importFiles()}><FolderOpen size={16} /></IconButton>
    </header>
    <label className="home-search"><Search size={14} />
      <input type="search" value={query} aria-label={s.searchMedia} placeholder={s.searchMedia} onChange={(event) => setQuery(event.target.value)} />
    </label>
    {!audioOnly && <label>{s.filterMedia}
      <Select label={s.filterMedia} value={filter} onChange={(event) => setFilter(filters[event.target.selectedIndex])}>
        {filters.map((kind) => <option key={kind} value={kind}>{s[kind]}</option>)}
      </Select>
    </label>}
    {!shown.length && <p className="muted mt-3">{assets.length ? s.noMediaMatches : s.mediaEmpty}</p>}
    <ul className="media-grid" data-list={list}>
      {shown.map((asset) => {
        const name = assetName(asset);
        const AssetIcon = assetIcons[asset.type];
        const progress = proxies[asset.id];
        return <li key={asset.id} title={name} draggable={!busy} onContextMenu={(event) => {
          if (busy) return;
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, asset });
        }} onDragStart={(event) => {
          event.dataTransfer.setData(assetDragType, asset.id);
          event.dataTransfer.effectAllowed = 'copy';
        }}>
          <div className="media-thumb">
            {asset.thumbPath ? <img alt="" src={`editor-media://thumbnail/${encodeURIComponent(asset.id)}`} /> :
              <AssetIcon size={24} className="muted" aria-label={s[asset.type]} />}
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
    {menu && <ContextActions {...menu} close={() => setMenu(undefined)} items={[
      { label: s.addToTimeline, icon: ArrowDownToLine, run: () => action('add', menu.asset) },
      { label: s.replaceMedia, icon: Replace, run: () => action('replace', menu.asset) },
      { label: s.reveal, icon: FolderOpen, run: () => action('reveal', menu.asset) },
      { label: s.removeMedia, icon: Trash2, danger: true, divide: true, disabled: !canRemove(menu.asset.id), run: () => action('remove', menu.asset) },
    ]} />}
  </section>;
}
