'use client';

import { useState, type ReactNode } from 'react';

export default function SpoilerText({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setRevealed(true); }}
      className={`rounded px-0.5 cursor-pointer transition-all duration-200 ${
        revealed
          ? 'bg-lc-border/50 text-lc-white'
          : 'bg-lc-muted/60 text-transparent select-none'
      }`}
      data-testid="spoiler-text"
      aria-label={revealed ? undefined : 'Spoiler — click to reveal'}
    >
      {children}
    </span>
  );
}
