'use client';

import { useEffect, useState } from 'react';
import { MOBILE_QUERY } from '@/constants/common/breakpoints';

/**
 * Whether the viewport is a phone-sized one, or `null` before the client
 * has asked `window.matchMedia`. The first paint (and SSR) reports `null`
 * so the caller can render nothing instead of the wrong shell, which is
 * what avoids a hydration mismatch when the user-agent and the viewport
 * disagree. Follows the query if the window is resized across it.
 */
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      queueMicrotask(() => setIsMobile(false));
      return;
    }
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}
