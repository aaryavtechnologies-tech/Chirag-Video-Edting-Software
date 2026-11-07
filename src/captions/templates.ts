import basic from '../../assets/caption-templates/basic.json';
import viral from '../../assets/caption-templates/viral.json';
import karaoke from '../../assets/caption-templates/karaoke.json';
import cinematic from '../../assets/caption-templates/cinematic.json';
import minimal from '../../assets/caption-templates/minimal.json';
import bold from '../../assets/caption-templates/bold.json';
import gaming from '../../assets/caption-templates/gaming.json';
import podcast from '../../assets/caption-templates/podcast.json';
import news from '../../assets/caption-templates/news.json';
import regional from '../../assets/caption-templates/regional.json';
import aesthetic from '../../assets/caption-templates/aesthetic.json';
import { z } from 'zod';
import { captionTemplateSchema } from '../lib/schema';
import type { CaptionTrack, CaptionTemplate } from './types';
import type { Project } from '../types/project';

export const builtInTemplates = z.array(captionTemplateSchema).parse([basic, viral, karaoke, cinematic, minimal, bold, gaming, podcast, news, regional, aesthetic].flat());
export const defaultTemplate = builtInTemplates[0];

export function getTemplate(project: Project, track: CaptionTrack) {
  return track.templateSnapshot ?? project.captionTemplates?.find((template) => template.id === track.templateId) ??
    builtInTemplates.find((template) => template.id === track.templateId) ?? defaultTemplate;
}

export function applyTemplate(track: CaptionTrack, template: CaptionTemplate, selected?: ReadonlySet<string>, reset = false) {
  if (track.locked) return;
  if (!selected) {
    track.templateId = template.id;
    track.templateSnapshot = template;
    if (reset) for (const segment of track.segments) delete segment.overrides;
    return;
  }
  for (const segment of track.segments) if (selected.has(segment.id)) {
    segment.overrides = { ...(reset ? {} : segment.overrides),
      style: { ...template.style }, animation: template.animation ?? {}, wordEffect: template.wordEffect ?? { type: 'none' } };
  }
}
