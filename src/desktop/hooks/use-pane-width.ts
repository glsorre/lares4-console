import { useEffect, useRef, useState } from 'react';

/**
 * Observes the rendered pixel width of an element via ResizeObserver. Returns the
 * current width along with a ref that must be attached to the target element. Width
 * stays at 0 until the first measurement, so callers should treat that as "not yet
 * measured" rather than "narrow".
 */
export function usePaneWidth<T extends HTMLElement = HTMLDivElement>(): {
  ref: React.RefObject<T | null>;
  width: number;
} {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number>(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
