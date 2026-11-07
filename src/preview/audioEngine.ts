import { audioGain, audioLayers } from '../lib/audioMix';
import type { Asset, Project } from '../types/project';
import { fadeOpacity } from './compositor';

interface Channel { element: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode; path: string }

export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private analyser?: AnalyserNode;
  private samples = new Float32Array(512);
  private channels = new Map<string, Channel>();

  resume() {
    if (!this.context) {
      const context = new AudioContext();
      const master = context.createGain();
      const limiter = context.createDynamicsCompressor();
      const analyser = context.createAnalyser();
      limiter.threshold.value = -1;
      limiter.knee.value = 2;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.08;
      analyser.fftSize = this.samples.length;
      master.connect(limiter).connect(analyser).connect(context.destination);
      this.context = context;
      this.master = master;
      this.analyser = analyser;
    }
    void this.context.resume().catch(() => undefined);
  }

  update(project: Project, time: number, playing: boolean, volume: number) {
    if (!this.context || !this.master) return 0;
    const active = new Set<string>();
    if (playing) {
      this.master.gain.setTargetAtTime(volume, this.context.currentTime, 0.01);
      for (const { clip, track, asset } of audioLayers(project)) {
        if (time < clip.start || time >= clip.start + clip.duration) continue;
        active.add(clip.id);
        const { element, gain } = this.channel(clip.id, asset);
        const speed = clip.speed ?? 1;
        const target = (clip.sourceIn ?? 0) + (time - clip.start) * speed;
        if (element.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(element.duration) &&
          Math.abs(element.currentTime - target) > 0.08 && !element.seeking) {
          element.currentTime = Math.min(Math.max(0, target), element.duration);
        }
        element.playbackRate = speed;
        gain.gain.setTargetAtTime(audioGain(track, clip) * fadeOpacity(clip, time), this.context.currentTime, 0.005);
        if (element.paused && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          void element.play().catch(() => undefined);
        }
      }
    }
    for (const [id, channel] of this.channels) {
      if (active.has(id)) continue;
      channel.element.pause();
      if (this.channels.size > 24) this.release(id, channel);
    }
    if (!playing || !this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    return this.samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
  }

  close() {
    for (const [id, channel] of this.channels) this.release(id, channel);
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.master = undefined;
    this.analyser = undefined;
  }

  private channel(id: string, asset: Asset) {
    const existing = this.channels.get(id);
    if (existing?.path === asset.path) return existing;
    if (existing) this.release(id, existing);
    const context = this.context!;
    const element = new Audio();
    element.crossOrigin = 'anonymous';
    element.preload = 'auto';
    element.preservesPitch = true;
    if (asset.proxyPath) element.onerror = () => {
      element.onerror = null;
      element.src = `editor-media://proxy/${encodeURIComponent(asset.id)}`;
    };
    element.src = `editor-media://source/${encodeURIComponent(asset.id)}`;
    const source = context.createMediaElementSource(element);
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.master!);
    const channel = { element, source, gain, path: asset.path };
    this.channels.set(id, channel);
    return channel;
  }

  private release(id: string, channel: Channel) {
    channel.element.pause();
    channel.element.onerror = null;
    channel.element.removeAttribute('src');
    channel.element.load();
    channel.source.disconnect();
    channel.gain.disconnect();
    this.channels.delete(id);
  }
}
