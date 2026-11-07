import { execFile } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), 'Demo'));
const file = join(root, 'Demo.vedit');
const exists = await access(file).then(() => true, () => false);
if (!exists) {
  if (!ffmpeg) throw new Error('FFmpeg is unavailable on this platform.');
  const directory = join(root, 'media');
  await Promise.all([directory, join(root, 'cache'), join(root, 'exports')]
    .map((path) => mkdir(path, { recursive: true })));
  const source = async (name, filter, options) => {
    const path = join(directory, name);
    await promisify(execFile)(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', filter,
      ...options, path,
    ]);
    return path;
  };
  const video = (id, filter) => source(id + '.mp4', filter, ['-c:v', 'libx264', '-threads', '2'])
    .then((path) => ({ id, path, type: 'video', width: 640, height: 360, duration: 3, fps: 30 }));
  const image = (id, color) => source(id + '.png', `color=c=${color}:s=320x180`,
    ['-frames:v', '1', '-threads', '1', '-update', '1'])
    .then((path) => ({ id, path, type: 'image', width: 320, height: 180, duration: 5 }));
  const audio = (id, frequency) => source(id + '.wav', `sine=frequency=${frequency}:sample_rate=48000:duration=3`,
    ['-c:a', 'pcm_s16le']).then((path) => ({ id, path, type: 'audio', duration: 3, hasAudio: true }));
  const assets = await Promise.all([
    video('grid', 'testsrc2=s=640x360:r=30:d=3'),
    video('bars', 'smptebars=s=640x360:r=30:d=3'),
    image('indigo', '0x3730a3'), image('purple', '0x6d28d9'),
    audio('tone-low', 220), audio('tone-high', 330),
  ]);
  const assetClip = (assetId, type, start, duration, transform, options) =>
    ({ id: assetId + '-clip', assetId, type, start, duration, transform, ...options });
  const textClip = (id, text, start, y, style) =>
    ({ id, type: 'text', text, start, duration: 1, transform: { y }, style });
  const track = (name, order, clips) =>
    ({ id: name.toLowerCase(), name, order, kind: name.startsWith('V') ? 'video' : 'audio', clips });
  const project = {
    version: 1, id: 'video-editor-demo', name: 'Video Editor Demo',
    settings: { width: 3840, height: 2160, fps: 60, background: '#10111a', sampleRate: 48000 },
    assets,
    tracks: [
      track('V1', 0, [assetClip('grid', 'video', 0, 1.5, { scale: 1 }),
        assetClip('bars', 'video', 1.5, 1.5, { scale: 1 })]),
      track('V2', 1, [assetClip('indigo', 'image', 0, 1.5, { x: 0.75, y: 0.75, scale: 0.3, rotation: -5 }),
        assetClip('purple', 'image', 1.5, 1.5, { x: 0.75, y: 0.75, scale: 0.3 })]),
      track('V3', 2, [
        textClip('title-one', 'VIDEO EDITOR', 0, 0.3, {
          fontFamily: 'Montserrat', fontSize: 170, bold: true,
          fill: { type: 'gradient', gradient: { from: '#ffdc9c', to: '#ff92cb', angle: 90 } },
          stroke: { color: '#20203c', width: 7 }, animationIn: 'slideUp',
        }),
        textClip('title-two', 'Three video layers', 1, 0.35, {
          fontFamily: 'Poppins', fontSize: 130, background: { color: '#1b1b34', padding: 25, radius: 14 },
        }),
        textClip('title-three', '4K  •  60 FPS', 2, 0.35, {
          fontFamily: 'Bebas Neue', fontSize: 170, glow: { color: '#8d7bff', blur: 18 }, animationOut: 'fade',
        }),
      ]),
      track('A1', 0, [assetClip('tone-low', 'audio', 0, 3, undefined, { volume: 0.35, fadeIn: 0.25, fadeOut: 0.4 })]),
      track('A2', 1, [assetClip('tone-high', 'audio', 0, 3, undefined, { volume: 0.25, fadeIn: 0.4, fadeOut: 0.25 })]),
    ],
    markers: [{ time: 1, label: 'Second title' }, { time: 2, label: '4K title' }],
  };
  await writeFile(file, JSON.stringify(project, null, 2) + '\n', { flag: 'wx' });
}
console.log(file);
