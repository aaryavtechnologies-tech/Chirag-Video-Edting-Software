import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, copyFile, link, mkdir, mkdtemp, rm, statfs, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, parse } from 'node:path';
import { z } from 'zod';
import { buildFilterGraph, type RasterInput } from '../../src/export/buildFilterGraph';
import { estimateExportBytes } from '../../src/export/exportPresets';
import { strings } from '../../src/lib/strings';
import { exportSettingsSchema, videoExtension, type ExportProgress, type ExportResult, type ExportSettings, type TextPng } from '../../src/types/export';
import type { Project } from '../../src/types/project';
import { runMediaTool } from './ffmpeg';
import { selectEncoder, softwareEncoder } from './encoders';
import { exportCaptions } from '../../src/captions/exporters';
import { captionExportProject } from '../../src/captions/model';

const rasterSchema = z.array(z.object({ id: z.string(), png: z.string().max(80_000_000) })).max(500);
const reportSchema = z.object({
  format: z.object({ duration: z.string() }),
  streams: z.array(z.object({
    codec_type: z.string(), codec_name: z.string().optional(), width: z.number().optional(), height: z.number().optional(),
    avg_frame_rate: z.string().optional(),
  })),
});

export async function verifyExport(file: string, duration: number, video?: Pick<ExportSettings, 'width' | 'height' | 'fps' | 'videoFormat'>) {
  const output = await runMediaTool('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  const result = reportSchema.parse(JSON.parse(output));
  const seconds = Number(result.format.duration);
  if (!Number.isFinite(seconds) || Math.abs(seconds - duration) > 0.1) {
    throw new Error(`Expected ${duration}s, got ${seconds}s in ${file}`);
  }
  const audio = result.streams.find((stream) => stream.codec_type === 'audio');
  if (!audio) throw new Error(`Audio stream missing in ${file}`);
  if (video) {
    const stream = result.streams.find((item) => item.codec_type === 'video');
    const [numerator, denominator] = (stream?.avg_frame_rate ?? '0/1').split('/').map(Number);
    if (!stream || stream.width !== video.width || stream.height !== video.height ||
      Math.abs(numerator / denominator - video.fps) > 0.001 ||
      audio.codec_name !== (video.videoFormat === 'vp9' ? 'opus' : 'aac')) {
      throw new Error(`Unexpected video or audio format in ${file}`);
    }
  }
  return result;
}

async function saveRasters(directory: string, project: Project, entries: TextPng[]) {
  const clips = new Set(project.tracks.flatMap((track) => track.clips.filter((clip) => clip.type === 'text').map((clip) => clip.id)));
  const rasters = new Map<string, RasterInput>();
  for (const { id, png } of rasterSchema.parse(entries)) {
    if (!clips.has(id) || rasters.has(id)) throw new Error('Unexpected text raster');
    const buffer = Buffer.from(png, 'base64');
    if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error('Invalid PNG');
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (!width || !height || width > 8192 || height > 8192) throw new Error('Invalid text raster dimensions');
    const path = join(directory, 'text-' + rasters.size + '.png');
    await writeFile(path, buffer);
    rasters.set(id, { path, width, height });
  }
  return rasters;
}

function outputFiles(file: string, settings: ExportSettings) {
  const { dir, name } = parse(file);
  const video = settings.mode === 'audio' ? undefined : join(dir, name + '.' + videoExtension(settings.videoFormat));
  const audio = settings.mode === 'video' ? undefined : join(dir, name + '.' + settings.audioFormat);
  return { video, audio, all: [video, audio].filter((value): value is string => !!value) };
}

function partialFile(file: string) {
  const { dir, name, ext } = parse(file);
  return join(dir, `.${name}.${randomUUID()}.partial${ext}`);
}

function videoArgs(settings: ExportSettings, file: string, codec: string) {
  const webm = settings.videoFormat === 'vp9';
  const software = codec === softwareEncoder(settings.videoFormat);
  const pixels = settings.width * settings.height;
  const highLevel = settings.videoFormat === 'h264' && pixels >= 8_000_000 && pixels <= 8_294_400 && settings.fps >= 50;
  const profile = highLevel && (codec === 'libx264' || codec === 'h264_nvenc' || codec === 'h264_qsv')
    ? ['-profile:v', 'high', '-level:v', '5.2'] : [];
  return ['-map', '[vout]', '-map', '[aout]', '-c:v', codec, '-pix_fmt', 'yuv420p', '-r', String(settings.fps),
    '-b:v', settings.bitrate + 'M', ...(webm ? ['-deadline', 'good', '-cpu-used', '4'] :
      [...(software ? ['-preset', 'veryfast'] : []), '-movflags', '+faststart']),
    ...profile, '-threads', '0',
    '-c:a', webm ? 'libopus' : 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', file];
}

function audioArgs(settings: ExportSettings, file: string) {
  const codec = { mp3: 'libmp3lame', wav: 'pcm_s16le', m4a: 'aac' }[settings.audioFormat];
  const map = settings.mode === 'both' ? '[aonly]' : '[aout]';
  return ['-map', map, '-c:a', codec, '-ar', '48000', '-ac', '2',
    ...(settings.audioFormat === 'wav' ? [] : ['-b:a', settings.audioBitrate + 'k']), file];
}

export async function exportProject(
  project: Project, value: ExportSettings, selected: string, rasters: TextPng[],
  report: (progress: ExportProgress) => void, signal: AbortSignal,
  sequences: ReadonlyMap<string, RasterInput> = new Map(),
): Promise<ExportResult> {
  const settings = exportSettingsSchema.parse(value);
  if (!isAbsolute(selected) || !extname(selected)) throw new Error('Invalid output path');
  const outputs = outputFiles(selected, settings);
  const captions = settings.burnCaptions === false && outputs.video
    ? (project.captionTracks ?? []).filter((track) => !track.hidden).flatMap((track) => track.segments)
    : [];
  const subtitle = captions.length ? join(dirname(selected), parse(selected).name + '.srt') : undefined;
  if (subtitle) outputs.all.push(subtitle);
  const tempVideo = outputs.video && partialFile(outputs.video);
  const tempAudio = outputs.audio && partialFile(outputs.audio);
  const tempSubtitle = subtitle && partialFile(subtitle);
  const directory = await mkdtemp(join(tmpdir(), 'video-editor-export-'));
  const finalized: string[] = [];
  try {
    await mkdir(dirname(selected), { recursive: true });
    for (const file of outputs.all) {
      try { await access(file); }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
        throw error;
      }
      throw new Error(strings.exportExists);
    }
    const renderProject = captionExportProject(project, settings.mode !== 'audio' && settings.burnCaptions !== false);
    const rasterPaths = settings.mode === 'audio' ? new Map<string, RasterInput>() :
      await saveRasters(directory, renderProject, rasters);
    for (const [id, raster] of sequences) rasterPaths.set(id, raster);
    const { inputs, sources, script, duration } = buildFilterGraph(renderProject, settings, rasterPaths);
    const { bsize, bavail } = await statfs(dirname(selected), { bigint: true });
    if (bsize * bavail < BigInt(estimateExportBytes(settings, duration))) throw new Error(strings.exportSpace);
    for (const source of sources) {
      if (!isAbsolute(source)) throw new Error(strings.exportMissing);
      try { await access(source); } catch { throw new Error(strings.exportMissing); }
    }
    const scriptPath = join(directory, 'filters.txt');
    await writeFile(scriptPath, script);
    const start = Date.now();
    const elapsed = () => (Date.now() - start) / 1000;
    report({ percent: 0, elapsed: 0 });
    const fallback = softwareEncoder(settings.videoFormat);
    let encoder = tempVideo ? await selectEncoder(settings, signal) : undefined;
    const render = (codec: string | undefined) => runMediaTool('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-filter_complex_threads', '2',
      ...inputs, '-filter_complex_script', scriptPath, '-progress', 'pipe:1',
      ...(tempVideo && codec ? videoArgs(settings, tempVideo, codec) : []), ...(tempAudio ? audioArgs(settings, tempAudio) : []),
    ], (time) => {
      const fraction = Math.max(0, Math.min(0.99, time / duration));
      report({ percent: Math.floor(fraction * 100), elapsed: elapsed(),
        eta: fraction > 0 ? elapsed() * (1 / fraction - 1) : undefined, encoder: codec });
    }, signal);
    try { await render(encoder); }
    catch (error) {
      if (signal.aborted || !encoder || encoder === fallback) throw error;
      if (tempVideo) await rm(tempVideo, { force: true });
      if (tempAudio) await rm(tempAudio, { force: true });
      encoder = fallback;
      report({ percent: 0, elapsed: elapsed(), encoder, fallback: true });
      await render(encoder);
    }
    signal.throwIfAborted();
    report({ percent: 99, elapsed: elapsed(), verifying: true });
    if (tempVideo) await verifyExport(tempVideo, duration, settings);
    if (tempAudio) await verifyExport(tempAudio, duration);
    if (tempSubtitle) {
      const begin = settings.range?.start ?? 0;
      const finish = begin + duration;
      const trimmed = captions.flatMap((segment) => {
        const start = Math.max(begin, segment.start);
        const end = Math.min(finish, segment.start + segment.duration);
        return end > start ? [{ ...segment, start: start - begin, duration: end - start }] : [];
      });
      await writeFile(tempSubtitle, exportCaptions(trimmed, 'srt'), { flag: 'wx' });
    }
    signal.throwIfAborted();
    for (const [temp, destination] of [[tempVideo, outputs.video], [tempAudio, outputs.audio], [tempSubtitle, subtitle]]) {
      if (!temp || !destination) continue;
      // Link in the same folder atomically and refuse to overwrite an existing destination.
      try { await link(temp, destination); }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || !['EPERM', 'ENOTSUP', 'EOPNOTSUPP'].includes(String(error.code))) throw error;
        await copyFile(temp, destination, constants.COPYFILE_EXCL);
      }
      finalized.push(destination);
      signal.throwIfAborted();
    }
    report({ percent: 100, elapsed: elapsed() });
    return { files: outputs.all, encoder };
  } catch (error) {
    await Promise.allSettled(finalized.map((file) => unlink(file)));
    if (signal.aborted) return { files: [], cancelled: true };
    throw error;
  } finally {
    await Promise.allSettled([rm(directory, { recursive: true, force: true }),
      ...[tempVideo, tempAudio, tempSubtitle].flatMap((file) => file ? [rm(file, { force: true })] : [])]);
  }
}
