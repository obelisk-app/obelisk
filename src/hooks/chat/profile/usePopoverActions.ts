'use client';

import { openSettings } from '@/services/settings/open-settings';

/** The profile card's action buttons: each closes the card, then goes where it says. */
export function usePopoverActions(
  pubkey: string,
  onClose: () => void,
  onExplore: (pubkey: string) => void,
  onMessage?: (pubkey: string) => void,
) {
  const thenClose = (fn: () => void) => {
    onClose();
    fn();
  };
  return {
    editProfile: () => thenClose(() => openSettings('profile')),
    openPreferences: () => thenClose(() => openSettings('general')),
    message: () => thenClose(() => onMessage?.(pubkey)),
    explore: () => thenClose(() => onExplore(pubkey)),
  };
}
