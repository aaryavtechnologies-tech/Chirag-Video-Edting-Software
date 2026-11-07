import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { strings as s } from '../lib/strings';
import { useProject } from '../store/projectStore';
import type { HomeState, RecentProject } from '../types/desktop';
import { Home } from './Home';
import { Modal } from './Modal';
import { NewProjectForm, PreferencesForm, SaveAsForm } from './ProjectForms';
import { MediaBin } from '../panels/MediaBin';
import { Timeline } from '../timeline/Timeline';
import { addTrack, findClip, overlaps, projectDuration } from '../timeline/operations';
import { PreviewCanvas } from '../preview/PreviewCanvas';
import { usePlayback } from '../preview/usePlayback';
import { AudioEngine } from '../preview/audioEngine';
import { AudioInspector } from '../panels/Inspector/AudioInspector';
import { TextInspector } from '../panels/Inspector/TextInspector';
import { TextPanel } from '../panels/TextPanel';
import { textKinds } from '../lib/textPresets';
import { alignFrame } from '../lib/time';
import type { Asset, Clip, Project } from '../types/project';
import type { OpenProject } from '../types/desktop';
import { ExportDialog } from '../export/ExportDialog';
import { PanelResizer } from './PanelResizer';

type ProjectDialog = { kind: 'rename' | 'duplicate' | 'delete'; project: RecentProject };
type AppDialog = { kind: 'new' | 'settings' | 'projectSettings' | 'saveAs' | 'relink' | 'recovery' } | ProjectDialog;

