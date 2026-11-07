import type { Project } from '../types/project';

export function snapTargets(project: Project, playhead: number, excluded: ReadonlySet<string>) {
  return [0, playhead, ...(project.markers ?? []).map((marker) => marker.time),
    ...project.tracks.flatMap((track) => track.clips.filter((clip) => !excluded.has(clip.id))
      .flatMap((clip) => [clip.start, clip.start + clip.duration]))];
}

export function snappedDelta(edges: number[], delta: number, targets: number[], tolerance: number) {
  let nearest = tolerance;
  let adjustment = 0;
  for (const edge of edges) {
    for (const target of targets) {
      const difference = target - (edge + delta);
      if (Math.abs(difference) <= nearest) {
        nearest = Math.abs(difference);
        adjustment = difference;
      }
    }
  }
  return delta + adjustment;
}
