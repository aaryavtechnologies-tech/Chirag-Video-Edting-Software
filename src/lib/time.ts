export function timeToFrame(seconds: number, fps: number) {
  return Math.round(seconds * fps);
}

export function frameToTime(frame: number, fps: number) {
  return frame / fps;
}

export function alignFrame(seconds: number, fps: number) {
  return frameToTime(timeToFrame(seconds, fps), fps);
}

export function timecode(seconds: number, fps: number) {
  const frames = Math.max(0, timeToFrame(seconds, fps));
  const whole = Math.floor(frames / fps);
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60, frames % fps]
    .map((value) => String(value).padStart(2, '0')).join(':');
}
