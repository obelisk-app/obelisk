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
 */

import { useCallback, useEffect, useRef } from 'react';

const MARKER = 'obelisk:overlay';

export function useHistoryDismiss(open: boolean, onClose: () => void): () => void {
  // Whether *this* overlay owns a history entry, so we only ever consume one
  // we pushed. Popping someone else's would navigate the app.
  const pushed = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!open) {
      pushed.current = false;
      return;
    }

    window.history.pushState({ [MARKER]: true }, '');
    pushed.current = true;

    const onPop = () => {
      // The entry is already gone by the time this fires, so don't try to
      // consume it again on the way out.
      pushed.current = false;
      onCloseRef.current();
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);

  /** Close from the UI, consuming the history entry we pushed. */
  return useCallback(() => {
    if (pushed.current && typeof window !== 'undefined') {
      pushed.current = false;
      // `onClose` runs from the popstate handler, so don't call it twice.
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, []);
}
