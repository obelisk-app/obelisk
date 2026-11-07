import { useState } from 'react';

export function useRelayDeckPicker(onSelect: (url: string) => void, onAdd?: () => void) {
  const [open, setOpen] = useState(false);
  return {
    open,
    show: () => setOpen(true),
    close: () => setOpen(false),
    select: (url: string) => { setOpen(false); onSelect(url); },
    add: () => { setOpen(false); onAdd?.(); },
  };
}
