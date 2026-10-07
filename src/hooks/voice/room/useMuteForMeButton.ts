import type { MouseEvent } from 'react';
import { useVoiceStore } from '@/store/voice';

/**
 * Mute-for-me on one tile: whether this person is muted locally, and the
 * toggle. The click stops at the button so it never reaches the tile's pin
 * handler behind it.
 */
export function useMuteForMeButton(pubkey: string) {
  const muted = useVoiceStore((s) => !!s.localMutedPubkeys[pubkey]);
  const muteLocally = useVoiceStore((s) => s.muteLocally);
  const unmuteLocally = useVoiceStore((s) => s.unmuteLocally);
  return {
    muted,
    toggle: (e: MouseEvent) => {
      e.stopPropagation();
      if (muted) unmuteLocally(pubkey);
      else muteLocally(pubkey);
    },
  };
}
