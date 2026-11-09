export type DownloadContainer = 'auto' | 'mp4' | 'webm';

export interface VideoFormat {
  id: string;
  extension: string;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec: string;
  audioCodec: string;
  dynamicRange?: string;
  bitrate?: number;
  audioBitrate?: number;
  sizeBytes?: number;
  language?: string;
}

export interface VideoInfo {
  id: string;
  url: string;
  title: string;
  channel?: string;
  duration?: number;
  uploadDate?: string;
  views?: number;
  thumbnail?: string;
  creativeCommons: boolean;
  formats: VideoFormat[];
}

export interface VideoQuality {
  video: VideoFormat;
  audio?: VideoFormat;
  estimatedBytes?: number;
}
