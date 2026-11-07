import { expect, it } from 'vitest';
import { buildFilterGraph } from '../../src/export/buildFilterGraph';
import type { Project } from '../../src/types/project';
import type { ExportSettings } from '../../src/types/export';

const settings: ExportSettings = { mode: 'both', videoFormat: 'h264', audioFormat: 'mp3',
  width: 1920, height: 1080, fps: 30, bitrate: 10, audioBitrate: 320, volume: 1, hardware: false, openFolder: false };
const project: Project = { id: 'test', version: 1, name: 'Test', settings: { width: 1920, height: 1080, fps: 30 },
  assets: [{ id: 'vid', type: 'video', path: '/original.mp4', proxyPath: '/proxy.mp4', hasAudio: true }],
  tracks: [{ id: 'v1', kind: 'video', name: 'V1', order: 0, clips: [
    { id: 'c', type: 'video', assetId: 'vid', start: 1, duration: 3, speed: 0.25, fadeIn: 1 },
  ] }, { id: 'v2', kind: 'video', name: 'V2', order: 1, clips: [
    { id: 'title', type: 'text', text: 'Hello', start: 0, duration: 3, style: { animationIn: 'slideUp' } },
  ] }] };

it('uses originals and layers text as a raster with the timing from project JSON', () => {
  const { inputs, script, duration } = buildFilterGraph(project, settings,
    new Map([['title', { path: '/raster.png', width: 100, height: 30 }]]));
  expect(duration).toBe(4);
  expect(inputs).toEqual(['-i', '/original.mp4', '-i', '/raster.png', '-i', '/original.mp4']);
  expect(script).toContain('atempo=0.5,atempo=0.5');
  expect(script).toContain('[mixv0][layer1]overlay=');
  expect(script).toContain('asplit=2[aout][aonly]');
  expect(script).not.toContain('drawtext');
});

it('builds only audio filters and respects solo and export range', () => {
  const value = { ...project, tracks: [...project.tracks, { id: 'solo', name: 'A1', kind: 'audio' as const,
    solo: true, clips: [] }] };
  const graph = buildFilterGraph(value, { ...settings, mode: 'audio', range: { start: 1, end: 3 } }, new Map());
  expect(graph.duration).toBe(2);
  expect(graph.inputs).toEqual([]);
  expect(graph.script).toContain('atrim=start=1:end=3');
  expect(graph.script).not.toContain('overlay');
});
