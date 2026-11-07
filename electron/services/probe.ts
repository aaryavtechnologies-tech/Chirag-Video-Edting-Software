import { extname } from 'node:path';
import { z } from 'zod';
import type { Asset } from '../../src/types/project';
import { runMediaTool } from './ffmpeg';

const mediaKinds: Record<Asset['type'], string[]> = {
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  audio: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'],
};

export const mediaExtensions = Object.values(mediaKinds).flat();
const kinds = Object.keys(mediaKinds) as Asset['type'][];
const streamSchema = z.object({
  codec_type: z.string(), width: z.number().int().optional(), height: z.number().int().optional(),
  avg_frame_rate: z.string().optional(), duration: z.string().optional(),
  disposition: z.object({ attached_pic: z.number().optional() }).optional(),
  tags: z.object({ rotate: z.string().optional() }).optional(),
  side_data_list: z.array(z.object({ rotation: z.number().optional() })).optional(),
});
const probeSchema = z.object({
  streams: z.array(streamSchema),
  format: z.object({ duration: z.string().optional() }).optional(),
});

export async function probeAsset(path: string, id: string): Promise<Asset> {
  const ext = extname(path).slice(1).toLowerCase();
  const type = kinds.find((kind) => mediaKinds[kind].includes(ext));
  if (!type) throw new Error('Unsupported media extension');
  const raw = await runMediaTool('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]);
  const { streams, format } = probeSchema.parse(JSON.parse(raw));
  const video = streams.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  if (type === 'audio' ? !audio : !video) throw new Error('Expected media stream was missing');
  const rotation = video?.side_data_list?.find((data) => data.rotation !== undefined)?.rotation ??
    Number(video?.tags?.rotate ?? 0);
  const swap = Math.abs(rotation % 180) === 90;
  const [numerator, denominator] = (video?.avg_frame_rate ?? '0/1').split('/').map(Number);
  const fps = numerator / denominator;
  const duration = type === 'image' ? 5 : Number(format?.duration ?? video?.duration ?? audio?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Media duration unavailable');
  return {
    id, path, type, duration, hasAudio: type !== 'image' && !!audio,
    ...(type !== 'audio' && {
      width: swap ? video?.height : video?.width,
      height: swap ? video?.width : video?.height,
    }),
    ...(type === 'video' && fps > 0 && Number.isFinite(fps) && { fps }),
  };
}
