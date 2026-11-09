import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { strings as s } from '../lib/strings';
import { useProject } from '../store/projectStore';
import type { HomeState, RecentProject } from '../types/desktop';
import { Home, type ProjectRatio } from './Home';
import { Modal } from './Modal';
import { NewProjectForm, PreferencesForm, SaveAsForm } from './ProjectForms';
import { MediaBin } from '../panels/MediaBin';
import { Timeline } from '../timeline/Timeline';
import { addTrack, findClip, insertAsset, overlaps, projectDuration } from '../timeline/operations';
import { PreviewCanvas } from '../preview/PreviewCanvas';
import { usePlayback } from '../preview/usePlayback';
import { AudioEngine } from '../preview/audioEngine';
import { AudioInspector } from '../panels/Inspector/AudioInspector';
import { TextInspector } from '../panels/Inspector/TextInspector';
import { TextPanel } from '../panels/TextPanel';
import { textKinds } from '../lib/textPresets';
import { alignFrame, timecode, timeToFrame } from '../lib/time';
import type { Asset, Clip, Project, ProjectSettings, TextStyle } from '../types/project';
import type { OpenProject } from '../types/desktop';
import { ExportDialog } from '../export/ExportDialog';
import { ChromeActions, CommandPalette, EditorDock, EditorTooltips, type Dock } from './EditorChrome';
import { LayoutProvider } from '../layouts/LayoutProvider';
import { LandscapeLayout } from '../layouts/LandscapeLayout';
import { PortraitLayout } from '../layouts/PortraitLayout';
import { resolveLayout, type LayoutPreferences } from '../layouts/settings';
import { reframeProject } from '../layouts/reframe';
import { CaptionsPanel } from '../captions/CaptionsPanel';
import { CaptionInspector } from '../captions/CaptionInspector';
import { captionTrack, findCaption } from '../captions/model';
import { getTemplate } from '../captions/templates';
import { LayersPanel } from '../panels/Inspector/LayersPanel';
import { Shortcuts } from './Shortcuts';
import { ShapeInspector, VisualTools } from '../panels/VisualTools';
import { CheckCircle2, Download, Home as HomeIcon, Redo2, Save, SaveAll, Settings2, Undo2 } from 'lucide-react';
import { ProjectColors } from '../design-system/ColorPicker';
import { IconButton } from '../design-system/IconButton';
import { TitleBar, type TitleAction } from './TitleBar';
import type { shapeKinds } from '../lib/visual';

type ProjectDialog = { kind: 'rename' | 'duplicate' | 'delete'; project: RecentProject };
type AppDialog = { kind: 'new'; ratio?: ProjectRatio } | { kind: 'settings' | 'projectSettings' | 'saveAs' | 'relink' | 'recovery' | 'about' } |
  { kind: 'adaptContent'; settings: ProjectSettings } | ProjectDialog;

