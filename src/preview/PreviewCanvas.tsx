import { Grid3X3, Maximize, Pause, Play, Repeat, Ruler, Scan, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { IconButton } from '../design-system/IconButton';
import { ratioLabel } from '../lib/geometry';
import { Select } from '../design-system/Select';
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent } from 'react';
import { strings as s } from '../lib/strings';
import { alignFrame, timecode } from '../lib/time';
import { findClip, projectDuration } from '../timeline/operations';
import type { Project } from '../types/project';
import { activeLayers, clipTransform, drawLayer, layerSize, type Transform } from './compositor';
import { drawHandles, hitHandle, type Handle } from './handles';
import { MediaElements } from './mediaElements';
import type { usePlayback } from './usePlayback';
import { loadClipFont, rasterClip } from '../text/rasterClip';
import { animateText } from '../lib/textMotion';
import { drawAnimatedText } from '../text/drawAnimatedText';
import type { Clip } from '../types/project';

type Quality = 'full' | 'half' | 'quarter';
const qualityDivisors = { full: 1, half: 2, quarter: 4 } as const;
type Point = { x: number; y: number };
type Drag = { clipId: string; handle: Handle; start: Point; initial: Transform; next: Transform; guides: Point };

interface Props {
  project: Project;
  playback: ReturnType<typeof usePlayback>;
  edit(recipe: (draft: Project) => void): void;
  volume: number; setVolume(value: number): void; peak: number;
  selected?: string; onSelect(clipId?: string, trackId?: string): void;
  snapshot: MutableRefObject<(() => string | undefined) | undefined>;
  onQuality?(quality: Quality): void;
  safeGuides?: boolean; toggleGuides(): void;
}

