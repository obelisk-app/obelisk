'use client';

import { useRef, useState } from 'react';
import { useDismiss } from '@/hooks/common/useDismiss';

/**
 * Open/closed state for one message row's overlays: the ⋯ menu, the pinned
 * toolbar, the emoji picker and the forward dialog, plus the outside-click
 * and Escape handling that closes the first three.
 */
export function useMessageRowMenus() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelPinned, setPanelPinned] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // The ⋯ menu and the picker render in portals (`FloatingPanel`) so they
  // can't be clipped by, or scroll away inside, the message list.
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const pickerPanelRef = useRef<HTMLDivElement | null>(null);
  const closeAll = () => { setMenuOpen(false); setPanelPinned(false); setPickerOpen(false); };
  useDismiss({
    refs: [menuRef, menuPanelRef, pickerPanelRef],
    enabled: menuOpen || panelPinned || pickerOpen,
    onDismiss: closeAll,
  });

  return {
    menuOpen, setMenuOpen,
    panelPinned, setPanelPinned,
    pickerOpen, setPickerOpen,
    forwarding, setForwarding,
    menuRef, moreBtnRef, menuPanelRef, pickerPanelRef,
    closeAll,
    /** Open the emoji picker, pinning the toolbar under it. */
    openPicker: () => { setMenuOpen(false); setPickerOpen(true); setPanelPinned(true); },
    /** The toolbar's picker button toggles it. */
    togglePicker: () => { setPickerOpen((v) => !v); setPanelPinned(true); setMenuOpen(false); },
    toggleMenu: () => { setMenuOpen((v) => !v); setPickerOpen(false); },
    togglePinned: () => setPanelPinned((v) => !v),
  };
}

export type MessageRowMenus = ReturnType<typeof useMessageRowMenus>;
