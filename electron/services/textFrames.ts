import { copyFile, link, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { ExportSettings, TextFrameBatch } from '../../src/types/export';
import type { Clip, Project } from '../../src/types/project';
import { captionExportProject } from '../../src/captions/model';
import type { RasterInput } from '../../src/export/buildFilterGraph';

const index = z.number().int().min(0).max(10_000_000);
const batchSchema = z.object({
  id: z.string(), fps: z.number().int(), startFrame: index, x: index, y: index,
  frames: z.array(z.object({ index, png: z.string().max(48_000_000).optional(), repeat: index.optional() })).min(1).max(4),
});
type Entry = { directory: string; raster: RasterInput; count: number; limit: number };

export function decodePng(png: string) {
  const buffer = Buffer.from(png, 'base64');
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192) throw new Error('Invalid text raster dimensions');
  return { buffer, width, height };
}

const frameName = (directory: string, index: number) => join(directory, String(index).padStart(8, '0') + '.png');

export class TextFrameStore {
  private directory?: string;
  private entries = new Map<string, Entry>();
  private clips?: Map<string, Clip>;

  constructor(private settings: ExportSettings) {}

  async append(value: TextFrameBatch, project: Project) {
    const batch = batchSchema.parse(value);
    const { fps, width, height, mode, burnCaptions } = this.settings;
    if (mode === 'audio' || batch.fps !== fps || batch.x >= width || batch.y >= height) throw new Error('Invalid frame batch');
    this.clips ??= new Map(captionExportProject(project, burnCaptions !== false).tracks.filter((track) => !track.hidden)
      .flatMap((track) => track.clips.filter((clip) => clip.type === 'text').map((clip) => [clip.id, clip])));
    const clip = this.clips.get(batch.id);
    if (!clip) throw new Error('Unknown text frame source');
    const startFrame = Math.ceil(clip.start * fps - 1e-7);
    if (startFrame !== batch.startFrame) throw new Error('Text frame start mismatch');
    const limit = Math.max(1, Math.ceil((clip.start + clip.duration) * fps - 1e-7) - startFrame);
    const first = batch.frames[0];
    let entry = this.entries.get(batch.id);
    if (!entry) {
      if (first.index !== 0 || !first.png) throw new Error('Missing first text frame');
      const firstRaster = decodePng(first.png);
      if (batch.x + firstRaster.width > width || batch.y + firstRaster.height > height) throw new Error('Text raster is out of bounds');
      this.directory ??= await mkdtemp(join(tmpdir(), 'video-editor-text-'));
      const directory = join(this.directory, String(this.entries.size));
      await mkdir(directory);
      entry = { directory, count: 0, limit, raster: {
        path: join(directory, '%08d.png'), width: firstRaster.width, height: firstRaster.height,
        sequence: { fps, startFrame, x: batch.x, y: batch.y, firstFile: frameName(directory, 0) },
      } };
      this.entries.set(batch.id, entry);
    }
    if (batch.x !== entry.raster.sequence?.x || batch.y !== entry.raster.sequence?.y) throw new Error('Text frame origin changed');
    for (const frame of batch.frames) {
      if (frame.index !== entry.count || frame.index >= entry.limit) throw new Error('Text frame order mismatch');
      const target = frameName(entry.directory, frame.index);
      if (frame.png) {
        const decoded = decodePng(frame.png);
        if (decoded.width !== entry.raster.width || decoded.height !== entry.raster.height) throw new Error('Text frame dimensions changed');
        await writeFile(target, decoded.buffer, { flag: 'wx' });
      } else if (frame.repeat !== undefined && frame.repeat < frame.index) {
        const source = frameName(entry.directory, frame.repeat);
        try { await link(source, target); } catch { await copyFile(source, target); }
      } else throw new Error('Missing text frame');
      entry.count++;
    }
  }

  finish(settings: ExportSettings) {
    if (this.entries.size && (settings.fps !== this.settings.fps || settings.width !== this.settings.width ||
      settings.height !== this.settings.height || settings.burnCaptions !== this.settings.burnCaptions)) throw new Error('Export settings changed');
    const result = new Map<string, RasterInput>();
    for (const [id, entry] of this.entries) {
      if (entry.count !== entry.limit) throw new Error('Incomplete text frame sequence');
      result.set(id, entry.raster);
    }
    return result;
  }

  async close() {
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
  }
}
