import type { CaptionSegment } from './types';

/** Speech providers may implement this interface in a future release. */
export interface ICaptionProvider {
  transcribe(file: string, signal: AbortSignal): Promise<CaptionSegment[]>;
}
