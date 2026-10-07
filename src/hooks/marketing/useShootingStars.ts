'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { startShootingStars } from './shooting-stars-canvas';

/** "Is this the client" never changes for the life of the document. */
const subscribeToNothing = () => () => {};
const readTrue = () => true;
const readFalse = () => false;

/**
 * `ShootingStars`' view model: the canvas ref, whether to render it, and the
 * animation running on it while it is mounted.
 *
 * The canvas is client-only. Hydration takes the server snapshot (false) for
 * its first render so the markup matches; a client-side mount reads true at
 * once rather than spending a render on nothing.
 */
export function useShootingStars({ contained, count }: { contained: boolean; count: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mounted = useSyncExternalStore(subscribeToNothing, readTrue, readFalse);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startShootingStars(canvas, { contained, count });
  }, [mounted, contained, count]);

  return { canvasRef, mounted };
}
