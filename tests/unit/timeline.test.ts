import { describe, expect, it } from 'vitest';
import { alignFrame, frameToTime, timeToFrame, timecode } from '../../src/lib/time';
import { deleteClips, insertAsset, moveClips, projectDuration, reorderTrack, splitClips, trimClip } from '../../src/timeline/operations';
import { snapTargets, snappedDelta } from '../../src/timeline/snapping';
import type { Clip, Project } from '../../src/types/project';

function project(): Project {
  return {
    version: 1, id: 'project', name: 'Timeline', settings: { width: 1920, height: 1080, fps: 30 },
    markers: [{ time: 6 }], assets: [{ id: 'source', type: 'video', path: 'source.mp4', duration: 10 }],
    tracks: [
      { id: 'v1', kind: 'video', name: 'V1', clips: [
        { id: 'a', type: 'video', assetId: 'source', start: 0, duration: 2, sourceIn: 1, sourceOut: 5, speed: 2 },
        { id: 'b', type: 'image', start: 3, duration: 2 },
        { id: 'c', type: 'text', start: 8, duration: 2 },
      ] },
      { id: 'v2', kind: 'video', name: 'V2', clips: [] },
      { id: 'a1', kind: 'audio', name: 'A1', clips: [] },
    ],
  };
}

describe('timeline edits', () => {
  it('moves the group together and blocks overlaps and mismatched tracks', () => {
    const value = project();
    const selection = new Set(['a', 'b']);
    expect(moveClips(value, selection, 'a', 'v1', 4)).toBe(false);
    expect(moveClips(value, selection, 'a', 'a1', 1)).toBe(false);
    expect(moveClips(value, selection, 'a', 'v2', 1)).toBe(true);
    expect(value.tracks[0].clips.map((clip) => clip.id)).toEqual(['c']);
    expect(value.tracks[1].clips.map(({ id, start }) => [id, start])).toEqual([['a', 1], ['b', 4]]);
    expect(projectDuration(value)).toBe(10);
  });

  it('permits touching edges and rejects moves to locked tracks', () => {
    const value = project();
    expect(moveClips(value, new Set(['b']), 'b', 'v1', -1)).toBe(true);
    value.tracks[1].locked = true;
    expect(moveClips(value, new Set(['b']), 'b', 'v2', 0)).toBe(false);
  });

  it('trims at clip speed and respects source and neighbouring bounds', () => {
    const value = project();
    expect(trimClip(value, 'a', 'left', 0.5)).toBe(true);
    expect(value.tracks[0].clips[0]).toMatchObject({ start: 0.5, duration: 1.5, sourceIn: 2, sourceOut: 5 });
    expect(trimClip(value, 'a', 'right', 3.5)).toBe(false);
    expect(trimClip(value, 'a', 'right', 3)).toBe(true);
    expect(value.tracks[0].clips[0]).toMatchObject({ duration: 2.5, sourceOut: 7 });
    expect(trimClip(value, 'b', 'right', 9)).toBe(false);
  });

  it('splits media at the correct source time and leaves out-of-range clips intact', () => {
    const value = project();
    expect(splitClips(value, new Set(['a', 'b']), 1, () => 'split')).toBe(true);
    const [first, image, , second] = value.tracks[0].clips;
    expect(first).toMatchObject({ duration: 1, sourceOut: 3 });
    expect(second).toMatchObject({ id: 'split', start: 1, duration: 1, sourceIn: 3, sourceOut: 5 });
    expect(image.duration).toBe(2);
    expect(splitClips(value, new Set(), 0, () => 'invalid')).toBe(false);
  });

  it('ripples only on affected tracks and reorders tracks within their family', () => {
    const value = project();
    const other: Clip = { id: 'other', type: 'text', start: 9, duration: 1 };
    value.tracks[1].clips.push(other);
    deleteClips(value, new Set(['a', 'b']), true);
    expect(value.tracks[0].clips[0].start).toBe(4);
    expect(other.start).toBe(9);
    expect(reorderTrack(value, 'v2', 'a1')).toBe(false);
    expect(reorderTrack(value, 'v2', 'v1')).toBe(true);
    expect(value.tracks.map(({ id, order }) => [id, order])).toEqual([['v2', 0], ['v1', 1], ['a1', undefined]]);
  });

  it('drops media on an existing track or creates a matching track', () => {
    const value = project();
    const [asset] = value.assets;
    expect(insertAsset(value, asset, 'v1', 1, 'placed', 'v3')).toBe(false);
    expect(insertAsset(value, asset, undefined, 1, 'placed', 'v3')).toBe(true);
    expect(value.tracks.at(-1)).toMatchObject({ id: 'v3', kind: 'video',
      clips: [{ id: 'placed', start: 1, duration: 10, sourceOut: 10 }] });
  });
});

it('snaps to marker, playhead, and clip edges while excluding the moved clips', () => {
  const targets = snapTargets(project(), 7, new Set(['a']));
  expect(targets).toEqual([0, 7, 6, 3, 5, 8, 10]);
  expect(snappedDelta([1, 2], 4.92, targets, 0.1)).toBeCloseTo(5);
  expect(snappedDelta([1], 0.4, targets, 0.1)).toBe(0.4);
});

it('converts between frame, seconds, and timecode', () => {
  expect(timeToFrame(0.5, 24)).toBe(12);
  expect(frameToTime(31, 30)).toBeCloseTo(1.03333);
  expect(alignFrame(1.02, 25)).toBe(1.04);
  expect(timecode(3661.5, 60)).toBe('01:01:01:30');
});
