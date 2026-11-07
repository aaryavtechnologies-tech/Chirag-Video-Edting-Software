import { Fragment, useEffect, useRef, useState, type PointerEvent } from 'react';
import { CaptionTimelineRow } from '../captions/CaptionTimelineRow';
import { strings as s } from '../lib/strings';
import { alignFrame, timecode } from '../lib/time';
import type { Asset, Clip, Project, Track } from '../types/project';
import {
  addTrack, copyClips, deleteClips, findClip, insertAsset, moveClips, pasteClips, projectDuration,
  removeTrack, reorderTrack, splitClips, trimClip, type ClipboardClip,
} from './operations';
import { snapTargets, snappedDelta } from './snapping';
import { Waveform } from './Waveform';
import { detachAudio } from './audioEdits';
import './timeline.css';

export const assetDragType = 'application/x-video-editor-asset';
const trackDragType = 'application/x-video-editor-track';
const labelsWidth = 152;
const minZoom = 12;
const maxZoom = 480;
const id = () => crypto.randomUUID();

type Point = { x: number; y: number };
type Gesture =
  | { kind: 'scrub' }
  | { kind: 'box'; origin: Point; point: Point; extend: boolean }
  | { kind: 'move' | 'left' | 'right'; origin: Point; point: Point; clip: Clip; trackId: string; ids: Set<string> };

interface Props {
  project: Project;
  edit(recipe: (project: Project) => void): void;
  playhead: number;
  seek(time: number): void;
  busy: boolean;
  onSelect(clipId?: string, trackId?: string): void;
  focusedClip?: string;
  onZoom?(percent: number): void;
  selectedCaptions?: ReadonlySet<string>;
  onCaptionSelect?(id?: string, trackId?: string, extend?: boolean): void;
}

