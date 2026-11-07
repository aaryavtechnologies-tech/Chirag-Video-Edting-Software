import type { Asset, Clip } from '../types/project';

type Element = HTMLVideoElement | HTMLImageElement;
type Entry = { element: Element; key: string; failed: boolean };

export class MediaElements {
  private entries = new Map<string, Entry>();

  use(clip: Clip, asset: Asset, useProxy: boolean, onChange: () => void) {
    const kind = asset.type === 'image' ? 'image' : 'video';
    const proxy = kind === 'video' && useProxy && !!asset.proxyPath;
    const key = [asset.path, proxy ? asset.proxyPath : '', kind].join('|');
    const previous = this.entries.get(clip.id);
    if (previous?.key === key) return previous;
    if (previous) this.release(previous);
    const element = kind === 'image' ? new Image() : document.createElement('video');
    const entry: Entry = { element, key, failed: false };
    const original = `editor-media://source/${encodeURIComponent(asset.id)}`;
    let hasProxy = proxy;
    element.crossOrigin = 'anonymous';
    element.onerror = () => {
      if (hasProxy) {
        hasProxy = false;
        element.src = original;
      } else {
        entry.failed = true;
        onChange();
      }
    };
    if (element instanceof HTMLVideoElement) {
      element.preload = 'auto';
      element.muted = true;
      element.playsInline = true;
      element.onloadeddata = onChange;
      element.onseeked = onChange;
    } else element.onload = onChange;
    element.src = proxy ? `editor-media://proxy/${encodeURIComponent(asset.id)}` : original;
    this.entries.set(clip.id, entry);
    return entry;
  }

  suspendExcept(active: ReadonlySet<string>) {
    for (const [id, entry] of this.entries) {
      if (!active.has(id) && entry.element instanceof HTMLVideoElement) entry.element.pause();
    }
    if (this.entries.size <= 12) return;
    for (const [id, entry] of this.entries) {
      if (!active.has(id)) {
        this.release(entry);
        this.entries.delete(id);
      }
    }
  }

  clear() {
    for (const entry of this.entries.values()) this.release(entry);
    this.entries.clear();
  }

  private release({ element }: Entry) {
    element.onerror = null;
    if (element instanceof HTMLVideoElement) {
      element.onloadeddata = null;
      element.onseeked = null;
      element.pause();
      element.removeAttribute('src');
      element.load();
    } else {
      element.onload = null;
      element.removeAttribute('src');
    }
  }
}
