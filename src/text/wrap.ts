export function wrapText(lines: string[], maxWidth: number, measure: (text: string) => number) {
  if (!(maxWidth > 0)) return lines;
  const result: string[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const line of lines) {
    let row = '';
    for (const word of line.match(/\S+\s*|\s+/gu) ?? []) {
      if (row && measure(row + word.trimEnd()) > maxWidth) {
        result.push(row.trimEnd());
        row = '';
      }
      if (measure(word.trimEnd()) <= maxWidth) {
        row += word;
        continue;
      }
      for (const { segment } of segmenter.segment(word)) {
        if (row && measure(row + segment) > maxWidth) {
          result.push(row.trimEnd());
          row = '';
        }
        row += segment;
      }
    }
    result.push(row.trimEnd());
  }
  return result;
}
