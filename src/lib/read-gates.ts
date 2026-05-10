import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';

/**
 * "Is the user actively watching this channel right now?"
 *
 * All four gates must be true:
 *   - tab is visible (`document.visibilityState === 'visible'`)
 *   - window has focus (`document.hasFocus()`)
 *   - the active channel in the chat store equals the target channel
 *   - the message list is scrolled within ~150px of the bottom
 *
 * Used by `useAutoMarkRead` to decide when to advance the persisted read
 * cursor, and by `useFaviconBadge` to decide whether to subtract the active
 * channel from the unread total.
 */
export function isUserWatchingChannel(targetChannelId: string): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  if (!document.hasFocus()) return false;
  const chat = useChatStore.getState();
  if (chat.activeChannelId !== targetChannelId) return false;
  if (!chat.isNearBottom) return false;
  return true;
}

/**
 * DM variant. DMs have no "scrolled to bottom" concept in the current
 * store, so the gate is just visible + focused + the thread is the active
 * DM.
 */
export function isUserWatchingDM(targetPubkey: string): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  if (!document.hasFocus()) return false;
  const dm = useDMStore.getState();
  if (dm.activeDMPubkey !== targetPubkey) return false;
  return true;
}
