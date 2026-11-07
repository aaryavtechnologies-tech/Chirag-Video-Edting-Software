import type { Clip, Project } from '../types/project';
import { getTemplate, defaultTemplate } from './templates';
import { estimateWords, graphemeCount } from './wordTiming';
import type { CaptionSegment, CaptionTrack } from './types';
import { strings as s } from '../lib/strings';

export function captionTrack(project: Project, trackId?: string) {
  return project.captionTracks?.find((track) => track.id === trackId);
}

export function findCaption(project: Project, id: string) {
  for (const track of project.captionTracks ?? []) {
    const segment = track.segments.find((item) => item.id === id);
    if (segment) return { track, segment };
  }
}

export function addCaptionTrack(project: Project, id: string) {
  const tracks = project.captionTracks ?? (project.captionTracks = []);
  const track: CaptionTrack = { id, kind: 'caption', name: s.captions + ' ' + (tracks.length + 1),
    templateId: defaultTemplate.id, templateSnapshot: defaultTemplate, segments: [] };
  tracks.push(track);
  return track;
}

export function captionTextLines(text: string, limit: number) {
  const lines: string[] = [];
  let row = '';
  for (const word of text.match(/\S+/gu) ?? []) {
    if (row && graphemeCount(row + ' ' + word) > limit) { lines.push(row); row = ''; }
    row = row ? row + ' ' + word : word;
  }
  if (row) lines.push(row);
  return lines;
}

export function setCaptionText(segment: CaptionSegment, text: string) {
  if (segment.text === text) return;
  segment.text = text;
  segment.words = estimateWords(text, segment.duration);
}

export function retimeCaption(segment: CaptionSegment, start: number, duration: number) {
  if (!Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration <= 0) return;
  const factor = duration / segment.duration;
  segment.start = start;
  segment.duration = duration;
  segment.words = segment.words?.map((word) => ({ ...word, start: word.start * factor, end: word.end * factor }));
}

export function reflowCaption(segment: CaptionSegment, maxChars: number, maxLines: number, id: () => string) {
  const lines = captionTextLines(segment.text, maxChars);
  if (!lines.length) return [segment];
  const sourceWords = segment.words?.length ? segment.words : estimateWords(segment.text, segment.duration);
  const count = segment.text.match(/\S+/gu)?.length ?? 0;
  const words = sourceWords.length === count ? sourceWords : estimateWords(segment.text, segment.duration);
  let index = 0;
  let boundary = 0;
  const result: CaptionSegment[] = [];
  for (let line = 0; line < lines.length; line += maxLines) {
    const text = lines.slice(line, line + maxLines).join('\n');
    const count = text.match(/\S+/gu)?.length ?? 0;
    const group = words.slice(index, index + count);
    index += count;
    const end = line + maxLines >= lines.length ? segment.duration : words[index]?.start ?? segment.duration;
    if (end <= boundary) continue;
    result.push({ ...segment, id: result.length ? id() : segment.id, text, start: segment.start + boundary,
      duration: end - boundary, words: group.map((word) => ({
        ...word, start: Math.max(0, word.start - boundary), end: Math.min(end - boundary, word.end - boundary),
      })) });
    boundary = end;
  }
  return result.length ? result : [segment];
}

export function splitCaption(track: CaptionTrack, id: string, time: number, nextId: string) {
  const index = track.segments.findIndex((segment) => segment.id === id);
  if (index < 0 || track.locked) return;
  const current = track.segments[index];
  const split = time - current.start;
  if (split <= 0 || split >= current.duration) return;
  const words = current.words?.length ? current.words : estimateWords(current.text, current.duration);
  const cut = words.filter((word) => (word.start + word.end) / 2 < split).length;
  if (!cut || cut >= words.length) return;
  const first = words.slice(0, cut);
  const second = words.slice(cut);
  track.segments.splice(index, 1, { ...current, duration: split, text: first.map((word) => word.text).join(' '),
    words: first.map((word) => ({ ...word, end: Math.min(word.end, split) })) },
  { ...current, id: nextId, start: time, duration: current.duration - split, text: second.map((word) => word.text).join(' '),
    words: second.map((word) => ({ ...word, start: Math.max(0, word.start - split), end: word.end - split })) });
}

export function mergeCaption(track: CaptionTrack, id: string) {
  if (track.locked) return;
  const index = track.segments.findIndex((segment) => segment.id === id);
  const first = track.segments[index];
  const second = track.segments[index + 1];
  if (!first || !second || index < 0) return;
  const offset = second.start - first.start;
  const firstWords = first.words ?? estimateWords(first.text, first.duration);
  first.text = first.text.trimEnd() + ' ' + second.text.trimStart();
  first.words = [...firstWords, ...(second.words ?? estimateWords(second.text, second.duration)).map((word) => ({
    ...word, start: word.start + offset, end: word.end + offset,
  }))];
  first.duration = Math.max(first.duration, offset + second.duration);
  track.segments.splice(index + 1, 1);
}

export function resolveCaption(project: Project, track: CaptionTrack, segment: CaptionSegment): Clip {
  const template = getTemplate(project, track);
  const portrait = project.settings.width <= project.settings.height;
  const placement = { ...(portrait ? template.portrait : template.landscape), ...segment.overrides?.placement };
  const style = { ...template.style, ...segment.overrides?.style };
  const heightFactor = project.settings.height / (portrait ? 1920 : 1080);
  const anchorY = placement.anchor === 'top' ? 0.16 : placement.anchor === 'middle' ? 0.5 : portrait ? 0.73 : 0.83;
  return { id: segment.id, type: 'text', start: segment.start, duration: segment.duration, text: segment.text,
    style: { ...style, fontSize: (style.fontSize ?? 54) * heightFactor * (placement.fontScale ?? 1),
      boxWidth: project.settings.width * (placement.maxWidth ?? 0.8), uppercase: style.uppercase ?? template.uppercase,
    },
    transform: { x: placement.x ?? 0.5, y: placement.y ?? anchorY },
    animation: segment.overrides?.animation ?? template.animation,
    caption: { words: segment.words ?? estimateWords(segment.text, segment.duration),
      wordEffect: segment.overrides?.wordEffect ?? template.wordEffect },
  };
}

export function captionLayers(project: Project, time: number) {
  return (project.captionTracks ?? []).filter((track) => !track.hidden).flatMap((track) =>
    track.segments.filter((segment) => time >= segment.start && time < segment.start + segment.duration)
      .map((segment) => resolveCaption(project, track, segment)));
}
