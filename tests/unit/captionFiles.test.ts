import { expect, it } from 'vitest';
import { decodeCaptions, parseCaptions, parseTimestamp } from '../../src/captions/parsers';
import { exportCaptions } from '../../src/captions/exporters';

const id = () => 'cue';

it('handles BOM, Hindi, multiline cues, malformed timestamps, and overlaps', () => {
  const source = '\uFEFF1\r\n00:00:01,000 --> 00:00:03,000\r\nनमस्ते\r\nदुनिया\r\n\r\n2\r\n00:00:02,000 --> 00:00:04,000\r\nOverlap\r\n\r\n3\r\n00:99:00,000 --> 00:00:07,000\r\nInvalid';
  const clips = parseCaptions(decodeCaptions(new TextEncoder().encode(source)), 'srt', id);
  expect(clips.map(({ start, text }) => [start, text])).toEqual([[1, 'नमस्ते\nदुनिया'], [2, 'Overlap']]);
  expect(clips[0].words?.[0].estimated).toBe(true);
  expect(parseTimestamp('00:00:60.1')).toBeUndefined();
  expect(parseCaptions(exportCaptions(clips, 'vtt'), 'vtt', id)).toEqual(clips);
});

it('decodes UTF-16 and Windows-1252 caption files', () => {
  const bytes = Uint8Array.from([0xff, 0xfe, 0x28, 0x09, 0x2e, 0x09]);
  expect(decodeCaptions(bytes)).toBe('नम');
  expect(decodeCaptions(Uint8Array.from([0x63, 0x61, 0x66, 0xe9]))).toBe('café');
});

it('parses ASS dialogue including commas and line breaks and LRC word tags', () => {
  const ass = '[Events]\nFormat: Layer, Start, End, Text\nDialogue: 0,0:00:01.00,0:00:03.00,{\\b1}Hello, world\\Nनमस्ते';
  expect(parseCaptions(ass, 'ass', id)[0]).toMatchObject({ start: 1, duration: 2, text: 'Hello, world\nनमस्ते' });
  expect(parseCaptions(ass, 'ssa', id)).toEqual(parseCaptions(ass, 'ass', id));
  const lyrics = '[00:01.00]<00:01.00>नमस्ते <00:02.00>दुनिया\n[00:03.00]Next';
  expect(parseCaptions(lyrics, 'lrc', id)[0].words).toEqual([
    { text: 'नमस्ते', start: 0, end: 1 }, { text: 'दुनिया', start: 1, end: 2 },
  ]);
});

it('round-trips JSON and auto-times each pasted text line', () => {
  const clips = parseCaptions('one two\n\nतीन चार', 'txt', id, 2);
  expect(clips.map(({ start, duration }) => [start, duration])).toEqual([[0, 1], [1, 1]]);
  expect(parseCaptions(exportCaptions(clips, 'json'), 'json', id)).toEqual(clips);
  expect(exportCaptions(clips, 'txt')).toBe('one two\nतीन चार\n');
});