export function App() {
  const { current, setCurrent, acceptSaved, edit: storeEdit, past, future, undo, redo, proxies, mediaProgress } = useProject();
  const [home, setHome] = useState<HomeState>();
  const [modal, setModal] = useState<AppDialog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const project = current?.project;
  const duration = useMemo(() => project ? projectDuration(project) : 0, [project]);
  const playback = usePlayback(duration);
  const audio = useRef(new AudioEngine());
  const snapshot = useRef<() => string | undefined>();
  const [volume, setVolume] = useState(1);
  const [peak, setPeak] = useState(0);
  const [selection, setSelection] = useState<{ clipId?: string; trackId?: string }>({});
  const [tab, setTab] = useState<'media' | 'text'>('media');
  const [exportOpen, setExportOpen] = useState(false);
  const [missing, setMissing] = useState<Asset[]>([]);
  const [mediaWidth, setMediaWidth] = useState(230);
  const [inspectorWidth, setInspectorWidth] = useState(215);
  const clampPanel = (width: number) => Math.min(310, Math.max(160, width));
  const select = useCallback((clipId?: string, trackId?: string) => setSelection({ clipId, trackId }), []);
  const { playing, playhead } = playback;
  const inspected = project && selection.clipId ? findClip(project, selection.clipId)?.clip : undefined;

  function edit(recipe: (draft: Project) => void) {
    const before = useProject.getState().current;
    storeEdit(recipe);
    const next = useProject.getState().current;
    if (next && next !== before) void window.desktop.stage(next.project).catch(() => setError(s.operationFailed));
  }

  async function openEditor(opened: OpenProject) {
    setCurrent(opened);
    setModal(undefined);
    const files = await window.desktop.missing(opened.project.id);
    setMissing(files);
    if (files.length) setModal({ kind: 'relink' });
  }

  function addText(kind: keyof typeof textKinds) {
    if (!project || busy) return;
    const preset = textKinds[kind];
    const clip: Clip = { id: crypto.randomUUID(), type: 'text',
      start: alignFrame(playhead, project.settings.fps), duration: 3, text: s[kind],
      style: { ...preset.style }, transform: { y: preset.y } };
    let trackId: string | undefined;
    edit((draft) => {
      const track = [...draft.tracks].reverse().find((item) => item.kind === 'video' &&
        !item.locked && !item.hidden && item.clips.every((other) => !overlaps(clip, other))) ??
        addTrack(draft, 'video', crypto.randomUUID());
      track.clips.push(clip);
      trackId = track.id;
    });
    select(clip.id, trackId);
  }

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

  function openExport() {
    if (!project || busy || duration <= 0 || exportOpen) return;
    if (playing) playback.toggle();
    setExportOpen(true);
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

  useEffect(() => { void run(async () => {
    const data = await window.desktop.home();
    setHome(data);
    if (data.recovery) setModal({ kind: 'recovery' });
  }); }, []);
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
      acceptSaved(await window.desktop.save(current.project, snapshot.current?.()));
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
      if (!current || exportOpen || modal || event.defaultPrevented) return;
      const target = event.target;
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey &&
        (!(target instanceof HTMLElement) ||
          (!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) && !target.isContentEditable))) {
        event.preventDefault();
        togglePlayback();
      }
      if (event.key.toLowerCase() === 't' && !event.ctrlKey && !event.metaKey && !event.altKey &&
        (!(target instanceof HTMLElement) ||
          (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable))) {
        event.preventDefault();
        setTab('text');
        addText('title');
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (event.shiftKey) setModal({ kind: 'saveAs' });
        else save();
      }
      if (key === 'e') { event.preventDefault(); openExport(); }
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
          await window.desktop.save(current.project, snapshot.current?.());
          setHome(await window.desktop.home());
          setCurrent();
          playback.stop();
          audio.current.close();
          select();
          setTab('media');
        })}>{s.home}</button>
        <h1 className="text-xl font-semibold">{current.project.name}</h1>
        <button disabled={busy || !past.length} onClick={() => stepHistory('undo')}>{s.undo}</button>
        <button disabled={busy || !future.length} onClick={() => stepHistory('redo')}>{s.redo}</button>
        <button disabled={busy} onClick={() => setModal({ kind: 'projectSettings' })}>{s.projectSettings}</button>
        <button disabled={busy} onClick={() => setModal({ kind: 'saveAs' })}>{s.saveAs}</button>
        {missing.length > 0 && <button disabled={busy} onClick={() => setModal({ kind: 'relink' })}>{s.relink}</button>}
        <button className="ml-auto" disabled={busy} onClick={save}>{s.save}</button>
        <button className="primary" disabled={busy || duration <= 0}
          onClick={openExport}>{s.export}</button>
      </header>
      <div className="editor-body" style={{ gridTemplateColumns: `${mediaWidth}px 5px minmax(0, 1fr) 5px ${inspectorWidth}px` }}>
        <div className="editor-sidebar">
          <div className="editor-tabs">
            <button aria-pressed={tab === 'media'} onClick={() => setTab('media')}>{s.media}</button>
            <button aria-pressed={tab === 'text'} onClick={() => setTab('text')}>{s.text}</button>
          </div>
          {tab === 'media' ? <MediaBin assets={current.project.assets} proxies={proxies} busy={busy} importFiles={importFiles} /> :
            <TextPanel add={addText} busy={busy} />}
        </div>
        <PanelResizer width={mediaWidth} resize={(width) => setMediaWidth(clampPanel(width))} />
        <PreviewCanvas project={current.project} playback={{ ...playback, toggle: togglePlayback }} edit={edit}
          volume={volume} setVolume={setVolume} peak={peak} selected={selection.clipId} onSelect={select}
          snapshot={snapshot} />
        <PanelResizer width={inspectorWidth} right resize={(width) => setInspectorWidth(clampPanel(width))} />
        {inspected?.type === 'text' ? <TextInspector key={inspected.id} project={current.project} clip={inspected} edit={edit}
          previewAnimation={() => playback.previewRange(inspected.start, inspected.start + inspected.duration)} /> :
          <AudioInspector project={current.project} edit={edit} clipId={selection.clipId} trackId={selection.trackId} />}
      </div>
      <Timeline key={current.project.id} project={current.project} edit={edit}
        playhead={playback.playhead} seek={playback.seek} busy={busy || exportOpen || !!modal} onSelect={select} focusedClip={selection.clipId} />
    </main> : <Home busy={busy || !home} recent={home?.recent ?? []}
      create={() => { setError(''); setModal({ kind: 'new' }); }}
      settings={() => { setError(''); setModal({ kind: 'settings' }); }}
      open={(file) => void run(async () => {
        const project = await window.desktop.open(file);
        if (project) await openEditor(project);
      })}
      action={(kind, project) => {
        if (kind === 'reveal') void run(() => window.desktop.reveal(project.file));
        else { setError(''); setModal({ kind, project }); }
      }} />}
    {!modal && message}
    {notice && <p className="status" role="status">{notice}</p>}
    {current && exportOpen && <ExportDialog project={current.project} volume={volume}
      save={async () => { acceptSaved(await window.desktop.save(current.project, snapshot.current?.())); }}
      onCancelled={() => { setExportOpen(false); setNotice(s.exportCancelled); }}
      close={() => setExportOpen(false)} />}
    {home && modal && <Modal title={title} busy={busy} close={() => { setModal(undefined); setError(''); }}>
      {modal.kind === 'new' && <NewProjectForm preferences={home.preferences} busy={busy} onFolder={pickFolder}
        onCreate={(value) => void run(async () => {
          await openEditor(await window.desktop.create(value));
        })} />}
      {modal.kind === 'settings' && <PreferencesForm preferences={home.preferences} busy={busy} onFolder={pickFolder}
        onSave={(value) => void run(async () => {
          setHome(await window.desktop.preferences(value));
          setModal(undefined);
        })} />}
      {modal.kind === 'projectSettings' && current && <NewProjectForm preferences={home.preferences}
        initial={current.project.settings} busy={busy} onFolder={pickFolder} onCreate={({ settings }) => {
          edit((draft) => { draft.settings = settings; });
          setModal(undefined);
        }} />}
      {modal.kind === 'saveAs' && current && <SaveAsForm initial={current.project.name + ' ' + s.copySuffix}
        folder={home.preferences.folder} busy={busy} onFolder={pickFolder} onSave={(name, folder) =>
          void run(async () => {
            playback.stop();
            select();
            await openEditor(await window.desktop.saveAs(current.project, name, folder));
          })} />}
      {modal.kind === 'recovery' && home.recovery && <div className="grid gap-3 mt-3">
        <p>{s.recoveryPrompt}</p>
        <strong>{home.recovery.name}</strong>
        <div className="flex justify-end gap-2">
          <button disabled={busy} onClick={() => void run(async () => {
            await window.desktop.discardRecovery(home.recovery!.file);
            setHome(await window.desktop.home());
            setModal(undefined);
          })}>{s.discard}</button>
          <button className="primary" disabled={busy} onClick={() => void run(async () => {
            const recovered = await window.desktop.open(home.recovery!.file, true);
            if (recovered) await openEditor(recovered);
          })}>{s.restore}</button>
        </div>
      </div>}
      {modal.kind === 'relink' && current && <div className="grid gap-3 mt-3">
        <p>{s.relinkHelp}</p>
        {missing.map((asset) => <div className="flex items-center gap-2" key={asset.id}>
          <span className="muted flex-1 break-all">{asset.path}</span>
          <button disabled={busy} onClick={() => void run(async () => {
            const next = await window.desktop.relink(current.project.id, asset.id);
            if (!next) return;
            setCurrent(next);
            const remaining = await window.desktop.missing(next.project.id);
            setMissing(remaining);
            if (!remaining.length) setModal(undefined);
          })}>{s.locate}</button>
        </div>)}
        <button className="justify-self-end" disabled={busy} onClick={() => setModal(undefined)}>{s.skip}</button>
      </div>}
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