export function App() {
  const { current, setCurrent, acceptSaved, edit: storeEdit, past, future, undo, redo, proxies, mediaProgress } = useProject();
  const [home, setHome] = useState<HomeState>();
  const [modal, setModal] = useState<AppDialog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [dirty, setDirty] = useState(false);
  const [panelRevision, setPanelRevision] = useState(0);
  const project = current?.project;
  const projectColors = useMemo(() => [...new Set(JSON.stringify(project ?? {}).match(/#[\da-f]{6}(?:[\da-f]{2})?(?=")/gi) ?? [])].slice(0, 24), [project]);
  const duration = useMemo(() => project ? projectDuration(project) : 0, [project]);
  const playback = usePlayback(duration);
  const audio = useRef(new AudioEngine());
  const snapshot = useRef<() => string | undefined>();
  const [volume, setVolume] = useState(1);
  const [peak, setPeak] = useState(0);
  const [selection, setSelection] = useState<{ clipId?: string; trackId?: string }>({});
  const [selectedCaptions, setSelectedCaptions] = useState<ReadonlySet<string>>(new Set());
  const [tab, setTab] = useState<Dock>('media');
  const [palette, setPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'inspector' | 'layers'>('inspector');
  const styleClipboard = useRef<{ style?: TextStyle; animation?: Clip['animation'] }>();
  const [timelineZoom, setTimelineZoom] = useState(100);
  const [previewQuality, setPreviewQuality] = useState<'full' | 'half' | 'quarter'>('half');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPreview, setExportPreview] = useState<string>();
  const [missing, setMissing] = useState<Asset[]>([]);
  const [dockOpen, setDockOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [safeGuides, setSafeGuides] = useState<boolean>();
  const layout = home?.preferences.layout ?? (project?.layout?.mode ? { mode: project.layout.mode } : undefined);
  const resolvedLayout = resolveLayout(layout?.mode ?? 'auto', project?.settings.width ?? 16, project?.settings.height ?? 9);
  const Layout = resolvedLayout === 'portrait' ? PortraitLayout : LandscapeLayout;
  const showGuides = safeGuides ?? resolvedLayout === 'portrait';
  const select = useCallback((clipId?: string, trackId?: string) => {
    setSelectedCaptions(new Set());
    setSelection({ clipId, trackId });
    if (clipId || trackId) setInspectorOpen(true);
  }, []);
  function selectCaption(clipId?: string, trackId?: string, extend = false) {
    setSelection({ clipId, trackId });
    setSelectedCaptions((previous) => {
      if (!clipId) return new Set();
      const next = new Set(extend ? previous : []);
      if (extend && next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return next;
    });
    setInspectorOpen(true);
  }

  function saveLayout(value: LayoutPreferences) {
    if (!home) return;
    const preferences = { ...home.preferences, layout: value };
    setHome({ ...home, preferences });
    void window.desktop.preferences(preferences).catch(() => setError(s.operationFailed));
  }
  const { playing, playhead } = playback;
  const inspected = project && selection.clipId ? findClip(project, selection.clipId)?.clip : undefined;
  const inspectedCaption = project && selection.clipId ? findCaption(project, selection.clipId) : undefined;
  const inspectedCaptionTrack = inspectedCaption?.track ?? (project && captionTrack(project, selection.trackId));

  function copyStyle() {
    if (inspected?.type === 'text') styleClipboard.current = { style: inspected.style, animation: inspected.animation };
    else if (project && inspectedCaption) {
      const template = getTemplate(project, inspectedCaption.track);
      styleClipboard.current = { style: { ...template.style, ...inspectedCaption.segment.overrides?.style },
        animation: inspectedCaption.segment.overrides?.animation ?? template.animation };
    }
  }

  function pasteStyle() {
    const style = styleClipboard.current;
    if (!style || !selection.clipId) return;
    const id = selection.clipId;
    edit((draft) => {
      const clip = findClip(draft, id);
      if (clip && !clip.track.locked && clip.clip.type === 'text') Object.assign(clip.clip, style);
      const caption = findCaption(draft, id);
      if (caption && !caption.track.locked) caption.segment.overrides = { ...caption.segment.overrides, ...style };
    });
  }

  function edit(recipe: (draft: Project) => void) {
    const before = useProject.getState().current;
    storeEdit(recipe);
    const next = useProject.getState().current;
    if (next && next !== before) {
      setDirty(true);
      void window.desktop.stage(next.project).catch(() => setError(s.operationFailed));
    }
  }

  async function openEditor(opened: OpenProject) {
    playback.stop();
    select();
    setDirty(false);
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
      style: { ...preset.style, ...(project.settings.width <= project.settings.height && {
        fontSize: (preset.style.fontSize ?? 64) * project.settings.height / 1920,
      }) }, transform: { y: preset.y } };
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

  function addShape(kind: typeof shapeKinds[number]) {
    if (!project || busy) return;
    const id = crypto.randomUUID();
    const clip: Clip = { id, type: 'text', text: s[kind], start: alignFrame(playhead, project.settings.fps), duration: 3,
      shape: { kind, width: project.settings.width * 0.25, height: project.settings.height * 0.2,
        fill: '#8872f5', stroke: '#ffffff', strokeWidth: 4 } };
    let trackId: string | undefined;
    edit((draft) => {
      const track = [...draft.tracks].reverse().find((item) => item.kind === 'video' && !item.locked &&
        !item.hidden && item.clips.every((other) => !overlaps(clip, other))) ?? addTrack(draft, 'video', crypto.randomUUID());
      track.clips.push(clip);
      trackId = track.id;
    });
    select(id, trackId);
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
    setExportPreview(snapshot.current?.());
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
      setDirty(false);
      setNotice(s.saved);
    });
  }

  function closeProject() {
    if (!current || busy) return;
    void run(async () => {
      await window.desktop.save(current.project, snapshot.current?.());
      setHome(await window.desktop.home());
      setCurrent();
      setDirty(false);
      playback.stop();
      audio.current.close();
      select();
      setTab('media');
    });
  }

  function openProject(file?: string) {
    if (busy) return;
    void run(async () => {
      if (current && dirty) acceptSaved(await window.desktop.save(current.project, snapshot.current?.()));
      setDirty(false);
      const opened = await window.desktop.open(file);
      if (opened) await openEditor(opened);
    });
  }

  function toggleTheme() {
    if (!home || busy) return;
    void run(async () => setHome(await window.desktop.preferences({
      ...home.preferences, theme: home.preferences.theme === 'dark' ? 'light' : 'dark',
    })));
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

  function canRemoveAsset(id: string) {
    return !!project && !project.tracks.some((track) => track.clips.some((clip) => clip.assetId === id));
  }

  function mediaAction(kind: 'add' | 'replace' | 'reveal' | 'remove', asset: Asset) {
    if (!current || busy) return;
    if (kind === 'reveal') void run(() => window.desktop.revealAsset(current.project.id, asset.id));
    if (kind === 'replace') void run(async () => {
      const next = await window.desktop.relink(current.project.id, asset.id);
      if (next) { acceptSaved(next); setDirty(false); }
    });
    if (kind === 'remove' && canRemoveAsset(asset.id)) edit((draft) => {
      draft.assets = draft.assets.filter((item) => item.id !== asset.id);
    });
    if (kind === 'add') {
      const clipId = crypto.randomUUID();
      const trackId = crypto.randomUUID();
      const start = alignFrame(playhead, current.project.settings.fps);
      let added = false;
      edit((draft) => { added = insertAsset(draft, asset, undefined, start, clipId, trackId); });
      if (added) select(clipId, trackId);
    }
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
      if (!current || exportOpen || modal || palette || showShortcuts || event.defaultPrevented) return;
      const target = event.target;
      if (event.key === '?' && !(target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable))) {
        event.preventDefault();
        setShowShortcuts(true);
      }
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
      if (event.shiftKey && (key === 'c' || key === 'v')) {
        if (target instanceof HTMLElement && (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)) return;
        event.preventDefault();
        if (key === 'c') copyStyle();
        else pasteStyle();
      }
      if (key === 'k') { event.preventDefault(); setPalette(true); }
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
  const proxyTask = Object.values(proxies).find((update) => update.percent < 100 && !update.failed);
  const locked = busy || !!modal || exportOpen;
  const dispatch = (key: string, ctrlKey = false) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, cancelable: true }));
  const command = (label: string, shortcut: string, key: string, ctrl = true): TitleAction =>
    ({ label, shortcut, disabled: !current || locked, action: () => dispatch(key, ctrl) });
  const menus: { label: string; items: TitleAction[] }[] = [
    { label: s.fileMenu, items: [
      { label: s.newProject, disabled: locked, action: () => setModal({ kind: 'new' }) },
      { label: s.openProject, disabled: locked, action: () => openProject() },
      { label: s.openRecent, disabled: locked || !home?.recent.length, action: () => undefined,
        children: (home?.recent ?? []).map((item) => ({ label: item.name, action: () => openProject(item.file) })) },
      { label: s.save, shortcut: 'Ctrl+S', disabled: !current || locked, action: save },
      { label: s.saveAs, shortcut: 'Ctrl+Shift+S', disabled: !current || locked, action: () => setModal({ kind: 'saveAs' }) },
      { label: s.export, shortcut: 'Ctrl+E', disabled: !duration || locked, action: openExport },
      { label: s.closeProject, disabled: !current || locked, action: closeProject },
      { label: s.exitApp, action: () => void window.desktop.windowControl('close') },
    ] },
    { label: s.editMenu, items: [
      { label: s.undo, shortcut: 'Ctrl+Z', disabled: !past.length || locked, action: () => stepHistory('undo') },
      { label: s.redo, shortcut: 'Ctrl+Shift+Z', disabled: !future.length || locked, action: () => stepHistory('redo') },
      command(s.cut, 'Ctrl+X', 'x'), command(s.copy, 'Ctrl+C', 'c'), command(s.paste, 'Ctrl+V', 'v'),
      command(s.duplicate, 'Ctrl+D', 'd'), command(s.delete, 'Del', 'Delete', false), command(s.selectAll, 'Ctrl+A', 'a'),
    ] },
    { label: s.view, items: [
      { label: s.layout, action: () => undefined, children: (['auto', 'landscape', 'portrait'] as const).map((mode) =>
        ({ label: s[mode], action: () => saveLayout({ ...layout, mode }) })) },
      command(s.zoomIn, '+', '+', false), command(s.zoomOut, '−', '-', false),
      { label: s.toggleTheme, action: toggleTheme },
      { label: s.safeZones, disabled: !current, action: () => setSafeGuides(!showGuides) },
      { label: s.showDock, disabled: !current, action: () => setDockOpen(!dockOpen) },
      { label: s.showInspector, disabled: !current, action: () => setInspectorOpen(!inspectorOpen) },
      { label: s.fullscreen, action: () => void window.desktop.windowControl('fullscreen') },
      { label: s.resetPanelSizes, action: () => { saveLayout({ mode: layout?.mode ?? 'auto' }); setPanelRevision((value) => value + 1); } },
    ] },
    { label: s.helpMenu, items: [
      { label: s.shortcuts, shortcut: '?', action: () => setShowShortcuts(true) },
      { label: s.about, action: () => setModal({ kind: 'about' }) },
      { label: s.openLog, action: () => void window.desktop.openLog() },
    ] },
  ];
  return <EditorTooltips><ProjectColors.Provider value={projectColors}>
    <div className="window-shell">
    <TitleBar menus={menus} name={current?.project.name} dirty={dirty} rename={(name) => edit((draft) => { draft.name = name; })} />
    {current ? <main className={`editor editor-${resolvedLayout}`}>
      <header className="editor-toolbar">
        <IconButton label={s.home} disabled={busy} onClick={closeProject}><HomeIcon size={17} /></IconButton>
        <span className="toolbar-divider" />
        <IconButton label={s.undo} shortcut="Ctrl+Z" disabled={busy || !past.length} onClick={() => stepHistory('undo')}><Undo2 size={17} /></IconButton>
        <IconButton label={s.redo} shortcut="Ctrl+Shift+Z" disabled={busy || !future.length} onClick={() => stepHistory('redo')}><Redo2 size={17} /></IconButton>
        <div className="editor-canvas-info">
          <button className="resolution-chip" onClick={() => setModal({ kind: 'projectSettings' })}>
            {current.project.settings.width} × {current.project.settings.height} · {current.project.settings.fps} {s.fps}
          </button>
          <IconButton label={s.projectSettings} onClick={() => setModal({ kind: 'projectSettings' })}><Settings2 size={17} /></IconButton>
        </div>
        <IconButton label={s.saveAs} shortcut="Ctrl+Shift+S" disabled={busy} onClick={() => setModal({ kind: 'saveAs' })}><SaveAll size={17} /></IconButton>
        {missing.length > 0 && <button disabled={busy} onClick={() => setModal({ kind: 'relink' })}>{s.relink}</button>}
        <IconButton label={s.save} shortcut="Ctrl+S" disabled={busy} onClick={save}><Save size={17} /></IconButton>
        <ChromeActions theme={home?.preferences.theme ?? 'dark'} toggleTheme={toggleTheme} openPalette={() => setPalette(true)} />
        <button className="primary" disabled={busy || duration <= 0}
          onClick={openExport}><Download size={16} aria-hidden />{s.export}</button>
      </header>
      <LayoutProvider settings={layout} width={current.project.settings.width} height={current.project.settings.height}>
      <Layout key={panelRevision} preferences={layout} dockOpen={dockOpen} inspectorOpen={inspectorOpen}
        savePanels={(sizes) => saveLayout({ mode: layout?.mode ?? 'auto', panels: { ...layout?.panels, [resolvedLayout]: sizes } })}
        dock={<EditorDock active={tab} select={(value) => { setDockOpen(true); setTab(value); }}>
          {tab === 'media' || tab === 'audio' ? <MediaBin assets={current.project.assets} proxies={proxies} busy={busy}
            audioOnly={tab === 'audio'} importFiles={importFiles} canRemove={canRemoveAsset} action={mediaAction} /> :
            tab === 'text' || tab === 'templates' ? <TextPanel add={addText} busy={busy} /> :
            tab === 'captions' ? <CaptionsPanel project={current.project} edit={edit} trackId={selection.trackId}
              selected={selectedCaptions} playhead={playhead} select={selectCaption} seek={playback.seek} /> :
            <VisualTools tab={tab} clip={inspected} addShape={addShape} edit={edit} />}
        </EditorDock>}
        preview={<PreviewCanvas project={current.project} playback={{ ...playback, toggle: togglePlayback }} edit={edit}
          volume={volume} setVolume={setVolume} peak={peak} selected={selection.clipId} onSelect={(clipId, trackId) => {
            const caption = clipId && findCaption(current.project, clipId);
            if (caption) selectCaption(clipId, caption.track.id);
            else select(clipId, trackId);
          }}
          snapshot={snapshot} onQuality={setPreviewQuality} safeGuides={showGuides} toggleGuides={() => setSafeGuides(!showGuides)} />}
        inspector={<>
        <div className="inspector-switch">
          <button aria-pressed={inspectorTab === 'inspector'} onClick={() => setInspectorTab('inspector')}>{s.inspector}</button>
          <button aria-pressed={inspectorTab === 'layers'} onClick={() => setInspectorTab('layers')}>{s.layers}</button>
        </div>
        {inspectorTab === 'layers' ? <LayersPanel project={current.project} edit={edit} active={selection.clipId}
          onSelect={select} onCaptionSelect={selectCaption} /> :
          inspectedCaptionTrack ? <CaptionInspector key={inspectedCaption?.segment.id ?? inspectedCaptionTrack.id}
          project={current.project} edit={edit} track={inspectedCaptionTrack} segment={inspectedCaption?.segment} /> :
          !selection.clipId && !selection.trackId ? <aside className="inspector">
          <h2 className="font-semibold">{s.projectSettings}</h2>
          <p className="muted my-3">{current.project.settings.width} × {current.project.settings.height} · {current.project.settings.fps} {s.fps}</p>
          <p className="muted">{s.tracks} {current.project.tracks.length} · {s.media} {current.project.assets.length}</p>
          <button className="mt-3" onClick={() => setModal({ kind: 'projectSettings' })}>{s.editSettings}</button>
        </aside> : inspected?.shape ? <ShapeInspector project={current.project} clip={inspected} edit={edit} /> :
          inspected?.type === 'text' ? <TextInspector key={inspected.id} project={current.project} clip={inspected} edit={edit}
          previewAnimation={() => playback.previewRange(inspected.start, inspected.start + inspected.duration)} /> :
          <AudioInspector key={selection.clipId ?? selection.trackId} project={current.project} edit={edit} clipId={selection.clipId} trackId={selection.trackId} />}
        </>}
      />
      </LayoutProvider>
      <Timeline key={current.project.id} project={current.project} edit={edit}
        playhead={playback.playhead} seek={playback.seek} busy={busy || exportOpen || !!modal || palette || showShortcuts}
        onSelect={select} focusedClip={inspectedCaption ? undefined : selection.clipId} onZoom={setTimelineZoom}
        selectedCaptions={selectedCaptions} onCaptionSelect={selectCaption} />
      <footer className="editor-status" aria-label={s.editorStatus}>
        <span>{timecode(playhead, current.project.settings.fps)}</span>
        <span>{s.frame} {timeToFrame(playhead, current.project.settings.fps)}</span>
        <span>{s.zoom} {timelineZoom}%</span>
        <span>{s.quality} · {s[previewQuality]}</span>
        <span>{proxyTask ? `${s.proxyProgress} ${proxyTask.percent}%` : s.backgroundIdle}</span>
        <span>{s.autosaveEvery} {home?.preferences.autosave ?? 30}{s.seconds}</span>
        <span>{dirty ? s.unsavedChanges : s.savedAt + ' ' + new Date(current.project.updatedAt ?? Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span>{s[resolvedLayout]}</span>
      </footer>
    </main> : <Home busy={busy || !home} recent={home?.recent ?? []}
      create={(ratio) => { setError(''); setModal({ kind: 'new', ratio }); }}
      settings={() => { setError(''); setModal({ kind: 'settings' }); }}
      open={openProject}
      action={(kind, project) => {
        if (kind === 'reveal') void run(() => window.desktop.reveal(project.file));
        else { setError(''); setModal({ kind, project }); }
      }} />}
    </div>
    {!modal && message}
    {notice && <p className="status editor-toast" role="status"><CheckCircle2 size={16} aria-hidden="true" />{notice}</p>}
    {showShortcuts && <Shortcuts close={() => setShowShortcuts(false)} />}
    {current && palette && <CommandPalette close={() => setPalette(false)} actions={[
      { label: s.save, shortcut: 'Ctrl+S', disabled: busy, run: save },
      { label: s.saveAs, shortcut: 'Ctrl+Shift+S', run: () => setModal({ kind: 'saveAs' }) },
      { label: s.export, shortcut: 'Ctrl+E', disabled: busy || !duration, run: openExport },
      { label: s.undo, shortcut: 'Ctrl+Z', disabled: !past.length, run: () => stepHistory('undo') },
      { label: s.redo, shortcut: 'Ctrl+Shift+Z', disabled: !future.length, run: () => stepHistory('redo') },
      { label: s.importMedia, disabled: busy, run: () => importFiles() },
      { label: s.title, shortcut: 'T', run: () => { setTab('text'); addText('title'); } },
      { label: s.projectSettings, run: () => setModal({ kind: 'projectSettings' }) },
      { label: s.toggleTheme, run: toggleTheme },
      { label: s.shortcuts, shortcut: '?', run: () => setShowShortcuts(true) },
      { label: s.copyStyle, shortcut: 'Ctrl+Shift+C', disabled: inspected?.type !== 'text' && !inspectedCaption, run: copyStyle },
      { label: s.pasteStyle, shortcut: 'Ctrl+Shift+V', disabled: !styleClipboard.current, run: pasteStyle },
    ]} />}
    {current && exportOpen && <ExportDialog project={current.project} volume={volume} preview={exportPreview}
      save={async () => { acceptSaved(await window.desktop.save(current.project, snapshot.current?.())); }}
      onCancelled={() => { setExportOpen(false); setNotice(s.exportCancelled); }}
      close={() => setExportOpen(false)} />}
    {home && modal && <Modal key={modal.kind} title={title} size={modal.kind === 'delete' || modal.kind === 'about' ? 'small' : 'medium'} busy={busy} close={() => { setModal(undefined); setError(''); }}
      footer={modal.kind === 'new' || modal.kind === 'projectSettings' ? <>
        <button disabled={busy} onClick={() => { setModal(undefined); setError(''); }}>{s.cancel}</button>
        <button type="submit" form="project-form" className="primary" disabled={busy}>{modal.kind === 'new' ? s.create : s.save}</button>
      </> : undefined}>
      {modal.kind === 'new' && <NewProjectForm formId="project-form" initialRatio={modal.ratio} preferences={home.preferences} busy={busy} onFolder={pickFolder}
        onCreate={(value) => void run(async () => {
          if (current && dirty) await window.desktop.save(current.project, snapshot.current?.());
          await openEditor(await window.desktop.create(value));
        })} />}
      {modal.kind === 'about' && <p className="muted">{s.aboutDescription}</p>}
      {modal.kind === 'settings' && <PreferencesForm preferences={home.preferences} busy={busy} onFolder={pickFolder}
        onSave={(value) => void run(async () => {
          setHome(await window.desktop.preferences(value));
          setModal(undefined);
        })} />}
      {modal.kind === 'projectSettings' && current && <NewProjectForm formId="project-form" preferences={home.preferences}
        initial={current.project.settings} busy={busy} onFolder={pickFolder} onCreate={({ settings }) => {
          const before = current.project.settings;
          if (before.width * settings.height !== settings.width * before.height) setModal({ kind: 'adaptContent', settings });
          else {
            edit((draft) => { draft.settings = settings; });
            setModal(undefined);
          }
        }} />}
      {modal.kind === 'adaptContent' && <div className="grid gap-3 mt-3">
        <p>{s.adaptHelp}</p>
        <button onClick={() => {
          edit((draft) => { draft.settings = modal.settings; });
          setModal(undefined);
        }}>{s.keepPositions}</button>
        <button className="primary" onClick={() => {
          edit((draft) => reframeProject(draft, modal.settings));
          setModal(undefined);
        }}>{s.autoReframe}</button>
      </div>}
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
  </ProjectColors.Provider></EditorTooltips>;
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
      <button className={kind === 'delete' ? 'destructive justify-self-end' : 'primary justify-self-end'}>{s[kind]}</button>
    </fieldset>
  </form>;
}

