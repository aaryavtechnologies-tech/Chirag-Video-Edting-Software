import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { strings as s } from '../../src/lib/strings';
import { formatIdPattern, youtubeVideoUrl } from '../../src/lib/youtube';
import type { VideoFormat, VideoInfo } from '../../src/types/downloader';

const execute = promisify(execFile);
const number = z.number().finite().nonnegative().nullish();
const string = z.string().nullish();
const rawFormat = z.object({
  format_id: z.string().regex(formatIdPattern), ext: z.string().regex(/^[a-z0-9]{1,12}$/),
  width: number, height: number, fps: number, vcodec: string, acodec: string,
  dynamic_range: string, tbr: number, abr: number, filesize: number, filesize_approx: number,
  language: string, has_drm: z.boolean().nullish(),
});
const rawInfo = z.object({
  id: z.string(), title: z.string(), uploader: string, channel: string, duration: number, upload_date: string,
  view_count: number, thumbnail: string, license: string, live_status: string, availability: string,
  formats: z.array(z.unknown()),
});

export function parseVideoInfo(payload: unknown, url: URL): VideoInfo {
  const result = rawInfo.safeParse(payload);
  if (!result.success || result.data.id !== url.searchParams.get('v')) throw new Error(s.downloaderExtraction);
  const info = result.data;
  if (info.live_status === 'is_live' || info.live_status === 'is_upcoming' || info.live_status === 'post_live') {
    throw new Error(s.downloaderLive);
  }
  if (info.availability && !['public', 'unlisted'].includes(info.availability)) {
    throw new Error(s.downloaderRestricted);
  }
  const formats = new Map<string, VideoFormat>();
  for (const raw of info.formats) {
    const parsed = rawFormat.safeParse(raw);
    if (!parsed.success) continue;
    const f = parsed.data;
    if (f.has_drm || (!f.vcodec || f.vcodec === 'none') && (!f.acodec || f.acodec === 'none')) continue;
    formats.set(f.format_id, {
      id: f.format_id, extension: f.ext, width: f.width ?? undefined, height: f.height ?? undefined,
      fps: f.fps ?? undefined, videoCodec: f.vcodec ?? 'none', audioCodec: f.acodec ?? 'none',
      dynamicRange: f.dynamic_range ?? undefined, bitrate: f.tbr ?? undefined, audioBitrate: f.abr ?? undefined,
      sizeBytes: f.filesize ?? f.filesize_approx ?? (f.tbr && info.duration ? Math.round(f.tbr * info.duration * 125) : undefined),
      language: f.language ?? undefined,
    });
  }
  if (!formats.size) throw new Error(s.downloaderExtraction);
  let thumbnail: string | undefined;
  try {
    const image = new URL(info.thumbnail ?? '');
    if (image.protocol === 'https:' && !image.port && !image.username && !image.password &&
        (image.hostname === 'i.ytimg.com' || image.hostname === 'img.youtube.com')) thumbnail = image.href;
  } catch { /* Thumbnails are optional. */ }
  return {
    id: info.id, url: url.href, title: info.title, channel: info.channel ?? info.uploader ?? undefined,
    duration: info.duration ?? undefined, uploadDate: info.upload_date ?? undefined, views: info.view_count ?? undefined,
    thumbnail, creativeCommons: /creative commons/i.test(info.license ?? ''), formats: [...formats.values()],
  };
}

export function infoArguments(url: URL, deno: string): string[] {
  return ['--ignore-config', '--no-plugin-dirs', '--no-remote-components', '--no-cookies', '--no-cookies-from-browser',
    '--no-js-runtimes', '--js-runtimes', 'deno:' + deno, '--dump-single-json', '--no-playlist', '--no-warnings', '--', url.href];
}

export function downloaderError(details: string): string {
  if (/(?:not available|not made .+ available) in your country|geo.restricted|region.blocked/i.test(details)) return s.downloaderRegion;
  if (/private video|members.only|join this channel|age.restricted|confirm your age|login.required/i.test(details)) {
    return s.downloaderRestricted;
  }
  if (/live event will begin|upcoming|currently live/i.test(details)) return s.downloaderLive;
  if (/video unavailable|has been removed|does not exist/i.test(details)) return s.downloaderUnavailable;
  if (/unable to download webpage|timed out|connection reset|name resolution/i.test(details)) return s.downloaderNetwork;
  return s.downloaderExtraction;
}

export class Downloader {
  constructor(private readonly directory: string) {}

  async tools() {
    const suffix = process.platform === 'win32' ? '.exe' : '';
    const ytDlp = join(this.directory, 'yt-dlp' + suffix);
    const deno = join(this.directory, 'deno' + suffix);
    await access(ytDlp).catch(() => { throw new Error(s.downloaderMissing); });
    await access(deno).catch(() => { throw new Error(s.downloaderRuntimeMissing); });
    return { ytDlp, deno };
  }

  async getInfo(input: string, log: (error: unknown) => Promise<void>): Promise<VideoInfo> {
    const url = typeof input === 'string' && input.length <= 4096 ? youtubeVideoUrl(input) : undefined;
    if (!url) throw new Error(s.downloaderInvalidUrl);
    const { ytDlp, deno } = await this.tools();
    let output: string;
    try {
      const result = await execute(ytDlp, infoArguments(url, deno), {
        shell: false, windowsHide: true, timeout: 60_000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8',
      });
      output = result.stdout;
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message.slice(-4000) : '';
      await log(diagnostic);
      throw new Error(downloaderError(diagnostic));
    }
    let data: unknown;
    try { data = JSON.parse(output); } catch { throw new Error(s.downloaderExtraction); }
    return parseVideoInfo(data, url);
  }
}
