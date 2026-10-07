'use client';

import { useEffect, type MouseEvent } from 'react';
import { useChatStore } from '@/store/chat';
import { useDmThread, useDmThreadScroll } from '@/hooks/chat/dm/thread/useDmThread';
import { useDmProtocolChoice } from '@/hooks/shell/dm/useDmProtocolChoice';
import { markDmThreadOpen } from '@/services/shell/panes/dm/active-dm-thread';

/**
 * The desktop DM thread's view model. The conversation itself (order,
 * dividers, post-quantum marks, retry, scroll) is `useDmThread`, shared with
 * the phone's `DmThreadScreen`; this adds the protocol choice, the "this
 * thread is open" mark for the read cursor, and the profile openers.
 */
export function useDmPanel(peer: string | null) {
  const thread = useDmThread(peer);
  const scrollRef = useDmThreadScroll(peer, thread.messages.length);
  const protocolChoice = useDmProtocolChoice(peer);
  useEffect(() => markDmThreadOpen(peer), [peer]);

  return {
    thread,
    scrollRef,
    protocolChoice,
    /** The header: the peer's profile, anchored at the pointer. */
    openPeerProfile: (event: MouseEvent) => {
      if (peer) useChatStore.getState().openProfilePopup(peer, { x: event.clientX, y: event.clientY });
    },
    /** From the thread menu, which has no pointer to anchor to. */
    openProfile: (pubkey: string) => useChatStore.getState().openProfilePopup(pubkey, { x: 0, y: 0 }),
  };
}
