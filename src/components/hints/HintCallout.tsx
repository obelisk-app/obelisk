'use client';

/**
 * The hint itself: a small card pinned to the control it explains.
 *
 * Positioning is the same solved problem as `AnchoredMenu` — portal to
 * `document.body`, `position: fixed` measured from the anchor's rect,
 * prefer below and flip above when there's no room, clamp to the viewport,
 * stay invisible until measured so it never flashes in the wrong place.
 * (`fixed` inside the app is not viewport-relative: `.note-card` and other
 * surfaces set `contain: layout paint`, which makes them the containing
 * block. A portal is the only way out of that.)
 *
 * Two deliberate differences from `AnchoredMenu`:
 *
 *  - **Reflow repositions instead of closing.** A dropdown that drifts from
 *    its button is worse than one that shuts, so `AnchoredMenu` closes on
 *    scroll. A hint pinned to a control the reader is scrolling toward has
 *    to follow it instead.
 *  - **Clicking elsewhere does not dismiss.** Ignoring a hint must not count
 *    as reading it — it should still be there next time. The exceptions are
 *    "Got it", Escape, and using the control itself, which are all
 *    deliberate acts.
 *
 * It never blocks the app: no backdrop, no dimming, no `pointer-events`
 * lockout. Someone who wants to keep working can.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n/context';

/** Keeps the card off the viewport edges. */
const MARGIN = 8;
const WIDTH = 264;
/** Breathing room between the card and the control it points at. */
const GAP = 10;

export default function HintCallout({
  anchor,
  title,
  body,
  onDismiss,
  onMuteAll,
}: {
  anchor: HTMLElement;
  title: string;
  body: string;
  onDismiss: () => void;
  onMuteAll: () => void;
}) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);

  const place = useCallback(() => {
    const rect = anchor.getBoundingClientRect();
    const height = cardRef.current?.offsetHeight ?? 0;

    const fitsBelow = rect.bottom + GAP + height < window.innerHeight - MARGIN;
    const top = fitsBelow
      ? rect.bottom + GAP
      : Math.max(MARGIN, rect.top - height - GAP);

    const centred = rect.left + rect.width / 2 - WIDTH / 2;
    const left = Math.max(MARGIN, Math.min(centred, window.innerWidth - WIDTH - MARGIN));

    setPos({ top: Math.max(MARGIN, top), left, below: fitsBelow });
  }, [anchor]);

  useLayoutEffect(() => {
    place();
  }, [place, title, body]);

  useEffect(() => {
    // `true` for the capture phase: the anchor may live inside a scroll
    // container whose scroll events never reach the window.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [place]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/*
        A scrim, because the card is an overlay and used to read as broken
        layout. Anchored under the header it lands squarely on the heading
        below — the first tip sat on "Find people to follow" and clipped the
        pack title under it, so the page looked mis-rendered rather than
        annotated. Dimming what is behind says "this is on top of the page",
        and gives the click-outside dismissal the card otherwise lacked.
      */}
      <div
        className="fixed inset-0 z-[149] bg-black/40"
        onClick={onDismiss}
        aria-hidden="true"
        data-testid="hint-scrim"
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-label={title}
        className="lc-card fixed z-[150] p-3 shadow-2xl shadow-black/50"
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          width: WIDTH,
          visibility: pos ? 'visible' : 'hidden',
        }}
        data-testid="hint-callout"
        data-placement={pos?.below ? 'below' : 'above'}
      >
        <p className="text-sm font-semibold text-lc-white">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-lc-muted">{body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onMuteAll}
            className="rounded-full px-2 py-1 text-[11px] text-lc-muted transition-colors hover:text-lc-white"
            data-testid="hint-mute"
          >
            {t('hints.dismissAll')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            // Focused on mount: Enter closes the thing that just appeared,
            // which is what a keyboard user will try first.
            autoFocus
            className="lc-pill-primary px-4 py-1.5 text-xs"
            data-testid="hint-dismiss"
          >
            {t('hints.gotIt')}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
