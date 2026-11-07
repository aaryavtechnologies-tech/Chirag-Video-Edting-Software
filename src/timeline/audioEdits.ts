import type { Project, Clip } from '../types/project';
import { addTrack, findClip, overlaps } from './operations';

export function detachAudio(project: Project, id: string, audioId: string, trackId: string) {
  const found = findClip(project, id);
  if (!found || found.track.locked || found.clip.type !== 'video' ||
    !project.assets.some((asset) => asset.id === found.clip.assetId && asset.hasAudio)) return false;
  const video = found.clip;
  if (video.linkedClipId && findClip(project, video.linkedClipId)) return false;
  const audio: Clip = {
    id: audioId, type: 'audio', assetId: video.assetId, start: video.start, duration: video.duration,
    sourceIn: video.sourceIn, sourceOut: video.sourceOut, speed: video.speed, volume: video.volume,
    fadeIn: video.fadeIn, fadeOut: video.fadeOut, linkedClipId: video.id,
  };
  const track = project.tracks.find((item) => item.kind === 'audio' && !item.locked &&
    item.clips.every((clip) => !overlaps(clip, audio))) ?? addTrack(project, 'audio', trackId);
  track.clips.push(audio);
  video.muted = true;
  video.linkedClipId = audio.id;
  return true;
}

export function changeSpeed(project: Project, id: string, value: number) {
  const found = findClip(project, id);
  if (!found || found.track.locked || !Number.isFinite(value) || value < 0.25 || value > 4) return false;
  const { track, clip } = found;
  if (clip.type !== 'video' && clip.type !== 'audio') return false;
  const first = clip.sourceIn ?? 0;
  const last = clip.sourceOut ?? first + clip.duration * (clip.speed ?? 1);
  const next = { ...clip, speed: value, duration: (last - first) / value };
  if (next.duration < 1 / project.settings.fps ||
    track.clips.some((other) => other.id !== id && overlaps(next, other))) return false;
  Object.assign(clip, next);
  return true;
}
