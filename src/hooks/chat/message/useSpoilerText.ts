'use client';

import { useState, type KeyboardEvent } from 'react';

/** A spoiler: hidden until clicked, or Enter / Space while focused. */
export function useSpoilerText() {
  const [revealed, setRevealed] = useState(false);
  return {
    revealed,
    reveal: () => setRevealed(true),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') setRevealed(true);
    },
  };
}
