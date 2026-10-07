'use client';

/** The `@everyone` broadcast, as a chip in message text. */
export function EveryoneChip() {
  return (
    <span
      className="bg-lc-green/20 text-lc-green rounded px-1 py-0.5 text-sm font-semibold"
      data-testid="everyone-mention"
    >
      @everyone
    </span>
  );
}
