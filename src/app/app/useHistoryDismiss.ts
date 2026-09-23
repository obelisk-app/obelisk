'use client';

/**
 * Make an overlay dismissable with the browser/OS back gesture.
 *
 * Desktop panes and modals are invisible to history by default, so back goes
 * somewhere else entirely — on a phone that means a swipe-back leaves the app
 * instead of closing the thing you just opened, which reads as the app losing
 * your place.
 *
 * Pushing one entry when the overlay opens makes back close it. Closing from
 * the UI calls `history.back()` so the entry is consumed rather than left
 * behind — otherwise back would appear to do nothing once for each overlay
 * the user had already dismissed.
 *
 * Overlays that stack pass a DEPTH rather than a boolean. The reader is one:
 * opening a note from inside a thread is a new level, and back should return
 * to the thread you came from rather than dumping you back in the feed —
 * which is what a single entry for the whole pane did, because every level
 * after the first was invisible to history. One entry per level keeps the
 * back gesture, the swipe and the header button all saying the same thing.
 */

import { useCallback, useEffect, useRef } from 'react';

const MARKER = 'obelisk:overlay';

export function useHistoryDismiss(
  /** `true`/`false`, or how many levels deep a stacking overlay is. */
  open: boolean | number,
  /** Pop one level. For a boolean overlay, close it. */
  onClose: () => void,
): () => void {
  const level = typeof open === 'number' ? Math.max(0, Math.trunc(open)) : (open ? 1 : 0);

  // How many entries *this* overlay owns, so we only ever consume ones we
  // pushed. Popping someone else's would navigate the app.
  const pushed = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (level === 0) {
      pushed.current = 0;
      return;
    }

    // Deeper than history knows about: one entry per new level.
    while (pushed.current < level) {
      window.history.pushState({ [MARKER]: true }, '');
      pushed.current += 1;
    }

    const onPop = () => {
      // The entry is already gone by the time this fires, so don't try to
      // consume it again on the way out.
      pushed.current = Math.max(0, pushed.current - 1);
      onCloseRef.current();
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [level]);

  /** Go back one level from the UI, consuming an entry we pushed. */
  return useCallback(() => {
    if (pushed.current > 0 && typeof window !== 'undefined') {
      // `onClose` runs from the popstate handler, so don't call it twice.
      // `pushed` is decremented there, not here.
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, []);
}
