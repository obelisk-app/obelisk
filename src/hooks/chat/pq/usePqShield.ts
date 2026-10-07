'use client';

import { useId, useRef, useState, type FocusEvent } from 'react';
import { useDismiss } from '@/hooks/common/useDismiss';

/**
 * The protection shield's panel: open on hover, focus or a tap (the panel
 * holds a link, so touch and keyboard need a real toggle), closed by Escape,
 * a press outside, or focus leaving both the button and the panel.
 */
export function usePqShield() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const panelId = useId();
  // `pointerdown` catches the tap that opened it on a phone as well as a click.
  useDismiss({ refs: [wrapRef], onDismiss: () => setOpen(false), enabled: open, outside: 'pointerdown' });
  return {
    open,
    wrapRef,
    panelId,
    show: () => setOpen(true),
    hide: () => setOpen(false),
    toggle: () => setOpen((v) => !v),
    /** Keep it open while focus is inside the panel, or the guide link can never be reached by keyboard. */
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false);
    },
  };
}
