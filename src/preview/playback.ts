export class PlaybackClock {
  private anchor = 0;
  private position = 0;
  private running = false;

  time(now: number) {
    return this.position + (this.running ? (now - this.anchor) / 1000 : 0);
  }

  seek(position: number, now: number) {
    this.position = position;
    this.anchor = now;
  }

  play(now: number) {
    if (this.running) return;
    this.anchor = now;
    this.running = true;
  }

  pause(now: number) {
    this.position = this.time(now);
    this.running = false;
  }
}
