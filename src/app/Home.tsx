import { useState } from 'react';
import { strings as s } from '../lib/strings';
import type { RecentProject } from '../types/desktop';

export type ProjectAction = 'rename' | 'duplicate' | 'delete' | 'reveal';

export function Home({ recent, busy, create, open, settings, action }: {
  recent: RecentProject[]; busy: boolean; create(): void; open(file?: string): void;
  settings(): void; action(kind: ProjectAction, project: RecentProject): void;
}) {
  const [query, setQuery] = useState('');
  const matches = recent.filter((project) => project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <main className="home">
    <aside className="sidebar">
      <div className="brand"><span aria-hidden="true">▶</span> {s.app}</div>
      <button className="primary" onClick={create} disabled={busy}>{s.newProject}</button>
      <button onClick={() => open()} disabled={busy}>{s.openProject}</button>
      <button className="mt-auto" onClick={settings} disabled={busy}>{s.settings}</button>
    </aside>
    <section className="workspace">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{s.recent}</h1>
        <input aria-label={s.search} placeholder={s.search} type="search" value={query}
          onChange={(event) => setQuery(event.target.value)} />
      </header>
      {matches.length === 0 && <p className="empty">{recent.length === 0 ? s.empty : s.noResults}</p>}
      <div className="cards">
        {matches.map((project) => <article className="card" key={project.file}>
          <button className="card-open" onClick={() => open(project.file)} disabled={busy}>
            <div className="thumbnail"><span style={{
              aspectRatio: project.width / project.height, backgroundColor: project.background,
            }} /></div>
            <strong>{project.name}</strong>
            <span className="muted">{project.width} × {project.height} · {Math.floor(project.duration / 60)}:{String(Math.floor(project.duration % 60)).padStart(2, '0')}</span>
            {Number.isFinite(Date.parse(project.editedAt)) &&
              <time className="muted" dateTime={project.editedAt}>{new Date(project.editedAt).toLocaleString()}</time>}
          </button>
          <details className="actions">
            <summary aria-label={s.actions}>⋯</summary>
            <div>{(['rename', 'duplicate', 'delete', 'reveal'] as const).map((kind) =>
              <button key={kind} disabled={busy} onClick={(event) => {
                const details = event.currentTarget.closest('details');
                if (details) details.open = false;
                action(kind, project);
              }}>{s[kind]}</button>)}</div>
          </details>
        </article>)}
      </div>
    </section>
  </main>;
}
