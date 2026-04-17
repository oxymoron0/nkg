import { useEffect, useRef, useState } from 'react';

type Size = { width: number; height: number };

/**
 * Tracks an element's size via ResizeObserver. Returns a ref to attach to the
 * target element and the current `{ width, height }` (initially 0/0 until the
 * first observation fires).
 */
export function useResizeObserver<T extends HTMLElement>(): {
  ref: React.RefObject<T>;
  size: Size;
} {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}
