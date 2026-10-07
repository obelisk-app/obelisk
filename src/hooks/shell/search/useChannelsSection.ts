'use client';

import type { JsGroup } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';

/** The search dropdown's channels: the first ten matches, and opening one through the shell. */
export function useChannelsSection(matches: ReadonlyArray<JsGroup>, onClose: () => void) {
  return {
    shown: matches.slice(0, 10),
    pick: (g: JsGroup) => {
      // The bridge's active-group call only moves the relay subscription; the
      // shell decides what's rendered, so calling it from here left the user
      // staring at the channel they were already in. Go through the shell.
      useChatStore.getState().requestJump(g.id);
      onClose();
    },
  };
}
