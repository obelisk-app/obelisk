'use client';

import { useUserMetadata } from '@/services/nostr-bridge';
import { useModerationStore } from '@/store/moderation';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import type { ModerationKind } from '@/utils/settings/moderation-entries';

/** One muted or blocked person: their name (or short npub), picture, and the undo. */
export function useModerationRow(pubkey: string, kind: ModerationKind) {
  const meta = useUserMetadata(pubkey);
  const toggleMute = useModerationStore((state) => state.toggleMute);
  const toggleBlock = useModerationStore((state) => state.toggleBlock);
  const undo = () => {
    if (kind === 'mute') toggleMute(pubkey);
    else toggleBlock(pubkey);
  };
  return {
    name: meta?.displayName || meta?.name || shortNpubLabel(pubkey),
    picture: meta?.picture,
    undo,
  };
}
