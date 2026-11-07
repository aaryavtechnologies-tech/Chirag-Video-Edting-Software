import { useEffect, useState } from 'react';
import type { Asset, Clip } from '../types/project';

type Peaks = { step: number; peaks: number[] };
const requests = new Map<string, Promise<Peaks>>();

export function Waveform({ asset, clip }: { asset: Asset; clip: Clip }) {
  const [wave, setWave] = useState<Peaks>();
  useEffect(() => {
    if (!asset.waveformPath) return;
    const key = asset.id + asset.path;
    const request = requests.get(key) ?? fetch(`editor-media://waveform/${encodeURIComponent(asset.id)}`)
      .then((response) => {
        if (!response.ok) throw new Error('Waveform unavailable');
        return response.json() as Promise<Peaks>;
      });
    requests.set(key, request);
    let cancelled = false;
    void request.then((data) => { if (!cancelled) setWave(data); }, () => requests.delete(key));
    return () => { cancelled = true; };
  }, [asset.id, asset.path, asset.waveformPath]);
  if (!wave) return null;
  const first = clip.sourceIn ?? 0;
  const duration = clip.duration * (clip.speed ?? 1);
  const count = Math.min(180, Math.max(3, Math.ceil(duration / wave.step)));
  const bars = Array.from({ length: count }, (_, index) => {
    const start = Math.floor((first + duration * index / count) / wave.step);
    const end = Math.ceil((first + duration * (index + 1) / count) / wave.step);
    const height = Math.max(0.7, Math.max(0, ...wave.peaks.slice(start, end)) * 11);
    return `M${index + 0.5} ${12 - height}v${height * 2}`;
  }).join(' ');
  return <svg className="clip-wave" viewBox={`0 0 ${count} 24`} preserveAspectRatio="none" aria-hidden="true">
    <path d={bars} stroke="currentColor" strokeWidth=".72" fill="none" />
  </svg>;
}
