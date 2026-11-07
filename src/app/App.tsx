import { useCallback, useEffect, useRef, useState } from 'react';
import { strings as s } from '../lib/strings';
import { useProject } from '../store/projectStore';
import type { HomeState, RecentProject } from '../types/desktop';
import { Home } from './Home';
import { Modal } from './Modal';
import { NewProjectForm, PreferencesForm } from './ProjectForms';
import { MediaBin } from '../panels/MediaBin';
import { Timeline } from '../timeline/Timeline';
import { projectDuration } from '../timeline/operations';
import { PreviewCanvas } from '../preview/PreviewCanvas';
import { usePlayback } from '../preview/usePlayback';
import { AudioEngine } from '../preview/audioEngine';
import { AudioInspector } from '../panels/Inspector/AudioInspector';

type ProjectDialog = { kind: 'rename' | 'duplicate' | 'delete'; project: RecentProject };
type AppDialog = { kind: 'new' | 'settings' } | ProjectDialog;

export function App() {
  const { current, setCurrent, acceptSaved, edit, past, future, undo, redo, proxies, mediaProgress } = useProject();
  const [home, setHome] = useState<HomeState>();
  const [modal, setModal] = useState<AppDialog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const playback = usePlayback(current ? projectDuration(current.project) : 0);
  const audio = useRef(new AudioEngine());
  const [volume, setVolume] = useState(1);
  const [peak, setPeak] = useState(0);
  const [selection, setSelection] = useState<{ clipId?: string; trackId?: string }>({});
  const select = useCallback((clipId?: string, trackId?: string) => setSelection({ clipId, trackId }), []);
  const project = current?.project;
  const { playing, playhead } = playback;

  useEffect(() => {
    if (project) setPeak(audio.current.update(project, playhead, playing, volume));
  }, [project, playhead, playing, volume]);
  useEffect(() => {
    const engine = audio.current;
    return () => engine.close();
  }, []);

  function togglePlayback() {
    if (!playing) audio.current.resume();
    playback.toggle();
  }

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
  useEffect(() => window.desktop.onMediaProgress(mediaProgress), [mediaProgress]);
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
      acceptSaved(await window.desktop.save(current.project));
      setNotice(s.saved);
    });
  }

  function stepHistory(action: 'undo' | 'redo') {
    if (!current || busy || (action === 'undo' ? !past.length : !future.length)) return;
    void run(async () => {
      const change = action === 'undo' ? undo : redo;
      change();
      try {
        const next = useProject.getState().current;
        if (next) acceptSaved(await window.desktop.save(next.project));
      } catch (failure) {
        if (action === 'undo') redo();
        else undo();
        throw failure;
      }
    });
  }

  function importFiles(files?: string[]) {
    if (!current || busy) return;
    void run(async () => {
      const { assets, failures } = await window.desktop.importMedia(current.project.id, files);
      if (assets.length) edit((project) => {
        const state = useProject.getState();
        project.assets.push(...assets.map((asset) => {
          const proxyPath = state.proxies[asset.id]?.proxyPath;
          return proxyPath ? { ...asset, proxyPath } : asset;
        }));
      });
      if (failures.length) setError(`${s.importFailed}\n${failures.join('\n')}`);
    });
  }

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!current) return;
      const target = event.target;
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey &&
        (!(target instanceof HTMLElement) ||
          (!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) && !target.isContentEditable))) {
        event.preventDefault();
        togglePlayback();
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        save();
      }
      if (key === 'z' && !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        stepHistory(event.shiftKey ? 'redo' : 'undo');
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
          await window.desktop.save(current.project);
          setHome(await window.desktop.home());
          setCurrent();
          playback.stop();
          audio.current.close();
          select();
        })}>{s.home}</button>
        <h1 className="text-xl font-semibold">{current.project.name}</h1>
        <button disabled={busy || !past.length} onClick={() => stepHistory('undo')}>{s.undo}</button>
        <button disabled={busy || !future.length} onClick={() => stepHistory('redo')}>{s.redo}</button>
        <button className="ml-auto" disabled={busy} onClick={save}>{s.save}</button>
      </header>
      <div className="editor-body">
        <MediaBin assets={current.project.assets} proxies={proxies} busy={busy} importFiles={importFiles} />
        <PreviewCanvas project={current.project} playback={{ ...playback, toggle: togglePlayback }} edit={edit}
          volume={volume} setVolume={setVolume} peak={peak} />
        <AudioInspector project={current.project} edit={edit} clipId={selection.clipId} trackId={selection.trackId} />
      </div>
      <Timeline key={current.project.id} project={current.project} edit={edit}
        playhead={playback.playhead} seek={playback.seek} busy={busy} onSelect={select} />
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

