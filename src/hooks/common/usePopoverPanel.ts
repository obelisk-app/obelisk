'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useAnchoredPosition, type PopoverFollow } from '@/hooks/common/useAnchoredPosition';
import { useDismiss } from '@/hooks/common/useDismiss';
import type { PopoverAlign, PopoverSide } from '@/utils/layout/popover-position';

export interface PopoverPanelOptions {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
  follow: PopoverFollow;
  prefer: PopoverSide;
  align: PopoverAlign;
  /** False when the host already handles dismissal. */
  dismissOutside: boolean;
  /** The host's handle on the panel, set while it is open. */
  externalRef?: RefObject<HTMLDivElement | null>;
}

/**
 * The PopoverPanel's view model: its position beside the anchor, dismissal
 * on an outside press or Escape, and the host's ref kept pointing at the
 * panel while it is open.
 */
export function usePopoverPanel({ anchorRef, onClose, open, follow, prefer, align, dismissOutside, externalRef }: PopoverPanelOptions) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPosition({ anchorRef, panelRef, open, onClose, prefer, align, follow });
  useDismiss({
    refs: [panelRef, anchorRef],
    onDismiss: onClose,
    enabled: open && dismissOutside,
  });

  useLayoutEffect(() => {
    if (!externalRef) return;
    externalRef.current = open ? panelRef.current : null;
    return () => { externalRef.current = null; };
  }, [externalRef, open]);

  return { panelRef, pos };
}
