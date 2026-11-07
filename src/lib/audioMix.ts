import type { Asset, Clip, Project, Track } from '../types/project';

export interface AudioLayer { track: Track; clip: Clip; asset: Asset }

export function audioLayers(project: Project): AudioLayer[] {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const solo = project.tracks.some((track) => track.kind === 'audio' && track.solo);
  return project.tracks.flatMap((track) => {
    if (track.muted || (solo && !(track.kind === 'audio' && track.solo))) return [];
    return track.clips.flatMap((clip) => {
      if (clip.muted || (clip.type !== 'audio' && clip.type !== 'video')) return [];
      const asset = assets.get(clip.assetId ?? '');
      return asset && (asset.type === 'audio' || asset.hasAudio) ? [{ track, clip, asset }] : [];
    });
  });
}

export function audioGain(track: Track, clip: Clip) {
  return Math.max(0, track.volume ?? 1) * (clip.volume ?? 1);
}
