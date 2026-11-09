import type { DownloadContainer, VideoFormat, VideoQuality } from '../types/downloader';

const hosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
export const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
export const formatIdPattern = /^[A-Za-z0-9_-]{1,80}$/;

export function youtubeVideoUrl(input: string): URL | undefined {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return undefined; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !hosts.has(url.hostname)) return undefined;
  const path = /^\/(shorts|live)\/([^/]+)\/?$/.exec(url.pathname);
  const id = url.hostname === 'youtu.be' ? /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] :
    url.pathname === '/watch' ? url.searchParams.get('v') : path?.[2];
  if (!id || !videoIdPattern.test(id)) return undefined;
  return new URL('https://www.youtube.com/watch?v=' + id);
}

export function sanitizeDownloadName(name: string) {
  let safe = name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim().replace(/[. ]+$/u, '');
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])\s*(?:\.|$)/i.test(safe)) safe = '_' + safe;
  safe = safe.slice(0, 150).replace(/[\uD800-\uDBFF]$/u, '').replace(/[. ]+$/u, '');
  return safe || 'video';
}

export const qualityHeight = (format: VideoFormat) => Math.min(format.width ?? Infinity, format.height ?? Infinity);
const hasVideo = (format: VideoFormat) => format.videoCodec !== 'none' && Number.isFinite(qualityHeight(format));
const hasAudio = (format: VideoFormat) => format.audioCodec !== 'none';

function codecRank(codec: string) {
  if (/^(av01|av1)/i.test(codec)) return 4;
  if (/^(vp0?9)/i.test(codec)) return 3;
  if (/^(hev|hvc|hevc)/i.test(codec)) return 2;
  return /^(avc|h264)/i.test(codec) ? 1 : 0;
}

function videoFits(format: VideoFormat, container: DownloadContainer) {
  if (container === 'auto') return true;
  if (container === 'mp4') return format.extension === 'mp4' && (!hasAudio(format) || /^(mp4a|aac)/i.test(format.audioCodec));
  return /^(vp0?[89]|av01|av1)/i.test(format.videoCodec) && (!hasAudio(format) || /^(opus|vorbis)/i.test(format.audioCodec));
}

function audioFits(format: VideoFormat, container: DownloadContainer) {
  return container === 'auto' || (container === 'mp4' ? /^(mp4a|aac)/i.test(format.audioCodec) : /^(opus|vorbis)/i.test(format.audioCodec));
}

export function availableQualities(formats: readonly VideoFormat[], container: DownloadContainer, language?: string): VideoQuality[] {
  const audio = formats.filter((f) => !hasVideo(f) && hasAudio(f) && audioFits(f, container) && (!language || f.language === language))
    .sort((a, b) => (b.audioBitrate ?? b.bitrate ?? 0) - (a.audioBitrate ?? a.bitrate ?? 0))[0];
  return formats.filter((f) => hasVideo(f) && videoFits(f, container) && (hasAudio(f) ? !language || f.language === language : !!audio))
    .sort((a, b) => qualityHeight(b) - qualityHeight(a) || (b.fps ?? 0) - (a.fps ?? 0) ||
      Number(!!b.dynamicRange && b.dynamicRange !== 'SDR') - Number(!!a.dynamicRange && a.dynamicRange !== 'SDR') ||
      codecRank(b.videoCodec) - codecRank(a.videoCodec) || (b.bitrate ?? 0) - (a.bitrate ?? 0))
    .map((video) => ({
      video,
      audio: hasAudio(video) ? undefined : audio,
      estimatedBytes: video.sizeBytes && (hasAudio(video) || audio?.sizeBytes)
        ? video.sizeBytes + (hasAudio(video) ? 0 : audio?.sizeBytes ?? 0) : undefined,
    }));
}