export function Timeline({ project, edit, playhead, seek, busy, onSelect, focusedClip, onZoom, selectedCaptions, onCaptionSelect }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(80);
  useEffect(() => { onZoom?.(Math.round(zoom / 80 * 100)); }, [zoom, onZoom]);
  const [snap, setSnap] = useState(true);
  const [gesture, setGesture] = useState<Gesture>();
  const [viewport, setViewport] = useState({ width: 800, left: 0 });
  const [message, setMessage] = useState('');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>();
  const pane = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const clipboard = useRef<ClipboardClip[]>([]);
  const fps = project.settings.fps;
  const length = projectDuration(project);
  const tracks = [...project.tracks.filter((track) => track.kind === 'video').reverse(),
    ...project.tracks.filter((track) => track.kind === 'audio')];
  const captionRows = onCaptionSelect && selectedCaptions && project.captionTracks?.map((track) =>
    <CaptionTimelineRow key={track.id} track={track} zoom={zoom} fps={fps} edit={edit}
      selected={selectedCaptions} select={onCaptionSelect} playhead={playhead} />);
  const firstAudio = tracks.findIndex((track) => track.kind === 'audio');
  const width = Math.max(viewport.width - labelsWidth, (length + 8) * zoom);
  const pxToTime = (x: number) => Math.max(0, x / zoom);
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  useEffect(() => {
    if (focusedClip) setSelected((current) => current.has(focusedClip) ? current : new Set([focusedClip]));
  }, [focusedClip]);

  useEffect(() => {
    const element = pane.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport({ width: element.clientWidth, left: element.scrollLeft }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = pane.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const at = Math.max(0, event.clientX - element.getBoundingClientRect().left - labelsWidth);
      changeZoom(zoom * Math.exp(-event.deltaY / 400), at);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  });

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (busy || event.defaultPrevented || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (event.shiftKey && (key === 'c' || key === 'v')) return;
        if (key === 'c') clipboard.current = copyClips(project, selected);
        else if (key === 'v' && clipboard.current.length) paste(clipboard.current, playhead);
        else if (key === 'd') {
          const items = copyClips(project, selected);
          if (items.length) paste(items, Math.max(...items.map(({ clip }) => clip.start + clip.duration)));
        } else return;
        event.preventDefault();
        return;
      }
      switch (event.key.toLowerCase()) {
        case 's': split(); break;
        case 'delete': case 'backspace': erase(event.shiftKey); break;
        case 'n': setSnap((value) => !value); break;
        case 'm': mark(); break;
        case '=': case '+': changeZoom(zoom * 1.25); break;
        case '-': changeZoom(zoom / 1.25); break;
        case 'home': seek(0); break;
        case 'end': seek(length); break;
        case 'arrowleft': seek(Math.max(0, alignFrame(playhead - (event.shiftKey ? 1 : 1 / fps), fps))); break;
        case 'arrowright': seek(Math.min(length, alignFrame(playhead + (event.shiftKey ? 1 : 1 / fps), fps))); break;
        default: return;
      }
      event.preventDefault();
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });

  function changeZoom(value: number, anchor = Math.max(0, (viewport.width - labelsWidth) / 2)) {
    const next = Math.max(minZoom, Math.min(maxZoom, value));
    const time = (viewport.left + anchor) / zoom;
    setZoom(next);
    requestAnimationFrame(() => { if (pane.current) pane.current.scrollLeft = Math.max(0, time * next - anchor); });
  }

  function point(event: PointerEvent): Point {
    const bounds = surface.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left - labelsWidth, y: event.clientY - bounds.top };
  }

  function capture(event: PointerEvent) {
    surface.current?.setPointerCapture(event.pointerId);
    setMessage('');
  }

  function scrub(x: number) {
    seek(alignFrame(pxToTime(x), fps));
  }

  function attempt(operation: (draft: Project) => boolean) {
    let changed = false;
    edit((draft) => { changed = operation(draft); });
    setMessage(changed ? '' : s.editBlocked);
  }

  function split() { attempt((draft) => splitClips(draft, selected, playhead, id)); }
  function paste(items: ClipboardClip[], at: number) {
    let ids: string[] = [];
    attempt((draft) => { ids = pasteClips(draft, items, at, id); return ids.length > 0; });
    if (ids.length) {
      setSelected(new Set(ids));
      onSelect(ids[0], items[0].trackId);
    }
  }
  function erase(ripple: boolean) {
    if (selected.size) edit((draft) => deleteClips(draft, selected, ripple));
    setSelected(new Set());
    onSelect();
  }
  function mark() {
    edit((draft) => {
      const markers = draft.markers ?? (draft.markers = []);
      if (!markers.some((marker) => marker.time === playhead)) markers.push({ time: playhead });
    });
  }

  function startClip(event: PointerEvent, clip: Clip, track: Track, kind: 'move' | 'left' | 'right') {
    if (event.button !== 0 || busy) return;
    event.stopPropagation();
    const extend = event.shiftKey || event.ctrlKey || event.metaKey;
    const ids = kind !== 'move' ? new Set([clip.id]) :
      extend ? new Set(selected) : selected.has(clip.id) ? new Set(selected) : new Set([clip.id]);
    if (extend && kind === 'move' && ids.has(clip.id)) {
      ids.delete(clip.id);
      setSelected(ids);
      const next = [...ids].at(-1);
      onSelect(next, next ? findClip(project, next)?.track.id : undefined);
      return;
    }
    ids.add(clip.id);
    setSelected(ids);
    onSelect(clip.id, track.id);
    if (track.locked) return;
    capture(event);
    const at = point(event);
    setGesture({ kind, origin: at, point: at, clip, trackId: track.id, ids });
  }

  function gestureDelta(drag: Extract<Gesture, { clip: Clip }>, x: number) {
    const raw = (x - drag.origin.x) / zoom;
    const anchor = drag.kind === 'right' ? drag.clip.start + drag.clip.duration : drag.clip.start;
    const edges = drag.kind === 'move' ? [...drag.ids].flatMap((clipId) => {
      const clip = findClip(project, clipId)?.clip;
      return clip ? [clip.start, clip.start + clip.duration] : [];
    }) : [anchor];
    const aligned = alignFrame(anchor + raw, fps) - anchor;
    return snap ? snappedDelta(edges, aligned, snapTargets(project, playhead, drag.ids), 8 / zoom) : aligned;
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!gesture) return;
    const at = point(event);
    setGesture(undefined);
    if (gesture.kind === 'scrub') { scrub(at.x); return; }
    if (gesture.kind === 'box') {
      const bounds = surface.current!.getBoundingClientRect();
      const left = Math.min(gesture.origin.x, at.x) + bounds.left + labelsWidth;
      const right = Math.max(gesture.origin.x, at.x) + bounds.left + labelsWidth;
      const top = Math.min(gesture.origin.y, at.y) + bounds.top;
      const bottom = Math.max(gesture.origin.y, at.y) + bounds.top;
      const ids = gesture.extend ? new Set(selected) : new Set<string>();
      if (right - left > 2 || bottom - top > 2) {
        for (const item of surface.current!.querySelectorAll<HTMLElement>('[data-clip-id]')) {
          const rect = item.getBoundingClientRect();
          if (left <= rect.right && right >= rect.left && top <= rect.bottom && bottom >= rect.top) {
            ids.add(item.dataset.clipId!);
          }
        }
      }
      setSelected(ids);
      const next = [...ids].at(-1);
      onSelect(next, next ? findClip(project, next)?.track.id : undefined);
      return;
    }
    if (Math.abs(at.x - gesture.origin.x) < 2 && Math.abs(at.y - gesture.origin.y) < 2) return;
    const delta = gestureDelta(gesture, at.x);
    if (gesture.kind === 'move') {
      const track = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-track-id]');
      if (track?.dataset.trackId) {
        attempt((draft) => moveClips(draft, gesture.ids, gesture.clip.id, track.dataset.trackId!, delta));
      }
    } else {
      const edge = gesture.kind;
      const original = edge === 'left' ? gesture.clip.start : gesture.clip.start + gesture.clip.duration;
      attempt((draft) => trimClip(draft, gesture.clip.id, edge, original + delta));
    }
  }

  function dropAsset(event: React.DragEvent, trackId?: string) {
    const asset = assets.get(event.dataTransfer.getData(assetDragType));
    if (!asset || busy) return;
    event.preventDefault();
    const bounds = surface.current!.getBoundingClientRect();
    const time = alignFrame(pxToTime(event.clientX - bounds.left - labelsWidth), fps);
    const start = snap ? Math.max(0, snappedDelta([time], 0, snapTargets(project, playhead, new Set()), 8 / zoom)) : time;
    const clipId = id();
    attempt((draft) => {
      const added = insertAsset(draft, asset, trackId, start, clipId, id());
      if (added) {
        setSelected(new Set([clipId]));
        onSelect(clipId, findClip(draft, clipId)?.track.id);
      }
      return added;
    });
  }

  const visibleStart = Math.max(0, (viewport.left - 100) / zoom);
  const visibleEnd = (viewport.left + viewport.width + 100) / zoom;
  const step = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((value) => value * zoom >= 60) ?? 60;
  const firstTick = Math.floor(visibleStart / step);
  const lastTick = Math.ceil(Math.min(visibleEnd, width / zoom) / step);
  const ticks = Array.from({ length: lastTick - firstTick + 1 }, (_, index) => (firstTick + index) * step);
  const dragDelta = gesture && 'clip' in gesture ? gestureDelta(gesture, gesture.point.x) : 0;

  return <section className="timeline" aria-label={s.timeline} onPointerDown={() => { if (menu) setMenu(undefined); }}>
    <div className="timeline-tools">
      <button disabled={busy} onClick={split}>{s.split}</button>
      <button disabled={busy || !selected.size} onClick={() => erase(false)}>{s.delete}</button>
      <button disabled={busy || !selected.size} onClick={() => erase(true)}>{s.rippleDelete}</button>
      <button aria-pressed={snap} onClick={() => setSnap(!snap)}>{s.snap}</button>
      <button disabled={busy} onClick={mark}>{s.marker}</button>
      <button disabled={busy} onClick={() => edit((draft) => { addTrack(draft, 'video', id()); })}>{s.addVideo}</button>
      <button disabled={busy} onClick={() => edit((draft) => { addTrack(draft, 'audio', id()); })}>{s.addAudio}</button>
      <label className="timeline-zoom">{s.zoom}<input type="range" min={minZoom} max={maxZoom} value={zoom}
        onChange={(event) => changeZoom(event.target.valueAsNumber)} /></label>
      <button onClick={() => {
        setZoom(Math.max(minZoom, Math.min(maxZoom, (viewport.width - labelsWidth) / Math.max(1, length))));
        if (pane.current) pane.current.scrollLeft = 0;
      }}>{s.fitTimeline}</button>
      <span className="timeline-time">{timecode(playhead, fps)}</span>
      {message && <span className="muted" role="status">{message}</span>}
    </div>
    <div className="timeline-scroll" ref={pane}
      onScroll={(event) => setViewport({ width: event.currentTarget.clientWidth, left: event.currentTarget.scrollLeft })}>
      <div ref={surface} className="timeline-surface" style={{ width: width + labelsWidth }}
        onPointerMove={(event) => {
          if (!gesture) return;
          const at = point(event);
          if (gesture.kind === 'scrub') scrub(at.x);
          else setGesture({ ...gesture, point: at });
        }} onPointerUp={finish} onPointerCancel={() => setGesture(undefined)}>
        <div className="timeline-row ruler">
          <div className="track-label">{s.tracks}</div>
          <div className="track-lane" onPointerDown={(event) => {
            if (event.button !== 0) return;
            capture(event);
            setGesture({ kind: 'scrub' });
            scrub(point(event).x);
          }}>
            {ticks.map((time) => <span key={time} className="tick" style={{ left: time * zoom }}>
              {timecode(time, fps).slice(3)}
            </span>)}
            {project.markers?.map((marker, index) => <span key={index} className="timeline-marker"
              title={marker.label ?? s.marker} style={{ left: marker.time * zoom }} />)}
          </div>
        </div>
        {tracks.map((track, index) => <Fragment key={track.id}>
        {index === firstAudio && captionRows}
        <div className="timeline-row" data-track-id={track.id}>
          <div className="track-label">
            <span draggable={!busy} onDragStart={(event) => event.dataTransfer.setData(trackDragType, track.id)}
              onClick={() => { setSelected(new Set()); onSelect(undefined, track.id); }}
              onDragOver={(event) => { if (event.dataTransfer.types.includes(trackDragType)) event.preventDefault(); }}
              onDrop={(event) => {
                event.preventDefault();
                const from = event.dataTransfer.getData(trackDragType);
                if (from && !busy) attempt((draft) => reorderTrack(draft, from, track.id));
              }}>{track.name}</span>
            <button disabled={busy} aria-label={s.lockTrack} title={s.lockTrack} aria-pressed={!!track.locked}
              onClick={() => edit((draft) => {
                const found = draft.tracks.find((entry) => entry.id === track.id);
                if (found) found.locked = !found.locked;
              })}>⌑</button>
            {track.kind === 'video' && <button disabled={busy} aria-label={s.hideTrack} title={s.hideTrack}
              aria-pressed={!!track.hidden} onClick={() => edit((draft) => {
                const found = draft.tracks.find((entry) => entry.id === track.id);
                if (found) found.hidden = !found.hidden;
              })}>◉</button>}
            <button disabled={busy || track.locked} aria-label={s.removeTrack} title={s.removeTrack}
              onClick={() => attempt((draft) => removeTrack(draft, track.id))}>×</button>
          </div>
          <div className="track-lane" onPointerDown={(event) => {
            if (event.button !== 0 || busy) return;
            capture(event);
            const at = point(event);
            setGesture({ kind: 'box', origin: at, point: at, extend: event.shiftKey || event.ctrlKey });
          }} onDragOver={(event) => { if (event.dataTransfer.types.includes(assetDragType)) event.preventDefault(); }}
          onDrop={(event) => dropAsset(event, track.id)}>
            {track.clips.filter((clip) => clip.start <= visibleEnd && clip.start + clip.duration >= visibleStart)
              .map((clip) => <ClipBlock key={clip.id} clip={clip} asset={assets.get(clip.assetId ?? '')} zoom={zoom}
                active={selected.has(clip.id)} delta={gesture && 'ids' in gesture && gesture.ids.has(clip.id) ? dragDelta : 0}
                gesture={gesture && 'clip' in gesture ? gesture.kind : undefined}
                context={(event) => {
                  if (busy || clip.type !== 'video' || !assets.get(clip.assetId ?? '')?.hasAudio) return;
                  event.preventDefault();
                  setMenu({ id: clip.id, x: event.clientX, y: event.clientY });
                }}
                start={(event, kind) => startClip(event, clip, track, kind)} />)}
          </div>
        </div></Fragment>)}
        {firstAudio < 0 && captionRows}
        <div className="timeline-row">
          <div className="track-label" />
          <div className="track-lane add-lane muted"
            onDragOver={(event) => { if (event.dataTransfer.types.includes(assetDragType)) event.preventDefault(); }}
            onDrop={(event) => dropAsset(event)}>{s.dropTrack}</div>
        </div>
        <div className="timeline-playhead" style={{ left: labelsWidth + playhead * zoom }} />
        {gesture?.kind === 'box' && <div className="selection-box" style={{
          left: labelsWidth + Math.min(gesture.origin.x, gesture.point.x),
          top: Math.min(gesture.origin.y, gesture.point.y),
          width: Math.abs(gesture.origin.x - gesture.point.x),
          height: Math.abs(gesture.origin.y - gesture.point.y),
        }} />}
      </div>
    </div>
    {menu && <button className="clip-menu" style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()} onClick={() => {
        attempt((draft) => detachAudio(draft, menu.id, id(), id()));
        setMenu(undefined);
      }}>{s.detachAudio}</button>}
  </section>;
}

