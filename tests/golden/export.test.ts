import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { exportProject, verifyExport } from '../../electron/services/export';
import { runMediaTool } from '../../electron/services/ffmpeg';
import type { Project } from '../../src/types/project';
import type { ExportSettings } from '../../src/types/export';

it('renders a three-second 1080p30 MP4 and MP3 from the same project', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'video-editor-golden-'));
  try {
    const path = join(folder, 'source.mp4');
    await runMediaTool('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
      'color=c=red:s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:v', 'libx264', '-c:a', 'aac', '-threads', '2', path]);
    const project: Project = {
      id: 'golden', name: 'Golden', version: 1, settings: { width: 1920, height: 1080, fps: 30 },
      assets: [{ id: 'source', type: 'video', path, width: 640, height: 360, duration: 3, hasAudio: true }],
      tracks: [{ id: 'track', name: 'V1', kind: 'video', clips: [
        { id: 'clip', type: 'video', assetId: 'source', start: 0, duration: 3 },
      ] }],
    };
    const settings: ExportSettings = { mode: 'both', videoFormat: 'h264', audioFormat: 'mp3',
      width: 1920, height: 1080, fps: 30, bitrate: 10, audioBitrate: 320, volume: 1, hardware: false, openFolder: false };
    const result = await exportProject(project, settings, join(folder, 'result.mp4'), [], () => undefined,
      new AbortController().signal);
    expect(result.files).toEqual([join(folder, 'result.mp4'), join(folder, 'result.mp3')]);
    expect((await verifyExport(result.files[0], 3, settings)).streams).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_type: 'video', width: 1920, height: 1080, avg_frame_rate: '30/1' }),
      expect.objectContaining({ codec_name: 'aac' }),
    ]));
    expect((await verifyExport(result.files[1], 3)).streams[0].codec_name).toBe('mp3');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}, 30_000);
