import { useCallback, useEffect, useRef, useState } from 'react';
import { PlaybackClock } from './playback';

export function usePlayback(length: number) {
  const clock = useRef(new PlaybackClock());
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const seek = useCallback((time: number) => {
    clock.current.seek(time, performance.now());
    setPlayhead(time);
  }, []);

  const toggle = useCallback(() => {
    if (length <= 0) return;
    const now = performance.now();
    if (playing) {
      clock.current.pause(now);
      setPlaying(false);
    } else {
      if (clock.current.time(now) >= length) seek(0);
      clock.current.play(now);
      setPlaying(true);
    }
  }, [length, playing, seek]);

  const stop = useCallback(() => {
    clock.current.pause(performance.now());
    setPlaying(false);
    seek(0);
  }, [seek]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    function tick(now: number) {
      const next = clock.current.time(now);
      if (next >= length) {
        if (loop && length > 0) seek(0);
        else {
          clock.current.pause(now);
          seek(length);
          setPlaying(false);
          return;
        }
      } else setPlayhead(next);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, length, loop, seek]);

  return { playing, loop, setLoop, playhead, seek, toggle, stop };
}
