/**
 * Opening a zap for someone from their profile card: the shared zap dialog
 * opens with that person picked.
 */
import { useChatStore } from '@/store/chat';
import { useMessageZapStore } from '@/store/chat/message-zap';

/**
 * Open the amount-and-comment dialog for this person in the current channel. Returns
 * false (and does nothing) when no channel is open to zap in.
 */
export function requestZapPrefill(pubkey: string, displayName: string): boolean {
  const channelId = useChatStore.getState().activeChannelId;
  if (!channelId) return false;
  useMessageZapStore.getState().open({ recipientPubkey: pubkey, displayName, groupId: channelId });
  return true;
}
