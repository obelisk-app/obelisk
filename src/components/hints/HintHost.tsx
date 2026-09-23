'use client';

/**
 * Decides which hint, if any, is showing right now.
 *
 * Mounted once per shell with the surface the user is currently on. It picks
 * the first unseen hint for that surface whose anchor is actually mounted
 * and laid out, shows it, and moves to the next one when that is dismissed —
 * so a screen with three things to say walks through them at the reader's
 * pace and then goes quiet forever.
 *
 * The "anchor must be visible" rule is what keeps this honest. A hint can
 * never point at nothing, which is also how one registry serves both shells
 * and how conditional UI — voice off, no relays yet, DMs not opted into —
 * drops its own steps without anyone maintaining a condition for it.
 *
 * Using a control counts as learning it: a delegated `pointerdown` marks the
 * hint for whatever `[data-tour]` was clicked, so someone who has already
 * found the feed button is never told what the feed button is.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  hintForAnchor,
  hintsForSurface,
  type Shell,
  type SurfaceId,
} from '@/lib/hints/registry';
import { useHintsStore } from '@/store/hints';
import { useTranslation } from '@/i18n/context';
import HintCallout from './HintCallout';

/**
 * Anchors mount asynchronously — a channel list paints after its relay
 * answers, a pane after its width is read. Re-look on a short interval
 * rather than once, and give up quietly if it never appears.
 */
const LOOKUP_INTERVAL_MS = 400;
const LOOKUP_ATTEMPTS = 6;

export default function HintHost({
  surface,
  shell,
}: {
  surface: SurfaceId | null;
  shell: Shell;
}) {
  const { t } = useTranslation();
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
      const target = (event.target as HTMLElement | null)?.closest?.('[data-tour]');
      const anchor = target?.getAttribute('data-tour');
      if (!anchor) return;
      const hint = hintForAnchor(anchor);
      if (hint) markSeen(hint.id);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [markSeen, muted]);

  // Resolve the anchor, retrying while the surface finishes painting.
  useEffect(() => {
    if (!next) return;

    let attempts = 0;
    const look = () => {
      const found = document.querySelector<HTMLElement>(`[data-tour="${next.anchor}"]`);
      // `offsetParent === null` catches `display: none` and the responsive
      // variants that hide a control on one shell but not the other.
      if (found && found.offsetParent !== null) {
        setResolved({ id: next.id, el: found });
        return true;
      }
      return false;
    };

    if (look()) return;
    const timer = setInterval(() => {
      attempts += 1;
      if (look() || attempts >= LOOKUP_ATTEMPTS) clearInterval(timer);
    }, LOOKUP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [next]);

  const dismiss = useCallback(() => {
    if (next) markSeen(next.id);
  }, [next, markSeen]);

  // Only trust an anchor that was resolved for the hint we're about to show.
  const anchorEl = next && resolved?.id === next.id ? resolved.el : null;
  if (!next || !anchorEl) return null;

  return (
    <HintCallout
      anchor={anchorEl}
      title={t(next.titleKey)}
      body={t(next.bodyKey)}
      onDismiss={dismiss}
      onMuteAll={muteHints}
    />
  );
}
