import type { Project, ProjectSettings } from '../types/project';
import { clipTransform, fittedSize, layerSize } from '../preview/compositor';

export function reframeProject(project: Project, next: ProjectSettings) {
  const previous = project.settings;
  const frame = fittedSize(next.width, next.height, previous.width, previous.height, false);
  const factor = frame.height / previous.height;
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.type === 'audio') continue;
      const transform = clipTransform(clip);
      const asset = assets.get(clip.assetId ?? '');
      const before = layerSize(clip, asset, previous.width, previous.height);
      const after = layerSize(clip, asset, next.width, next.height);
      const scale = clip.type === 'text' ? factor : before.width * factor / after.width;
      clip.transform = { ...clip.transform,
        x: 0.5 + (transform.x - 0.5) * frame.width / next.width,
        y: 0.5 + (transform.y - 0.5) * frame.height / next.height,
        scale: transform.scale * scale,
      };
    }
  }
  project.settings = next;
}
