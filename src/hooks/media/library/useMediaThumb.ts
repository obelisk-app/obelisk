'use client';

import { useState } from 'react';

/**
 * Whether a thumbnail's source failed to load. Remembered per source, so a
 * new `src` gets a fresh try; `onError` still hears about each failure.
 */
export function useMediaThumb(src: string, onError?: () => void) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const failed = () => {
    setBrokenSrc(src);
    onError?.();
  };
  return { broken: brokenSrc === src, failed };
}
