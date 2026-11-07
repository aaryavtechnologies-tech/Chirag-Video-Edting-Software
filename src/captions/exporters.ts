import type { CaptionSegment } from './types';

export const captionExportFormats = ['srt', 'vtt', 'txt', 'json'] as const;
export type CaptionExportFormat = typeof captionExportFormats[number];

export function subtitleTimestamp(seconds: number, separator: ',' | '.') {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const whole = Math.floor(milliseconds / 1000);
  const time = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
    .map((unit) => String(unit).padStart(2, '0')).join(':');
  return time + separator + String(milliseconds % 1000).padStart(3, '0');
}

export function exportCaptions(segments: readonly CaptionSegment[], format: CaptionExportFormat) {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  if (format === 'json') return JSON.stringify({ segments: sorted }, null, 2) + '\n';
  if (format === 'txt') return sorted.map((segment) => segment.text.replace(/\r?\n/g, ' ')).join('\n') + '\n';
  const vtt = format === 'vtt';
  const sep = vtt ? '.' : ',';
  return (vtt ? 'WEBVTT\n\n' : '') + sorted.map((segment, index) => {
    const start = subtitleTimestamp(segment.start, sep);
    const end = subtitleTimestamp(segment.start + segment.duration, sep);
    const text = segment.text.replace(/\r/g, '').replace(/\n\s*\n/g, '\n').trim();
    return (vtt ? '' : String(index + 1) + '\n') + start + ' --> ' + end + '\n' +
      (vtt ? text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') : text);
  }).join('\n\n') + '\n';
}