function ClipBlock({ clip, asset, zoom, active, delta, gesture, start, context }: {
  clip: Clip; asset?: Asset; zoom: number; active: boolean; delta: number; gesture?: 'move' | 'left' | 'right';
  start(event: PointerEvent, kind: 'move' | 'left' | 'right'): void;
  context(event: React.MouseEvent): void;
}) {
  const name = clip.text ?? asset?.path.split(/[\\/]/).at(-1) ?? s[clip.type];
  const left = (clip.start + (gesture === 'right' ? 0 : delta)) * zoom;
  const width = (clip.duration + (gesture === 'right' ? delta : gesture === 'left' ? -delta : 0)) * zoom;
  const tile = asset?.thumbPath && `url("editor-media://thumbnail/${encodeURIComponent(asset.id)}")`;
  return <div role="button" tabIndex={0} aria-label={name} aria-pressed={active} data-clip-id={clip.id}
    className={`timeline-clip clip-${clip.type}${active ? ' selected' : ''}`}
    style={{ left, width: Math.max(3, width), backgroundImage: tile || undefined }}
    onPointerDown={(event) => start(event, 'move')} onContextMenu={context}>
    <span>{name}</span>
    {asset?.waveformPath && (clip.type === 'audio' || (clip.type === 'video' && !clip.muted)) &&
      <Waveform asset={asset} clip={clip} />}
    <i className="trim left" onPointerDown={(event) => start(event, 'left')} />
    <i className="trim right" onPointerDown={(event) => start(event, 'right')} />
  </div>;
}
