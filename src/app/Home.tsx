import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Film, FolderOpen, LayoutGrid, List, MoreHorizontal, Play, Plus, Search, Settings2, PanelsTopLeft } from 'lucide-react';
import { IconButton } from '../design-system/IconButton';
import { Select } from '../design-system/Select';
import type { ratios } from '../lib/geometry';
import { strings as s } from '../lib/strings';
import type { RecentProject } from '../types/desktop';

export type ProjectAction = 'rename' | 'duplicate' | 'delete' | 'reveal';
export type ProjectRatio = keyof typeof ratios;

const shortcuts = [['16:9', s.landscape], ['9:16', s.portrait], ['1:1', s.square], ['4:5', s.socialPortrait]] as const;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const sorters = {
  edited: (a: RecentProject, b: RecentProject) => (Date.parse(b.editedAt) || 0) - (Date.parse(a.editedAt) || 0),
  name: (a: RecentProject, b: RecentProject) => a.name.localeCompare(b.name),
  duration: (a: RecentProject, b: RecentProject) => b.duration - a.duration,
};

export function Home({ recent, busy, create, open, settings, action }: {
  recent: RecentProject[]; busy: boolean; create(ratio?: ProjectRatio): void; open(file?: string): void;
  settings(): void; action(kind: ProjectAction, project: RecentProject): void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<keyof typeof sorters>('edited');
  const [list, setList] = useState(false);
  const matches = recent.filter((project) => project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort(sorters[sort]);

  return <main className="home">
    <aside className="sidebar">
      <div className="brand"><Film size={22} aria-hidden="true" /> {s.app}</div>
      <button className="primary" onClick={() => create()} disabled={busy}><Plus size={16} />{s.newProject}</button>
      <button onClick={() => open()} disabled={busy}><FolderOpen size={16} />{s.openProject}</button>
      <nav aria-label={s.projects}>
        <span className="home-active" aria-current="page"><LayoutGrid size={16} />{s.projects}</span>
        <button disabled><PanelsTopLeft size={16} />{s.templates}</button>
      </nav>
      <button className="mt-auto" onClick={settings} disabled={busy}><Settings2 size={16} />{s.settings}</button>
    </aside>
    <section className="workspace">
      <header className="home-header">
        <h1>{s.projects}</h1>
        <div className="home-filters">
          <label className="home-search"><Search size={14} /><input aria-label={s.search} placeholder={s.search}
            type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <Select label={s.sortProjects} value={sort} onChange={(event) => setSort(event.target.value as keyof typeof sorters)}>
            <option value="edited">{s.lastEdited}</option><option value="name">{s.name}</option>
            <option value="duration">{s.duration}</option>
          </Select>
          <div className="ui-segmented">
            <IconButton label={s.gridView} aria-pressed={!list} onClick={() => setList(false)}><LayoutGrid size={16} /></IconButton>
            <IconButton label={s.listView} aria-pressed={list} onClick={() => setList(true)}><List size={16} /></IconButton>
          </div>
        </div>
      </header>
      <div className="home-shortcuts" aria-label={s.aspect}>
        {shortcuts.map(([ratio, label]) => <button key={ratio} disabled={busy} onClick={() => create(ratio)}>
          <span className="ratio-symbol" data-ratio={ratio} aria-hidden="true" />
          <span><strong>{label}</strong><small>{ratio}</small></span>
        </button>)}
      </div>
      {matches.length === 0 && <div className="home-empty"><Film size={26} aria-hidden="true" />
        <p>{recent.length === 0 ? s.empty : s.noResults}</p>
        {recent.length === 0 && <button onClick={() => create()} disabled={busy}>{s.createFirstProject}</button>}
      </div>}
      <div className="cards" data-list={list}>
        {!list && <button className="new-project-tile" onClick={() => create()} disabled={busy}
          aria-label={s.createProjectTile}><Plus size={24} />{s.newProject}</button>}
        {matches.map((project) => <article className="card" key={project.file}>
          <button className="card-open" onClick={() => open(project.file)} disabled={busy}>
            <div className="thumbnail">
              <div className="thumbnail-frame" style={{ aspectRatio: project.width / project.height,
                width: Math.min(100, 62.5 * project.width / project.height) + '%', backgroundColor: project.background }}>
                {project.thumbnail && <img alt="" loading="lazy" src={`editor-media://recent/${project.thumbnail}`} />}
              </div>
              <span className="card-play"><Play size={22} fill="currentColor" /></span>
            </div>
            <span className="card-meta">
              <strong title={project.name}>{project.name}</strong>
              <span>{project.width} × {project.height}{project.fps ? ` · ${project.fps} fps` : ''} · {Math.floor(project.duration / 60)}:{String(Math.floor(project.duration % 60)).padStart(2, '0')}</span>
              {Number.isFinite(Date.parse(project.editedAt)) && <time dateTime={project.editedAt}>
                {s.editedProject(dateFormat.format(new Date(project.editedAt)))}</time>}
            </span>
          </button>
          <Menu.Root>
            <Menu.Trigger className="card-actions" disabled={busy} aria-label={s.actions}><MoreHorizontal size={16} /></Menu.Trigger>
            <Menu.Portal><Menu.Content className="chrome-menu" align="end" sideOffset={4}>
              <Menu.Item onSelect={() => open(project.file)}>{s.openProject}</Menu.Item>
              {(['rename', 'duplicate', 'reveal', 'delete'] as const).map((kind) =>
                <Menu.Item key={kind} className={kind === 'delete' ? 'danger-item' : undefined}
                  onSelect={() => action(kind, project)}>{s[kind]}</Menu.Item>)}
            </Menu.Content></Menu.Portal>
          </Menu.Root>
        </article>)}
      </div>
    </section>
  </main>;
}
