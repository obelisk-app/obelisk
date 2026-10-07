'use client';

/** A plus at the icon set's size and stroke; `icons.tsx` has no `PlusIcon` yet. */
export function PlusGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
