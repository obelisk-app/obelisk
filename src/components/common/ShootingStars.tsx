'use client';

import { useShootingStars } from '@/hooks/common/useShootingStars';

interface ShootingStarsProps {
  /**
   * When true, the canvas sizes to its containing element (absolute inset-0)
   * instead of the viewport. Use this to drop the effect inside a card, like
   * the welcome bot banner.
   */
  contained?: boolean;
  /** How many streaks to pool at once. Defaults to 5. */
  count?: number;
}

/** Lime streaks crossing the background; the animation is `src/services/common/shooting-stars.ts`. */
export default function ShootingStars({ contained = false, count = 5 }: ShootingStarsProps = {}) {
  const { canvasRef, mounted } = useShootingStars({ contained, count });

  if (!mounted) return null;

  return (
    <canvas
      ref={canvasRef}
      className={
        contained
          ? 'absolute inset-0 pointer-events-none w-full h-full'
          : 'fixed inset-0 pointer-events-none z-0'
      }
      aria-hidden="true"
    />
  );
}
