import { useCallback, useEffect, useState } from 'react';
import { hintsForSurface, type Shell, type SurfaceId } from '@/utils/hints/registry';
import { findHintAnchor, hintTaughtBy } from '@/utils/hints/anchors';
import { useHintsStore } from '@/store/hints';

/**
 * Anchors mount asynchronously: a channel list paints after its relay
 * answers, a pane after its width is read. Re-look on a short interval
 * rather than once, and give up quietly if it never appears.
 */
export const HINT_LOOKUP_INTERVAL_MS = 400;
export const HINT_LOOKUP_ATTEMPTS = 6;

/**
 * The hint host's view model: the first unseen hint for the surface whose
 * anchor is on screen, the handlers that retire it, and the one delegated
 * `pointerdown` listener that counts using a control as learning it
 * (docs/conventions.md#component-files).
 */
export function useHintHost(surface: SurfaceId | null, shell: Shell) {
  const seen = useHintsStore((state) => state.seen);
  const muted = useHintsStore((state) => state.muted);
  const markSeen = useHintsStore((state) => state.markSeen);
  const muteHints = useHintsStore((state) => state.muteHints);
  // Keyed by hint id rather than cleared on change: resetting state inside
  // the lookup effect would render one frame with the previous hint's
  // anchor, which is a card pointing at the wrong control.
  const [resolved, setResolved] = useState<{ id: string; el: HTMLElement } | null>(null);

  // The next thing to explain here: first unseen hint for this surface.
  const next = surface && !muted
    ? hintsForSurface(surface, shell).find((hint) => !seen.includes(hint.id))
    : undefined;

  // Using a control teaches it. One listener for every anchor in the app.
  useEffect(() => {
    if (muted) return;
    const onDown = (event: PointerEvent) => {
      const id = hintTaughtBy(event.target);
      if (id) markSeen(id);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [markSeen, muted]);

  // Resolve the anchor, retrying while the surface finishes painting.
  useEffect(() => {
    if (!next) return;

    let attempts = 0;
    const look = () => {
      const found = findHintAnchor(next.anchor);
      if (found) setResolved({ id: next.id, el: found });
      return !!found;
    };

    if (look()) return;
    const timer = setInterval(() => {
      attempts += 1;
      if (look() || attempts >= HINT_LOOKUP_ATTEMPTS) clearInterval(timer);
    }, HINT_LOOKUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [next]);

  const dismiss = useCallback(() => {
    if (next) markSeen(next.id);
  }, [next, markSeen]);

  // Only trust an anchor that was resolved for the hint about to show.
  const anchorEl = next && resolved?.id === next.id ? resolved.el : null;
  return { hint: anchorEl ? next : undefined, anchorEl, dismiss, muteAll: muteHints };
}
