import { z } from 'zod';
import { captionSegmentSchema } from '../lib/schema';
import type { CaptionSegment } from './types';
import { estimateWords } from './wordTiming';

export const captionFormats = ['srt', 'vtt', 'ass', 'ssa', 'lrc', 'txt', 'json'] as const;
export type CaptionFormat = typeof captionFormats[number];

export function decodeCaptions(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes);
  const prefix = bytes.subarray(0, 128);
  let even = 0;
  let odd = 0;
  prefix.forEach((byte, index) => { if (byte === 0) { if (index % 2) odd++; else even++; } });
  if (Math.max(even, odd) >= 3 && Math.min(even, odd) === 0) {
    return new TextDecoder(odd ? 'utf-16le' : 'utf-16be').decode(bytes);
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

export function parseTimestamp(value: string) {
  const match = /^(?:(\d+):)?(\d{1,3}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return undefined;
  const [, hours, minutes, seconds, fraction = ''] = match;
  if (+seconds >= 60 || (hours !== undefined && +minutes >= 60)) return undefined;
  const result = Number(hours ?? 0) * 3600 + +minutes * 60 + +seconds + Number(fraction.padEnd(3, '0')) / 1000;
  return Number.isFinite(result) ? result : undefined;
}

type Cue = Pick<CaptionSegment, 'start' | 'duration' | 'text' | 'words' | 'speaker' | 'overrides'>;
function cue(start: number | undefined, end: number | undefined, text: string): Cue[] {
  return start !== undefined && end !== undefined && end > start && text.trim()
    ? [{ start, duration: end - start, text: text.trim() }] : [];
}

function parseBlocks(input: string) {
  return input.split(/\n[ \t]*\n/u).flatMap((block) => {
    const lines = block.split('\n');
    if (/^\s*(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0] ?? '')) return [];
    const timing = lines.findIndex((line) => line.includes('-->'));
    if (timing < 0) return [];
    const [start, end] = lines[timing].trim().split(/\s*-->\s*/u);
    return cue(parseTimestamp(start), parseTimestamp(end.trim().split(/\s+/u)[0]),
      lines.slice(timing + 1).join('\n').replace(/<[^>]*>/gu, '')
        .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
  });
}

function parseAss(input: string) {
  let fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
  let events = false;
  return input.split('\n').flatMap((line) => {
    if (/^\s*\[/.test(line)) events = /^\s*\[Events\]/i.test(line);
    if (!events) return [];
    if (/^\s*Format:/i.test(line)) {
      fields = line.slice(line.indexOf(':') + 1).split(',').map((value) => value.trim().toLowerCase());
      return [];
    }
    if (!/^\s*Dialogue:/i.test(line)) return [];
    const parts = line.slice(line.indexOf(':') + 1).split(',');
    const textIndex = fields.indexOf('text');
    const start = fields.indexOf('start');
    const end = fields.indexOf('end');
    if (textIndex < 0 || start < 0 || end < 0 || parts.length < fields.length) return [];
    const extra = parts.length - fields.length;
    const at = (index: number) => parts[index + (index > textIndex ? extra : 0)];
    return cue(parseTimestamp(at(start)), parseTimestamp(at(end)), parts.slice(textIndex, textIndex + extra + 1)
      .join(',').replace(/\{[^}]*\}/gu, '').replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' '));
  });
}

function parseLyrics(input: string): Cue[] {
  const lines = input.split('\n').flatMap((line) => {
    const tags = [...line.matchAll(/\[([^\]]+)\]/g)];
    if (!tags.length) return [];
    const raw = line.slice((tags.at(-1)?.index ?? 0) + tags.at(-1)![0].length).trim();
    const words = [...raw.matchAll(/<([^>]+)>([^<]*)/gu)];
    const text = raw.replace(/<[^>]*>/gu, '').trim();
    return tags.flatMap((tag) => {
      const start = parseTimestamp(tag[1]);
      return start === undefined || !text ? [] : [{ start, text, words }];
    });
  }).sort((a, b) => a.start - b.start);
  return lines.map((line, index) => {
    const next = lines.slice(index + 1).find((item) => item.start > line.start)?.start ?? line.start + 3;
    const duration = next - line.start;
    const words = line.words.flatMap((tag, wordIndex) => {
      const start = parseTimestamp(tag[1]);
      const nextWord = line.words[wordIndex + 1];
      const end = nextWord ? parseTimestamp(nextWord[1]) ?? next : next;
      const text = tag[2].trim();
      return start !== undefined && start >= line.start && end > start && start < next && text
        ? [{ text, start: start - line.start, end: Math.min(end, next) - line.start }] : [];
    });
    return { start: line.start, duration, text: line.text, words };
  });
}

function parseText(input: string, wordsPerSecond: number) {
  let start = 0;
  return input.split('\n').map((line) => line.trim()).filter(Boolean).map((text) => {
    const duration = Math.max(0.25, (text.match(/\S+/gu)?.length ?? 1) / Math.max(0.1, wordsPerSecond || 2.5));
    const result = { start, duration, text };
    start += duration;
    return result;
  });
}

function parseJson(input: string): Cue[] {
  const schema = z.union([z.array(captionSegmentSchema), z.object({ segments: z.array(captionSegmentSchema) }),
    z.object({ captionTracks: z.array(z.object({ segments: z.array(captionSegmentSchema) })) })]);
  const parsed = schema.parse(JSON.parse(input));
  return Array.isArray(parsed) ? parsed : 'segments' in parsed ? parsed.segments :
    parsed.captionTracks.flatMap((track) => track.segments);
}

export function parseCaptions(input: string, format: CaptionFormat, id: () => string, wordsPerSecond = 2.5): CaptionSegment[] {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cues = format === 'json' ? parseJson(text) : format === 'txt' ? parseText(text, wordsPerSecond) :
    format === 'lrc' ? parseLyrics(text) : format === 'ass' || format === 'ssa' ? parseAss(text) : parseBlocks(text);
  return cues.map((item: Cue) => {
    const words = item.words?.filter((word) => word.start >= 0 && word.end > word.start && word.end <= item.duration + 1e-6);
    return { ...item, id: id(), words: words?.length ? words : estimateWords(item.text, item.duration) };
  }).sort((a, b) => a.start - b.start);
}
