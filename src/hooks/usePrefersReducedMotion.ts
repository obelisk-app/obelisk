'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the reader has asked their OS to stop things moving
 * (`prefers-reduced-motion: reduce`), live: it follows the setting if it
 * changes while the page is open.
 *
 * The media query is an external store: read it directly rather than
 * copying it into state from an effect, which cost one render with the
 * wrong answer on every mount. On the server it is always false.
 */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const subscribeReducedMotion = (notify: () => void) => {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener('change', notify);
  return () => mq.removeEventListener('change', notify);
};
const readReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const readReducedMotionOnServer = () => false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, readReducedMotionOnServer);
}
