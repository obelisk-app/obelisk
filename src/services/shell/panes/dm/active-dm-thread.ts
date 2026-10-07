import { useDMStore } from '@/store/chat/dm';

/**
 * Mark `peer`'s thread as the one the desktop is showing, so
 * `isUserWatchingDM` knows the person is reading it: without this the read
 * cursor never advances on desktop and unread badges leak in. (The phone
 * shell sets the same field from its navigation state.)
 *
 * Returns the undo for when the panel goes: it clears the mark only while
 * it is still this thread's, so a thread opened since keeps its own.
 */
export function markDmThreadOpen(peer: string | null): () => void {
  useDMStore.setState({ activeDMPubkey: peer });
  return () => {
    if (useDMStore.getState().activeDMPubkey === peer) {
      useDMStore.setState({ activeDMPubkey: null });
    }
  };
}
