import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';
import { extractMentionPubkeys } from '@/lib/mentions';

/**
 * Single source of truth for "is the user actively watching this channel
 * right now?" — used both by `useReadTracker` (to decide when to mark-read)
 * and by the `new-message` socket handler (to decide whether an arriving
 * message should bump the unread counter for an already-active channel).
 *
 * All four gates must be true:
 *   - tab is visible (`document.visibilityState === 'visible'`)
 *   - window has focus (`document.hasFocus()`)
 *   - the active channel in the chat store equals the target channel
 *   - the message list is scrolled within ~150px of the bottom
 *
 * If any gate is false, the channel is "not being watched" and an arriving
 * message should badge it until the user actually reads it.
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
 * DM variant. DMs have no "scrolled to bottom" concept in the current store,
 * so the gate is just visible + focused + the thread is the active DM.
 */
export function isUserWatchingDM(targetPubkey: string): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  if (!document.hasFocus()) return false;
  const dm = useDMStore.getState();
  if (dm.activeDMPubkey !== targetPubkey) return false;
  return true;
}

/**
 * Handle an incoming DM event.
 *
 * Bridges the DM store increment into the notification store so the favicon
 * + title unread total (`useFaviconBadge`) reflects DMs. Without this, DMs
 * only bump the sidebar count inside the DM panel and never contribute to
 * the browser-tab badge (scenario 10 was broken).
 *
 * Returns the new unread count (0 when own message or actively watching).
 * The caller is still responsible for updating the DM store's thread entry.
 */
export function handleIncomingDM(
  otherPubkey: string,
  isOwnMessage: boolean,
  currentUnread: number,
): { nextUnread: number; badged: boolean } {
  if (isOwnMessage) return { nextUnread: currentUnread, badged: false };
  if (isUserWatchingDM(otherPubkey)) return { nextUnread: currentUnread, badged: false };

  const nextUnread = currentUnread + 1;
  useNotificationStore.getState().setDMUnread(otherPubkey, nextUnread);
  return { nextUnread, badged: true };
}

/**
 * Handle an incoming channel message from a Socket.io `new-message` event.
 *
 * Increments the unread counter (and sets the mention flag) when the message
 * targets a channel the user is NOT actively watching. Returns the outcome
 * so callers can layer additional side-effects (e.g. browser notifications).
 *
 * Extracted from `src/app/chat/page.tsx` so it can be unit-tested without
 * mounting the whole chat page. The server's `unread-update` loop skips
 * sockets that are in the channel room, so this client-side path is the
 * ONLY code that covers the "channel is open on this tab but the user is
 * backgrounded / blurred / scrolled up" case.
 */
export function handleIncomingChannelMessage(
  message: { channelId: string; authorPubkey: string; content: string },
  ownPubkey: string | null,
): { incremented: boolean; hasMention: boolean } {
  if (!ownPubkey) return { incremented: false, hasMention: false };
  if (message.authorPubkey === ownPubkey) return { incremented: false, hasMention: false };
  if (isUserWatchingChannel(message.channelId)) return { incremented: false, hasMention: false };

  const hasMention = extractMentionPubkeys(message.content).includes(ownPubkey);
  useNotificationStore.getState().incrementChannelUnread(message.channelId, hasMention);
  return { incremented: true, hasMention };
}
