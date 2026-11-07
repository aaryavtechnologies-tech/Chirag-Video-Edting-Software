import { useEffect, useState } from 'react';
import { strings as s } from '../lib/strings';
import { useProject } from '../store/projectStore';
import type { HomeState, RecentProject } from '../types/desktop';
import { Home } from './Home';
import { Modal } from './Modal';
import { NewProjectForm, PreferencesForm } from './ProjectForms';

type ProjectDialog = { kind: 'rename' | 'duplicate' | 'delete'; project: RecentProject };
type AppDialog = { kind: 'new' | 'settings' } | ProjectDialog;

export function App() {
  const { current, setCurrent } = useProject();
  const [home, setHome] = useState<HomeState>();
  const [modal, setModal] = useState<AppDialog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^.*?Error: /, '') : s.operationFailed);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void run(async () => setHome(await window.desktop.home())); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = home?.preferences.theme ?? 'dark';
  }, [home]);

  function pickFolder(folder: string, change: (folder: string) => void) {
    void run(async () => {
      const selected = await window.desktop.folder(folder);
      if (selected) change(selected);
    });
  }

  function save() {
    if (current && !busy) void run(async () => {
      setCurrent(await window.desktop.save(current.project));
      setNotice(s.saved);
    });
  }

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && current) {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });

  const message = error && <p className="error" role="alert">{error}</p>;
  const title = modal?.kind === 'new' ? s.newProject : modal ? s[modal.kind] : '';
  return <>
    {current ? <main className="editor">
      <header className="flex flex-wrap items-center gap-4">
        <button disabled={busy} onClick={() => void run(async () => {
          setHome(await window.desktop.home());
          setCurrent();
        })}>{s.home}</button>
        <h1 className="text-xl font-semibold">{current.project.name}</h1>
        <button className="ml-auto" disabled={busy} onClick={save}>{s.save}</button>
      </header>
      <div className="editor-stage">
        <div className="canvas" role="img" aria-label={s.preview} style={{
          aspectRatio: current.project.settings.width / current.project.settings.height,
          backgroundColor: current.project.settings.background ?? '#000000',
        }} />
        <p className="muted">{current.project.settings.width} × {current.project.settings.height} · {current.project.settings.fps} {s.fps}</p>
      </div>
      <section className="editor-tracks">
        <h2>{s.tracks}</h2>
        {[...current.project.tracks].reverse().map((track) => <div className="track" key={track.id}>{track.name}</div>)}
        <p className="muted">{s.emptyEditor}</p>
      </section>
    </main> : <Home busy={busy || !home} recent={home?.recent ?? []}
      create={() => { setError(''); setModal({ kind: 'new' }); }}
      settings={() => { setError(''); setModal({ kind: 'settings' }); }}
      open={(file) => void run(async () => {
        const project = await window.desktop.open(file);
        if (project) setCurrent(project);
      })}
      action={(kind, project) => {
        if (kind === 'reveal') void run(() => window.desktop.reveal(project.file));
        else { setError(''); setModal({ kind, project }); }
      }} />}
    {!modal && message}
    {notice && <p className="status" role="status">{notice}</p>}
    {home && modal && <Modal title={title} busy={busy} close={() => { setModal(undefined); setError(''); }}>
      {modal.kind === 'new' && <NewProjectForm preferences={home.preferences} busy={busy} onFolder={pickFolder}
        onCreate={(value) => void run(async () => {
          setCurrent(await window.desktop.create(value));
          setModal(undefined);
        })} />}
      {modal.kind === 'settings' && <PreferencesForm preferences={home.preferences} busy={busy} onFolder={pickFolder}
        onSave={(value) => void run(async () => {
          setHome(await window.desktop.preferences(value));
          setModal(undefined);
        })} />}
      {'project' in modal && <ProjectActionForm modal={modal} busy={busy} submit={(name) => void run(async () => {
        const { kind, project } = modal;
        const api = window.desktop;
        setHome(await (kind === 'delete' ? api.remove(project.file) : api[kind](project.file, name)));
        setModal(undefined);
      })} />}
      {message}
    </Modal>}
  </>;
}

function ProjectActionForm({ modal, busy, submit }: {
  modal: ProjectDialog; busy: boolean; submit(name: string): void;
}) {
  const { kind, project } = modal;
  const [name, setName] = useState(kind === 'duplicate' ? `${project.name} ${s.copySuffix}` : project.name);
  return <form onSubmit={(event) => { event.preventDefault(); submit(name); }}>
    <fieldset disabled={busy}>
      {kind === 'delete' ? <p>{s.deleteConfirm}</p> :
        <label>{s.name}<input value={name} required maxLength={120} onChange={(event) => setName(event.target.value)} /></label>}
      <button className="primary justify-self-end">{s[kind]}</button>
    </fieldset>
  </form>;
}

