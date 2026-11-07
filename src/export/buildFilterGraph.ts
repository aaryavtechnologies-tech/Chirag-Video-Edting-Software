import type { Clip, Project } from '../types/project';
import type { ExportSettings } from '../types/export';
import { audioGain, audioLayers } from '../lib/audioMix';
import { clipTransform, fittedSize, radians } from '../preview/compositor';
import { projectDuration } from '../timeline/operations';

export type RasterInput = { path: string; width: number; height: number };
export type ExportGraph = { inputs: string[]; script: string; duration: number };
const fixed = (number: number) => Number(number.toFixed(9)).toString();
const colour = (value: string | undefined) => /^#[\da-f]{6}$/i.test(value ?? '') ? '0x' + value!.slice(1) : 'black';
const even = (number: number) => Math.max(2, Math.round(number / 2) * 2);

function audioTempo(rate: number) {
  const factors: number[] = [];
  while (rate < 0.5) { factors.push(0.5); rate /= 0.5; }
  while (rate > 2) { factors.push(2); rate /= 2; }
  if (rate !== 1) factors.push(rate);
  return factors.map((value) => `atempo=${fixed(value)}`);
}

function clipFades(clip: Clip, audio: boolean) {
  const filters: string[] = [];
  const filter = audio ? 'afade' : 'fade';
  const options = audio ? '' : ':alpha=1';
  if (clip.fadeIn && clip.fadeIn > 0) filters.push(`${filter}=t=in:st=0:d=${fixed(clip.fadeIn)}${options}`);
  if (clip.fadeOut && clip.fadeOut > 0) filters.push(
    `${filter}=t=out:st=${fixed(Math.max(0, clip.duration - clip.fadeOut))}:d=${fixed(clip.fadeOut)}${options}`);
  return filters;
}

function sourceTime(clip: Clip) {
  const start = clip.sourceIn ?? 0;
  const speed = clip.speed ?? 1;
  return { start, speed, end: Math.min(clip.sourceOut ?? Infinity, start + clip.duration * speed) };
}

