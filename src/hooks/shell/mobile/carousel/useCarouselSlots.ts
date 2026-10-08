import { useMemo, useState } from 'react';
import type { NavState, ScreenName } from '@/utils/shell/mobile/url-state';
import { carouselSlots } from '@/utils/shell/mobile/carousel-slots';

/** Mount a tab when it is first exposed, then preserve its state across later switches. */
export function useCarouselSlots(nav: NavState, neighbors: { left: ScreenName | null; right: ScreenName | null }, isDragging: boolean) {
  const slots = useMemo(() => carouselSlots(nav, neighbors), [nav, neighbors]);
  const visible = useMemo(() => slots.filter((slot) => slot.role === 'drag-curr' || (isDragging && slot.role !== 'drag-hidden')),
    [slots, isDragging]);
  const [visited, setVisited] = useState<ReadonlySet<ScreenName>>(() => new Set(visible.map((slot) => slot.screen)));

  // Retain newly exposed tabs before committing children. The condition is
  // monotonic (at most five additions), so this cannot loop or trigger an
  // extra post-paint effect/render when an animation starts.
  if (visible.some((slot) => !visited.has(slot.screen))) {
    setVisited(new Set([...visited, ...visible.map((slot) => slot.screen)]));
  }

  return slots.map((slot) => ({ ...slot, mounted: visited.has(slot.screen) || visible.includes(slot) }));
}
