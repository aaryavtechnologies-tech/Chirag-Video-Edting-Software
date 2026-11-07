import type { CaptionWord } from './schema';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const graphemeCount = (text: string) => [...segmenter.segment(text)].length;

export function estimateWords(text: string, duration: number): CaptionWord[] {
  const tokens = text.match(/\S+/gu) ?? [];
  const weights = tokens.map((word) => Math.max(1, graphemeCount(word)));
  const total = weights.reduce((sum, length) => sum + length, 0);
  let used = 0;
  return tokens.map((word, index) => {
    const start = used / total * duration;
    used += weights[index];
    return { text: word, start, end: used / total * duration, estimated: true };
  });
}