export function PreviewCanvas({ project, playback, edit, volume, setVolume, peak, selected, onSelect, snapshot, onQuality, safeGuides, toggleGuides }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const media = useRef(new MediaElements());
  const redraw = useRef<() => void>(() => undefined);
  const [quality, setQuality] = useState<Quality>('half');
  const [viewZoom, setViewZoom] = useState('fit');
  const [grid, setGrid] = useState(false);
  const [rulers, setRulers] = useState(false);
  const space = useRef(false);
  const pan = useRef<{ x: number; y: number; left: number; top: number }>();
  const panned = useRef(false);
  useEffect(() => { onQuality?.(quality); }, [quality, onQuality]);
  const [inline, setInline] = useState<string>();
  const texts = useRef(new Map<string, { key: string; canvas: HTMLCanvasElement }>());
  const [status, setStatus] = useState('');
  const [drag, setDrag] = useState<Drag>();
  const { playhead, playing, seek, toggle, loop, setLoop } = playback;
  const { width, height, background = '#000000', fps } = project.settings;
  const duration = useMemo(() => projectDuration(project), [project]);
  const assets = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const divisor = qualityDivisors[quality];
  const canvasWidth = Math.round(width / divisor);
  const canvasHeight = Math.round(height / divisor);

  function textSurface(clip: Clip) {
    const key = JSON.stringify([clip.text, clip.style, clip.shape, divisor]);
    const cached = texts.current.get(clip.id);
    if (cached?.key === key) return cached.canvas;
    const surface = rasterClip(clip, 1 / divisor);
    if (texts.current.size >= 16) texts.current.delete(texts.current.keys().next().value!);
    texts.current.set(clip.id, { key, canvas: surface });
    void loadClipFont(clip).then(() => {
      const current = texts.current.get(clip.id);
      if (current?.canvas === surface) current.canvas = rasterClip(clip, 1 / divisor);
      redraw.current();
    });
    return surface;
  }

  function sizeFor(clip: Clip) {
    if (clip.type === 'text') {
      const surface = textSurface(clip);
      return { width: surface.width, height: surface.height };
    }
    return layerSize(clip, assets.get(clip.assetId ?? ''), canvasWidth, canvasHeight);
  }

  useEffect(() => {
    const current = media.current;
    return () => current.clear();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d', { alpha: false });
    if (!element || !ctx) return;
    const layers = activeLayers(project, playhead);
    function draw(handles = true) {
      if (!element || !ctx) return;
      ctx.fillStyle = /^#[\da-f]{6}$/i.test(background) ? background : '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      const active = new Set<string>();
      let missing = false;
      let loading = false;
      for (const clip of layers) {
        if (clip.type === 'audio') continue;
        const transform = drag?.clipId === clip.id ? drag.next : clipTransform(clip);
        if (clip.type === 'text') {
          const text = textSurface(clip);
          if (clip.id !== inline) drawAnimatedText(ctx, text, clip, playhead, transform);
          continue;
        }
        const asset = assets.get(clip.assetId ?? '');
        if (!asset) { missing = true; continue; }
        active.add(clip.id);
        const { element: source, failed, still } = media.current.use(clip, asset, quality !== 'full', () => redraw.current());
        if (failed) { missing = true; continue; }
        if (source instanceof HTMLVideoElement) {
          const rate = clip.speed ?? 1;
          const position = (clip.sourceIn ?? 0) + (playhead - clip.start) * rate;
          if (source.readyState >= HTMLMediaElement.HAVE_METADATA) {
            const target = Math.max(0, Math.min(position, source.duration - 0.001));
            const tolerance = playing ? 0.08 : 0.005;
            if (Number.isFinite(target) && Math.abs(source.currentTime - target) > tolerance && !source.seeking) {
              source.currentTime = target;
            }
            source.playbackRate = rate;
            if (playing && source.paused) void source.play().catch(() => undefined);
            if (!playing && !source.paused) source.pause();
          }
          if (source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || source.seeking) { loading = true; continue; }
        } else if (!source.complete || !source.naturalWidth) { loading = true; continue; }
        const size = layerSize(clip, asset, canvasWidth, canvasHeight);
        drawLayer(ctx, still ?? source, clip, playhead, size, transform);
      }
      media.current.suspendExcept(active);
      const current = layers.find((clip) => clip.id === selected);
      const unit = element.clientWidth ? canvasWidth / element.clientWidth : 1;
      if (current && !playing && handles) {
        const transform = drag?.clipId === current.id ? drag.next : clipTransform(current);
        if (current.id !== inline) drawHandles(ctx, sizeFor(current),
          current.type === 'text' ? animateText(current, transform, playhead) : transform, unit);
      }
      if (drag && !playing && handles) {
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = unit;
        ctx.beginPath();
        if (drag.guides.x >= 0) {
          ctx.moveTo(drag.guides.x * canvasWidth, 0);
          ctx.lineTo(drag.guides.x * canvasWidth, canvasHeight);
        }
        if (drag.guides.y >= 0) {
          ctx.moveTo(0, drag.guides.y * canvasHeight);
          ctx.lineTo(canvasWidth, drag.guides.y * canvasHeight);
        }
        ctx.stroke();
      }
      setStatus(missing ? s.missingPreview : loading ? s.seeking : '');
    }
    redraw.current = draw;
    snapshot.current = () => {
      if (!element || !layers.length) return;
      try {
        draw(false);
        const thumb = document.createElement('canvas');
        const scale = Math.min(320 / element.width, 180 / element.height);
        thumb.width = Math.max(1, Math.round(element.width * scale));
        thumb.height = Math.max(1, Math.round(element.height * scale));
        thumb.getContext('2d')!.drawImage(element, 0, 0, thumb.width, thumb.height);
        return thumb.toDataURL('image/jpeg', 0.8).split(',')[1];
      } catch {
        return undefined;
      } finally {
        draw();
      }
    };
    draw();
    return () => { snapshot.current = undefined; };
  });

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvasWidth / rect.width,
      y: (event.clientY - rect.top) * canvasHeight / rect.height };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || playing) return;
    const at = point(event);
    const bounds = { width: canvasWidth, height: canvasHeight };
    const unit = canvasWidth / event.currentTarget.clientWidth;
    const layers = activeLayers(project, playhead).reverse();
    layers.sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
    for (const clip of layers) {
      const initial = clipTransform(clip);
      const size = sizeFor(clip);
      const visible = clip.type === 'text' ? animateText(clip, initial, playhead) : initial;
      const handle = hitHandle(at, visible, bounds, size, unit, clip.id === selected);
      if (!handle) continue;
      const track = findClip(project, clip.id)?.track;
      onSelect(clip.id, track?.id);
      if (track?.locked) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ clipId: clip.id, start: at, handle, initial, next: initial, guides: { x: -1, y: -1 } });
      return;
    }
    onSelect();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drag) return;
    const at = point(event);
    const { initial, start, handle } = drag;
    const next = { ...initial };
    const guides = { x: -1, y: -1 };
    if (handle === 'move') {
      const x = Math.max(0, Math.min(1, initial.x + (at.x - start.x) / canvasWidth));
      const y = Math.max(0, Math.min(1, initial.y + (at.y - start.y) / canvasHeight));
      const near = (value: number) => [0, 0.5, 1].find((line) => Math.abs(value - line) <= 0.015);
      guides.x = near(x) ?? -1;
      guides.y = near(y) ?? -1;
      next.x = guides.x >= 0 ? guides.x : x;
      next.y = guides.y >= 0 ? guides.y : y;
    } else {
      const centre = { x: initial.x * canvasWidth, y: initial.y * canvasHeight };
      if (handle === 'rotate') {
        const angle = (p: Point) => Math.atan2(p.y - centre.y, p.x - centre.x);
        next.rotation = initial.rotation + (angle(at) - angle(start)) * 180 / Math.PI;
      } else {
        const distance = (p: Point) => Math.hypot(p.x - centre.x, p.y - centre.y);
        next.scale = Math.max(0.05, Math.min(20, initial.scale * distance(at) / Math.max(1, distance(start))));
      }
    }
    setDrag({ ...drag, next, guides });
  }

  function end() {
    if (!drag) return;
    if (drag.next !== drag.initial) edit((draft) => {
      const found = findClip(draft, drag.clipId);
      if (found) found.clip.transform = { ...found.clip.transform, ...drag.next };
    });
    setDrag(undefined);
  }

  const step = (direction: number) =>
    seek(Math.min(duration, Math.max(0, alignFrame(playhead + direction / fps, fps))));
  const editing = inline && findClip(project, inline)?.clip;

  const ratio = ratioLabel(width, height);
  return <div className="editor-stage" ref={stage}>
    <div className="preview-options">
      <span className="preview-ratio">{ratio ?? `${width} × ${height}`}</span>
      <IconButton label={s.safeZones} aria-pressed={safeGuides} onClick={toggleGuides}><Scan size={15} /></IconButton>
      <IconButton label={s.grid} aria-pressed={grid} onClick={() => setGrid(!grid)}><Grid3X3 size={15} /></IconButton>
      <IconButton label={s.rulers} aria-pressed={rulers} onClick={() => setRulers(!rulers)}><Ruler size={15} /></IconButton>
      <Select label={s.previewZoom} value={viewZoom} onChange={(event) => setViewZoom(event.target.value)}>
        <option value="fit">{s.fitPreview}</option>
        {['50', '100', '200'].map((zoom) => <option key={zoom} value={zoom}>{zoom}%</option>)}
      </Select>
    </div>
    <div className="preview-viewport" tabIndex={0} aria-label={s.previewTools} onBlur={() => { space.current = false; }}
      onKeyDown={(event) => {
        if (event.code !== 'Space' || event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) { space.current = true; panned.current = false; }
      }} onKeyUp={(event) => {
        if (event.code !== 'Space' || !space.current) return;
        event.preventDefault();
        space.current = false;
        if (!panned.current) toggle();
      }} onPointerDownCapture={(event) => {
        if (!space.current || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const viewport = event.currentTarget;
        pan.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
        viewport.setPointerCapture(event.pointerId);
      }} onPointerMove={(event) => {
        if (!pan.current) return;
        event.stopPropagation();
        panned.current = true;
        event.currentTarget.scrollLeft = pan.current.left - event.clientX + pan.current.x;
        event.currentTarget.scrollTop = pan.current.top - event.clientY + pan.current.y;
      }} onLostPointerCapture={() => { pan.current = undefined; }}>
    <div className="preview-surface" style={{ aspectRatio: width / height, '--preview-ratio': width / height,
      width: viewZoom === 'fit' ? undefined : Math.round(width * Number(viewZoom) / 100) } as React.CSSProperties}>
      <canvas ref={canvas} aria-label={s.preview} width={canvasWidth} height={canvasHeight}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(undefined)}
        onDoubleClick={() => {
          const target = selected && findClip(project, selected);
          if (target && target.clip.type === 'text' && !target.clip.shape && !target.track.locked) setInline(target.clip.id);
        }} />
      {editing && <textarea className="inline-text" aria-label={s.inlineText} defaultValue={editing.text}
        style={{ left: `${clipTransform(editing).x * 100}%`, top: `${clipTransform(editing).y * 100}%` }}
        autoFocus rows={3} maxLength={5000} onBlur={(event) => {
          const text = event.target.value;
          edit((draft) => {
            const target = findClip(draft, editing.id);
            if (target && !target.track.locked) target.clip.text = text;
          });
          setInline(undefined);
        }} onKeyDown={(event) => {
          if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
            event.currentTarget.blur();
          }
        }} />}
      {status && <span className="preview-status" role="status">{status}</span>}
      {safeGuides && <div className={`safe-guide ${width <= height ? 'platform-safe' : ''}`} role="img"
        aria-label={width <= height ? s.platformSafe : s.titleSafe} />}
      {grid && <div className="preview-grid" aria-hidden="true" />}
      {rulers && <div className="preview-rulers" aria-hidden="true" />}
    </div>
    </div>
    <div className="transport">
      <time>{timecode(playhead, fps)} <span>/ {timecode(duration, fps)}</span></time>
      <div className="transport-playback">
        <IconButton onClick={() => step(-1)} label={s.previousFrame}><SkipBack size={15} /></IconButton>
        <IconButton className="primary transport-play" disabled={duration <= 0} onClick={toggle} label={playing ? s.pause : s.play}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </IconButton>
        <IconButton onClick={() => step(1)} label={s.nextFrame}><SkipForward size={15} /></IconButton>
        <IconButton aria-pressed={loop} onClick={() => setLoop(!loop)} label={s.loop}><Repeat size={15} /></IconButton>
      </div>
      <div className="transport-options">
        <Select label={s.quality} value={quality} onChange={(event) => setQuality(event.target.value as Quality)}>
          {(Object.keys(qualityDivisors) as Quality[]).map((key) => <option key={key} value={key}>{s[key]}</option>)}
        </Select>
        <label title={s.masterVolume}>{volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          <input aria-label={s.masterVolume} type="range" min={0} max={1} step={0.01} value={volume}
            onChange={(event) => setVolume(event.target.valueAsNumber)} />
        </label>
        <meter aria-label={s.audioMeter} min={0} max={1} value={Math.min(1, peak)} />
        <IconButton label={s.fullscreenPreview} onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void stage.current?.requestFullscreen();
        }}><Maximize size={15} /></IconButton>
      </div>
    </div>
  </div>;
}
