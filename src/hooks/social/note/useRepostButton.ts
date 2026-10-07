import { useState } from 'react';

/**
 * The repost button's menu: open state, and the two choices, each of which
 * closes the menu before acting.
 */
export function useRepostButton({ onRepost, onQuote }: { onRepost: () => void; onQuote?: () => void }) {
  const [open, setOpen] = useState(false);
  return {
    open,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
    repost: () => {
      setOpen(false);
      onRepost();
    },
    quote: () => {
      setOpen(false);
      onQuote?.();
    },
  };
}
