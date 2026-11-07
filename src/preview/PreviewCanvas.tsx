import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { strings as s } from '../lib/strings';
import { alignFrame, timecode } from '../lib/time';
import { findClip, projectDuration } from '../timeline/operations';
import type { Project } from '../types/project';
import { activeLayers, clipTransform, drawLayer, layerSize, type Transform } from './compositor';
import { drawHandles, hitHandle, type Handle } from './handles';
import { MediaElements } from './mediaElements';
import type { usePlayback } from './usePlayback';

type Quality = 'full' | 'half' | 'quarter';
const qualityDivisors = { full: 1, half: 2, quarter: 4 } as const;
type Point = { x: number; y: number };
type Drag = { clipId: string; handle: Handle; start: Point; initial: Transform; next: Transform; guides: Point };

interface Props {
  project: Project;
  playback: ReturnType<typeof usePlayback>;
  edit(recipe: (draft: Project) => void): void;
}

export function PreviewCanvas({ project, playback, edit }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const media = useRef(new MediaElements());
  const redraw = useRef<() => void>(() => undefined);
  const [quality, setQuality] = useState<Quality>('half');
  const [selected, setSelected] = useState<string>();
  const [status, setStatus] = useState('');
  const [drag, setDrag] = useState<Drag>();
  const { playhead, playing, seek, toggle, loop, setLoop } = playback;
  const { width, height, background = '#000000', fps } = project.settings;
  const duration = useMemo(() => projectDuration(project), [project]);
  const assets = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const divisor = qualityDivisors[quality];
  const canvasWidth = Math.round(width / divisor);
  const canvasHeight = Math.round(height / divisor);

  useEffect(() => {
    const current = media.current;
    return () => current.clear();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d', { alpha: false });
    if (!element || !ctx) return;
    const layers = activeLayers(project, playhead);
    function draw() {
      if (!element || !ctx) return;
      ctx.fillStyle = /^#[\da-f]{6}$/i.test(background) ? background : '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      const active = new Set<string>();
      let missing = false;
      let loading = false;
      for (const clip of layers) {
        if (clip.type === 'text' || clip.type === 'audio') continue;
        const asset = assets.get(clip.assetId ?? '');
        if (!asset) { missing = true; continue; }
        active.add(clip.id);
        const { element: source, failed } = media.current.use(clip, asset, quality !== 'full', () => redraw.current());
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
        const transform = drag?.clipId === clip.id ? drag.next : clipTransform(clip);
        const size = layerSize(clip, asset, canvasWidth, canvasHeight);
        drawLayer(ctx, source, clip, playhead, size, transform);
      }
      media.current.suspendExcept(active);
      const current = layers.find((clip) => clip.id === selected);
      const unit = element.clientWidth ? canvasWidth / element.clientWidth : 1;
      if (current && !playing) {
        const asset = assets.get(current.assetId ?? '');
        const transform = drag?.clipId === current.id ? drag.next : clipTransform(current);
        drawHandles(ctx, layerSize(current, asset, canvasWidth, canvasHeight), transform, unit);
      }
      if (drag && !playing) {
        ctx.strokeStyle = '#f9b257';
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
    draw();
  }, [assets, project, playhead, playing, quality, background, canvasWidth, canvasHeight, selected, drag]);

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
      const size = layerSize(clip, assets.get(clip.assetId ?? ''), canvasWidth, canvasHeight);
      const handle = hitHandle(at, initial, bounds, size, unit, clip.id === selected);
      if (!handle) continue;
      setSelected(clip.id);
      if (findClip(project, clip.id)?.track.locked) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ clipId: clip.id, start: at, handle, initial, next: initial, guides: { x: -1, y: -1 } });
      return;
    }
    setSelected(undefined);
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

  return <div className="editor-stage">
    <div className="preview-surface" style={{ aspectRatio: width / height, width: `min(100%, ${45 * width / height}vh)` }}>
      <canvas ref={canvas} aria-label={s.preview} width={canvasWidth} height={canvasHeight}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(undefined)} />
      {status && <span className="preview-status" role="status">{status}</span>}
    </div>
    <div className="transport">
      <button onClick={() => step(-1)} aria-label={s.previousFrame}>⏮</button>
      <button disabled={duration <= 0} onClick={toggle}>{playing ? s.pause : s.play}</button>
      <button onClick={() => step(1)} aria-label={s.nextFrame}>⏭</button>
      <button aria-pressed={loop} onClick={() => setLoop(!loop)}>{s.loop}</button>
      <span className="muted">{timecode(playhead, fps)}</span>
      <label>{s.quality}<select value={quality} onChange={(event) => setQuality(event.target.value as Quality)}>
        {(Object.keys(qualityDivisors) as Quality[]).map((key) => <option key={key} value={key}>{s[key]}</option>)}
      </select></label>
    </div>
    <p className="muted">{width} × {height} · {fps} {s.fps}</p>
  </div>;
}
