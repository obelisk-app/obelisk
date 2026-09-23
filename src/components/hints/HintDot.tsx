'use client';

/**
 * The "there's something here" marker on a control you haven't met yet.
 *
 * Deliberately the same shape and colour as the unread badges the rail and
 * the bottom nav already use, so it reads as existing vocabulary rather than
 * as tour chrome — a nudge you can ignore, not an instruction.
 *
 * It disappears when the hint is seen, which includes simply *using* the
 * control: someone who has already clicked the feed button does not need to
 * be told what the feed button is.
 */

import { useHintsStore } from '@/store/hints';

export default function HintDot({ hintId }: { hintId: string }) {
  const seen = useHintsStore((state) => state.seen.includes(hintId));
  const muted = useHintsStore((state) => state.muted);
  if (seen || muted) return null;

  return (
    <span
      // Purely decorative: the callout beside it carries the actual message,
      // and a screen reader announcing "dot" on every control is noise.
      aria-hidden="true"
      // `pointer-events-none` so it can never eat the click on the control
      // it is sitting on top of.
      className="hint-dot pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-lc-green ring-2 ring-lc-black"
      data-testid="hint-dot"
      data-hint={hintId}
    />
  );
}
