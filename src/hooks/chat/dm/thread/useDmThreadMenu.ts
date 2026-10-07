'use client';

import { useRef, useState } from 'react';
import { useCopyToClipboard } from '@/hooks/common/useCopyToClipboard';
import { useModerationStore } from '@/store/moderation';
import { safeNpub } from '@/utils/identity/short-npub';

/**
 * The ⋯ menu in a DM thread header: open or closed, copy the peer's npub,
 * open their profile, and the per-device mute and block toggles
 * (`useModerationStore`). Each action closes the menu.
 */
export function useDmThreadMenu(peer: string, onOpenProfile?: (pubkey: string) => void) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Flash "Copied!", then close: the menu staying open after a copy reads
  // as the click not having registered.
  const { copied, copy } = useCopyToClipboard({ onReset: () => setOpen(false) });
  const muted = useModerationStore((s) => s.mutedPubkeys.includes(peer));
  const blocked = useModerationStore((s) => s.blockedPubkeys.includes(peer));
  const toggleMute = useModerationStore((s) => s.toggleMute);
  const toggleBlock = useModerationStore((s) => s.toggleBlock);

  return {
    open,
    triggerRef,
    copied: Boolean(copied),
    muted,
    blocked,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
    openProfile: () => {
      setOpen(false);
      onOpenProfile?.(peer);
    },
    copyNpub: () => void copy(safeNpub(peer)),
    toggleMute: () => {
      toggleMute(peer);
      setOpen(false);
    },
    toggleBlock: () => {
      toggleBlock(peer);
      setOpen(false);
    },
  };
}
