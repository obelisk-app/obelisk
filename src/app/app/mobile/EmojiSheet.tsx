'use client';

import type { ReactNode } from 'react';

/**
 * The mobile emoji / media picker sheet: a dimmed host that closes on a tap
 * outside, the scrolling sheet and its handle (`.emoji-sheet-host` in
 * mobile-shell.css). The picker inside is the caller's.
 */
export default function EmojiSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="emoji-sheet-host" onClick={onClose}>
      <div className="emoji-sheet native-scroll-y" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  );
}