export function buildFilterGraph(project: Project, settings: ExportSettings, rasters: ReadonlyMap<string, RasterInput>): ExportGraph {
  const total = projectDuration(project);
  const range = settings.range ?? { start: 0, end: total };
  const duration = range.end - range.start;
  if (!(duration > 0) || range.end > total + 0.000001) throw new Error('Invalid export range');
  const { width, height, fps, mode } = settings;
  const stage = fittedSize(width, height, project.settings.width, project.settings.height, false);
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const inputs: string[] = [];
  const graph: string[] = [];
  const input = (path: string) => {
    const index = inputs.length / 2;
    inputs.push('-i', path);
    return index;
  };

  if (mode !== 'audio') {
    graph.push(`color=c=${colour(project.settings.background)}:s=${width}x${height}:r=${fps}:d=${fixed(total)}[base]`);
    let under = 'base';
    let layers = 0;
    const tracks = project.tracks.filter((track) => track.kind === 'video' && !track.hidden)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.type === 'audio') continue;
        const text = clip.type === 'text';
        const raster = rasters.get(clip.id);
        const asset = assets.get(clip.assetId ?? '');
        const path = text ? raster?.path : asset?.path;
        if (!path) throw new Error(`Missing source for clip ${clip.id}`);
        const index = input(path);
        const still = clip.type !== 'video';
        const size = text && raster ? raster : fittedSize(stage.width, stage.height,
          asset?.width || stage.width, asset?.height || stage.height, clip.fit === 'cover');
        const transform = clipTransform(clip);
        const w = even(size.width * Math.max(0.01, transform.scale));
        const h = even(size.height * Math.max(0.01, transform.scale));
        const animation = text ? clip.style : undefined;
        const animationTime = Math.min(5, Math.max(0.01, animation?.animationDuration ?? 0.4));
        const fade = clipFades(clip, false);
        if (animation?.animationIn === 'fade') fade.push(`fade=t=in:st=0:d=${fixed(animationTime)}:alpha=1`);
        if (animation?.animationOut === 'fade') fade.push(
          `fade=t=out:st=${fixed(Math.max(0, clip.duration - animationTime))}:d=${fixed(animationTime)}:alpha=1`);
        const timing = sourceTime(clip);
        const filters = still ? [
          'trim=end_frame=1', 'loop=loop=-1:size=1:start=0', `setpts=N/${fps}/TB`,
        ] : [
          `trim=start=${fixed(timing.start)}:end=${fixed(timing.end)}`,
          `setpts=(PTS-STARTPTS)/${fixed(timing.speed)}`, `fps=${fps}`,
          `tpad=stop_mode=clone:stop_duration=${fixed(1 / fps)}`,
        ];
        filters.push(`trim=duration=${fixed(clip.duration)}`, 'format=rgba');
        const pop = animation?.animationIn === 'pop';
        const popScale = `(0.75+0.25*min(1,t/${fixed(animationTime)}))`;
        filters.push(pop ? `scale=w='max(2,round(${w}*${popScale}/2)*2)':h='max(2,round(${h}*${popScale}/2)*2)':eval=frame` :
          `scale=${w}:${h}:flags=bicubic`, 'setsar=1');
        if (transform.rotation) {
          const angle = fixed(radians(transform.rotation));
          // Use a fixed rotation canvas even when a text animation changes its scale.
          filters.push(`rotate=${angle}:ow=ceil(rotw(${angle})/2)*2:oh=ceil(roth(${angle})/2)*2:c=none`);
        }
        if (transform.opacity !== 1) filters.push(`colorchannelmixer=aa=${fixed(transform.opacity)}`);
        filters.push('format=yuva420p', ...fade, `setpts=PTS+${fixed(clip.start)}/TB`);
        graph.push(`[${index}:V:0]${filters.join(',')}[layer${layers}]`);
        const x = `${fixed((width - stage.width) / 2 + transform.x * stage.width)}-overlay_w/2`;
        let y = `${fixed((height - stage.height) / 2 + transform.y * stage.height)}-overlay_h/2`;
        if (animation?.animationIn === 'slideUp') y +=
          `+${fixed(0.12 * stage.height)}*(1-clip((t-${fixed(clip.start)})/${fixed(animationTime)},0,1))`;
        if (animation?.animationOut === 'slideDown') y +=
          `+${fixed(0.12 * stage.height)}*(1-clip((${fixed(clip.start + clip.duration)}-t)/${fixed(animationTime)},0,1))`;
        const next = 'mixv' + layers;
        graph.push(`[${under}][layer${layers}]overlay=x='${x}':y='${y}':eof_action=pass:repeatlast=0:enable='gte(t,${fixed(clip.start)})*lt(t,${fixed(clip.start + clip.duration)})'[${next}]`);
        under = next;
        layers += 1;
      }
    }
    graph.push(`[${under}]trim=start=${fixed(range.start)}:end=${fixed(range.end)},setpts=PTS-STARTPTS,format=yuv420p[vout]`);
  }

  const audioInputs = ['silence'];
  graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${fixed(total)}[silence]`);
  for (const { track, clip, asset } of audioLayers(project)) {
    const index = input(asset.path);
    const { start, end, speed } = sourceTime(clip);
    const label = 'audio' + audioInputs.length;
    const filters = [
      `atrim=start=${fixed(start)}:end=${fixed(end)}`, 'asetpts=PTS-STARTPTS',
      'aformat=sample_rates=48000:channel_layouts=stereo', ...audioTempo(speed),
      `atrim=duration=${fixed(clip.duration)}`, `volume=${fixed(audioGain(track, clip))}`,
      ...clipFades(clip, true), `adelay=${Math.round(clip.start * 48000)}S:all=1`,
    ];
    graph.push(`[${index}:a:0]${filters.join(',')}[${label}]`);
    audioInputs.push(label);
  }
  const mix = audioInputs.length === 1 ? '[silence]anull' :
    `${audioInputs.map((label) => `[${label}]`).join('')}amix=inputs=${audioInputs.length}:duration=first:normalize=0`;
  const output = mode === 'both' ? 'asplit=2[aout][aonly]' : 'anull[aout]';
  graph.push(`${mix},volume=${fixed(settings.volume)},alimiter=limit=1:level=0:latency=1,atrim=start=${fixed(range.start)}:end=${fixed(range.end)},asetpts=PTS-STARTPTS,${output}`);
  return { inputs, script: graph.join(';\n'), duration };
}
