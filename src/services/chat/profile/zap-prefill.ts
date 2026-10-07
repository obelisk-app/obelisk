/**
 * Opening a zap for someone from their profile card: the channel composer
 * listens for the prefill event and opens with that person picked.
 */
import { useChatStore } from '@/store/chat';

/**
 * Ask the open channel's composer to prefill a zap to this person. Returns
 * false (and does nothing) when no channel is open to zap in.
 */
export function requestZapPrefill(pubkey: string, displayName: string): boolean {
  const channelId = useChatStore.getState().activeChannelId;
  if (!channelId) return false;
  window.dispatchEvent(new CustomEvent('obelisk:zap-prefill', { detail: { pubkey, displayName } }));
  return true;
}
