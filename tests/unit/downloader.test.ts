import { describe, expect, it } from 'vitest';
import { availableQualities, sanitizeDownloadName, youtubeVideoUrl } from '../../src/lib/youtube';
import { downloaderError, infoArguments, parseVideoInfo } from '../../electron/services/downloader';
import { strings as s } from '../../src/lib/strings';

const id = 'aBc_123-XyZ';
const canonical = 'https://www.youtube.com/watch?v=' + id;
const url = new URL(canonical);
const formats = [
  { format_id: '401', ext: 'mp4', width: 3840, height: 2160, fps: 30, vcodec: 'av01', tbr: 9000, acodec: 'none' },
  { format_id: '313', ext: 'webm', width: 3840, height: 2160, fps: 60, vcodec: 'vp9', tbr: 7500, acodec: 'none' },
  { format_id: '303', ext: 'webm', width: 1920, height: 1080, fps: 60, vcodec: 'vp9', acodec: 'none' },
  { format_id: '251', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 160, filesize: 1200 },
  { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize: 1000 },
  { format_id: '18', ext: 'mp4', width: 640, height: 360, fps: 30, vcodec: 'avc1', acodec: 'mp4a.40.2' },
];
const fixture = { id, title: 'Example', duration: 10, license: 'Creative Commons Attribution', formats };

describe('YouTube URL normalization', () => {
  it.each([
    `https://youtu.be/${id}?si=x`, `${canonical}&list=PLabc&index=2&t=30#tracking`,
    `https://m.youtube.com/shorts/${id}?feature=share`, `https://youtube.com/live/${id}`,
    `https://music.youtube.com/watch?v=${id}`,
  ])('canonicalizes %s', (input) => expect(youtubeVideoUrl(input)?.href).toBe(canonical));

  it.each([
    'http://www.youtube.com/watch?v=' + id, 'https://youtube.com.evil.test/watch?v=' + id,
    'https://evil.test@youtube.com/watch?v=' + id, 'https://youtube.com:8080/watch?v=' + id,
    'https://youtu.be/' + id + '/extra', 'https://www.youtube.com/playlist?list=PLabc',
    'https://youtube.com/watch?v=%2D%2Dhelp', '--help',
  ])('rejects %s', (input) => expect(youtubeVideoUrl(input)).toBeUndefined());
});

describe('downloader metadata', () => {
  it('prefers resolution and frame rate, then chooses compatible audio and video', () => {
    const info = parseVideoInfo(fixture, url);
    expect(info.creativeCommons).toBe(true);
    expect(availableQualities(info.formats, 'auto')[0]).toMatchObject({
      video: { id: '313' }, audio: { id: '251' }, estimatedBytes: 9_376_200,
    });
    expect(availableQualities(info.formats, 'mp4')[0]).toMatchObject({ video: { id: '401' }, audio: { id: '140' } });
    expect(availableQualities(info.formats, 'webm')[0].video.id).toBe('313');
  });

  it('keeps DRM and unsafe format identifiers out of renderer data', () => {
    const info = parseVideoInfo({ ...fixture, thumbnail: 'https://evil.test/image.jpg', formats: [
      ...formats, { ...formats[0], format_id: 'drm', has_drm: true },
      { ...formats[0], format_id: 'best+ba' },
    ] }, url);
    expect(info.thumbnail).toBeUndefined();
    expect(info.formats).toHaveLength(formats.length);
  });

  it('rejects unavailable and restricted content', () => {
    expect(() => parseVideoInfo({ ...fixture, live_status: 'is_live' }, url)).toThrow(s.downloaderLive);
    expect(() => parseVideoInfo({ ...fixture, availability: 'subscriber_only' }, url)).toThrow(s.downloaderRestricted);
    expect(downloaderError('The uploader has not made this video available in your country')).toBe(s.downloaderRegion);
  });

  it('passes URL and JavaScript runtime as separate arguments and ignores third-party configuration', () => {
    const runtime = 'C:/Program Files/Video Editor/deno.exe';
    const args = infoArguments(url, runtime);
    expect(args).toContain('deno:' + runtime);
    expect(args).toContain('--ignore-config');
    expect(args).toContain('--no-cookies-from-browser');
    expect(args.slice(-2)).toEqual(['--', canonical]);
  });
});

it('sanitizes Windows file names, device names, and trailing punctuation', () => {
  expect(sanitizeDownloadName('A<>:"/\\|?*... ')).toBe('A_________');
  expect(sanitizeDownloadName('CON.txt')).toBe('_CON.txt');
  expect(sanitizeDownloadName('...')).toBe('video');
  expect(sanitizeDownloadName('a'.repeat(149) + '😀')).toBe('a'.repeat(149));
});
