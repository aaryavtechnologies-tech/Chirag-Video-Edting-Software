import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function ScrollHints({ selector, className = '', children }: { selector: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let scroller: HTMLElement | null = null;
    let pending = 0;
    const resize = new ResizeObserver(update);
    function update() {
      const current = frame!.querySelector<HTMLElement>(selector);
      if (current !== scroller) {
        resize.disconnect();
        scroller = current;
        if (current) resize.observe(current);
      }
      frame!.toggleAttribute('data-scroll-above', !!scroller && scroller.scrollTop > 1);
      frame!.toggleAttribute('data-scroll-below', !!scroller && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
    }
    function schedule() {
      if (pending) return;
      pending = requestAnimationFrame(() => { pending = 0; update(); });
    }
    const mutations = new MutationObserver(schedule);
    mutations.observe(frame, { childList: true, subtree: true, characterData: true });
    frame.addEventListener('scroll', schedule, true);
    frame.addEventListener('load', schedule, true);
    frame.addEventListener('toggle', schedule, true);
    update();
    return () => {
      cancelAnimationFrame(pending);
      mutations.disconnect();
      resize.disconnect();
      frame.removeEventListener('scroll', schedule, true);
      frame.removeEventListener('load', schedule, true);
      frame.removeEventListener('toggle', schedule, true);
    };
  }, [selector]);
  return <div ref={ref} className={`scroll-hints ${className}`}>{children}</div>;
}
