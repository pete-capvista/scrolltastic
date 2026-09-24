import gsap from 'gsap';
import type { ScrollDriver } from '../interaction/navigation';
import { destinationTolerance } from '../interaction/navigation';

/** Animate native document scroll, tracking a Beat whose layout may change. */
export function createScrollDriver(): ScrollDriver {
  return {
    move(destination, complete) {
      let stopped = false;
      let frame = 0;
      let lastRatio = 0;
      let lastWrite = window.scrollY;
      let corrections = 0;
      let tween: gsap.core.Tween | undefined;
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const cursor = { ratio: 0 };
      const stop = () => {
        if (stopped) return;
        stopped = true;
        tween?.kill();
        cancelAnimationFrame(frame);
        window.removeEventListener('scroll', interrupted);
      };
      const finish = () => { stop(); complete(); };
      const interrupted = () => {
        // Wheel/touch/key cancellation is handled by input adapters. This also
        // yields to scrollbar and other native/programmatic scroll changes.
        if (Math.abs(window.scrollY - lastWrite) > 8) finish();
      };
      const write = (y: number) => {
        window.scrollTo({ top: y, behavior: 'instant' });
        lastWrite = window.scrollY;
      };
      const settle = () => {
        if (stopped) return;
        const y = destination();
        if (y === undefined || Math.abs(window.scrollY - y) <= destinationTolerance || corrections++ >= 12) { finish(); return; }
        write(y);
        // Let ScrollTrigger and layout update before resolving the same ID again.
        frame = requestAnimationFrame(settle);
      };
      window.addEventListener('scroll', interrupted, { passive: true });
      if (motion.matches) {
        const y = destination();
        if (y !== undefined) write(y);
        frame = requestAnimationFrame(settle);
      } else {
        tween = gsap.to(cursor, {
          ratio: 1, duration: .55, ease: 'power2.inOut',
          onUpdate: () => {
            if (stopped) return;
            const y = destination();
            if (y === undefined) { finish(); return; }
            if (motion.matches) { write(y); finish(); return; }
            // Consume the remaining eased distance toward the latest coordinate,
            // rather than restarting a tween every time a FIT Panel resizes.
            const step = (cursor.ratio - lastRatio) / Math.max(1e-8, 1 - lastRatio);
            write(window.scrollY + (y - window.scrollY) * step);
            lastRatio = cursor.ratio;
          },
          onComplete: () => { if (!stopped) frame = requestAnimationFrame(settle); },
        });
      }
      return stop;
    },
  };
}
