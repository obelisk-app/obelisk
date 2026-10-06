'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Which image the lightbox shows (null when closed), with wrap-around
 * prev/next and the keyboard: Escape closes, arrows step.
 */
export function useLightboxIndex(count: number) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const close = useCallback(() => setLightboxIndex(null), []);
  const next = useCallback(
    () => setLightboxIndex((i) => (i === null ? null : (i + 1) % count)),
    [count],
  );
  const prev = useCallback(
    () =>
      setLightboxIndex((i) =>
        i === null ? null : (i - 1 + count) % count,
      ),
    [count],
  );

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightboxIndex, close, next, prev]);

  return { lightboxIndex, setLightboxIndex, close, next, prev };
}
