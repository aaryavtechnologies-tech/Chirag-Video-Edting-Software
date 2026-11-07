import type { Asset, Clip, Project, Track } from '../types/project';
import { strings } from '../lib/strings';

const epsilon = 1e-7;
const end = (clip: Clip) => clip.start + clip.duration;
const sourceStart = (clip: Clip) => clip.sourceIn ?? 0;
const speed = (clip: Clip) => clip.speed ?? 1;
const sourceEnd = (clip: Clip) => clip.sourceOut ?? sourceStart(clip) + clip.duration * speed(clip);
const timed = (clip: Clip) => clip.type === 'audio' || clip.type === 'video';
const family = (kind: Clip['type']): Track['kind'] => kind === 'audio' ? 'audio' : 'video';
const sameKind = (project: Project, kind: Track['kind']) => project.tracks.filter((track) => track.kind === kind);

export function projectDuration(project: Project) {
  return project.tracks.reduce((length, track) =>
    track.clips.reduce((max, clip) => Math.max(max, end(clip)), length), 0);
}

export function findClip(project: Project, id: string) {
  for (const track of project.tracks) {
    const clip = track.clips.find((entry) => entry.id === id);
    if (clip) return { track, clip };
  }
}

export function overlaps(a: Clip, b: Clip) {
  return a.start < end(b) - epsilon && b.start < end(a) - epsilon;
}

export function addTrack(project: Project, kind: Track['kind'], id: string) {
  const tracks = sameKind(project, kind);
  const prefix = kind === 'audio' ? strings.trackAudio : strings.trackVideo;
  let index = tracks.length + 1;
  while (tracks.some((track) => track.name === prefix + index)) index += 1;
  const track: Track = { id, kind, name: prefix + index, order: tracks.length, clips: [] };
  project.tracks.push(track);
  return track;
}

export function orderTracks(project: Project, kind: Track['kind']) {
  sameKind(project, kind).forEach((track, index) => { track.order = index; });
}

export function removeTrack(project: Project, id: string) {
  const index = project.tracks.findIndex((track) => track.id === id && !track.locked);
  if (index < 0) return false;
  const [track] = project.tracks.splice(index, 1);
  orderTracks(project, track.kind);
  return true;
}

export function reorderTrack(project: Project, id: string, before: string) {
  const from = project.tracks.findIndex((track) => track.id === id);
  const to = project.tracks.findIndex((track) => track.id === before);
  if (from < 0 || to < 0 || from === to || project.tracks[from].kind !== project.tracks[to].kind) return false;
  const [track] = project.tracks.splice(from, 1);
  project.tracks.splice(to, 0, track);
  orderTracks(project, track.kind);
  return true;
}

export function insertAsset(project: Project, asset: Asset, trackId: string | undefined, start: number, id: string, newTrackId: string) {
  const kind = family(asset.type);
  if (!Number.isFinite(start) || start < 0) return false;
  const duration = asset.duration ?? (asset.type === 'image' ? 5 : 0);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  const clip: Clip = { id, assetId: asset.id, type: asset.type, start, duration,
    ...(asset.type === 'image' ? {} : { sourceIn: 0, sourceOut: duration }) };
  const track = trackId ? project.tracks.find((entry) => entry.id === trackId) : addTrack(project, kind, newTrackId);
  if (!track || track.kind !== kind || track.locked || track.clips.some((other) => overlaps(clip, other))) return false;
  track.clips.push(clip);
  return true;
}

export function moveClips(project: Project, ids: ReadonlySet<string>, anchor: string, destination: string, delta: number) {
  const from = findClip(project, anchor);
  const target = project.tracks.find((track) => track.id === destination);
  if (!Number.isFinite(delta) || !from || !target || target.kind !== from.track.kind || !ids.has(anchor)) return false;
  const offset = sameKind(project, target.kind).indexOf(target) - sameKind(project, target.kind).indexOf(from.track);
  const moves: { track: Track; target: Track; clip: Clip }[] = [];
  for (const track of project.tracks) {
    const siblings = sameKind(project, track.kind);
    const next = offset === 0 ? track : track.kind === target.kind ? siblings[siblings.indexOf(track) + offset] : undefined;
    for (const clip of track.clips) {
      if (!ids.has(clip.id)) continue;
      if (!next || track.locked || next.locked || clip.start + delta < -epsilon) return false;
      moves.push({ track, target: next, clip: { ...clip, start: Math.max(0, clip.start + delta) } });
    }
  }
  for (const move of moves) {
    if (move.target.clips.some((clip) => !ids.has(clip.id) && overlaps(clip, move.clip))) return false;
  }
  for (const move of moves) {
    const index = move.track.clips.findIndex((clip) => clip.id === move.clip.id);
    move.track.clips.splice(index, 1);
    move.target.clips.push(move.clip);
  }
  return moves.length > 0;
}

export function trimClip(project: Project, id: string, edge: 'left' | 'right', time: number) {
  const found = findClip(project, id);
  if (!found || found.track.locked || !Number.isFinite(time)) return false;
  const { track, clip } = found;
  const start = edge === 'left' ? time : clip.start;
  const finish = edge === 'right' ? time : end(clip);
  if (start < 0 || finish - start < 1 / project.settings.fps - epsilon) return false;
  const next: Clip = { ...clip, start, duration: finish - start };
  if (timed(clip)) {
    const first = sourceStart(clip) + (start - clip.start) * speed(clip);
    const last = sourceEnd(clip) + (finish - end(clip)) * speed(clip);
    const assetDuration = project.assets.find((asset) => asset.id === clip.assetId)?.duration;
    if (first < -epsilon || last <= first || (assetDuration !== undefined && last > assetDuration + epsilon)) return false;
    next.sourceIn = Math.max(0, first);
    next.sourceOut = assetDuration === undefined ? last : Math.min(last, assetDuration);
  }
  if (track.clips.some((other) => other.id !== id && overlaps(next, other))) return false;
  Object.assign(clip, next);
  return true;
}

export function splitClips(project: Project, ids: ReadonlySet<string>, time: number, newId: () => string) {
  if (!Number.isFinite(time)) return false;
  const frame = 1 / project.settings.fps;
  let changed = false;
  for (const track of project.tracks) {
    if (track.locked) continue;
    for (const clip of [...track.clips]) {
      if (ids.size && !ids.has(clip.id)) continue;
      const left = time - clip.start;
      const right = end(clip) - time;
      if (left < frame - epsilon || right < frame - epsilon) continue;
      const second = { ...clip, id: newId(), start: time, duration: right };
      if (timed(clip)) {
        const at = sourceStart(clip) + left * speed(clip);
        second.sourceIn = at;
        second.sourceOut = sourceEnd(clip);
        clip.sourceOut = at;
      }
      clip.duration = left;
      track.clips.push(second);
      changed = true;
    }
  }
  return changed;
}

export function deleteClips(project: Project, ids: ReadonlySet<string>, ripple: boolean) {
  for (const track of project.tracks) {
    if (track.locked) continue;
    const removed = track.clips.filter((clip) => ids.has(clip.id));
    if (!removed.length) continue;
    track.clips = track.clips.filter((clip) => !ids.has(clip.id));
    if (ripple) {
      for (const clip of track.clips) {
        const shift = removed.reduce((total, item) => end(item) <= clip.start + epsilon ? total + item.duration : total, 0);
        clip.start = Math.max(0, clip.start - shift);
      }
    }
  }
}
