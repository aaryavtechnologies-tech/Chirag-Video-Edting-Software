import { expect, it } from 'vitest';
import { addCaptionTrack, reflowCaption, resolveCaption } from '../../src/captions/model';
import { applyTemplate, builtInTemplates } from '../../src/captions/templates';
import { estimateWords } from '../../src/captions/wordTiming';
import type { Project } from '../../src/types/project';

const project: Project = {
  version: 1, id: 'test', name: 'Captions', assets: [], tracks: [],
  settings: { width: 1080, height: 1920, fps: 30 },
};

it('applies a template to a selection without touching other captions or losing individual edits on track apply', () => {
  const draft: Project = { ...project };
  const track = addCaptionTrack(draft, 'captions');
  track.segments = [{ id: 'a', text: 'first', start: 0, duration: 1 },
    { id: 'b', text: 'second', start: 1, duration: 1 }];
  const [first, second, third] = builtInTemplates;
  applyTemplate(track, second, new Set(['a']));
  expect(track.templateId).toBe(first.id);
  expect(track.segments[1].overrides).toBeUndefined();
  const edited = track.segments[0].overrides;
  applyTemplate(track, third);
  expect(track.segments[0].overrides).toEqual(edited);
  expect(resolveCaption(draft, track, track.segments[1]).transform?.y).toBe(0.73);
  applyTemplate(track, first, undefined, true);
  expect(track.segments[0].overrides).toBeUndefined();
});

it('reflows a multilingual segment using existing word timing boundaries', () => {
  const text = 'नमस्ते दुनिया bonjour monde';
  const words = estimateWords(text, 4);
  expect(words[0].start).toBe(0);
  expect(words.at(-1)?.end).toBe(4);
  const parts = reflowCaption({ id: 'first', text, start: 1, duration: 4, words }, 5, 1, () => 'part');
  expect(parts.length).toBeGreaterThan(1);
  expect(parts[1].start).toBeCloseTo(1 + words[1].start);
  expect(parts[1].words?.[0].start).toBe(0);
  expect(parts.at(-1)!.start + parts.at(-1)!.duration).toBeCloseTo(5);
});
