'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Reveal-on-scroll: `visible` flips to true the first time the element
 * attached to `ref` enters the viewport (15% of it is enough) and stays
 * true. The observer disconnects after that one trigger, so a section that
 * scrolls back out does not fade again.
 */
export function useScrollReveal<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}
