import type { BridgeImpl } from '@/services/nostr-bridge';
import { useChatStore, type MentionJump } from '@/store/chat';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import type { DeepLinkRelayOutcome } from '@/services/relay/deep-link';
import { useToastStore } from '@/store/feedback/toast';
import { translate } from '@/i18n/runtime';

/** Serialize relay switches. A newer click replaces the destination after any in-flight switch. */
export function watchMentionNavigation(deps: {
  awaitBridge: () => Promise<BridgeImpl>;
  switchRelay: (relay: string) => Promise<DeepLinkRelayOutcome>;
}): () => void {
  let disposed = false;
  let running = false;
  const current = (target: MentionJump) => !disposed && useChatStore.getState().mentionJump === target;
  const drain = async () => {
    if (running || disposed) return;
    running = true;
    try {
      while (!disposed) {
        const target = useChatStore.getState().mentionJump;
        if (!target) break;
        try {
          const bridge = await deps.awaitBridge();
          if (!current(target)) continue;
          const outcome = await deps.switchRelay(target.relay);
          if (!current(target)) continue;
          if (outcome === 'declined') { useChatStore.setState({ mentionJump: null }); continue; }
          if (outcome === 'failed') throw new Error('relay switch failed');
          const onRelay = () => current(target) && normalizeRelayUrl(bridge.currentRelayUrl.get()) === normalizeRelayUrl(target.relay);
          if (!onRelay()) throw new Error('relay changed');
          if (!bridge.groups.get().some(g => g.id === target.channelId)) await bridge.fetchGroupMetadata(target.channelId);
          if (!current(target)) continue;
          if (!onRelay()) throw new Error('relay changed');
          if (!bridge.groups.get().some(g => g.id === target.channelId)) throw new Error('channel unavailable');
          const found = await bridge.ensureGroupMessage(target.channelId, target.id);
          if (!current(target)) continue;
          if (!onRelay()) throw new Error('relay changed');
          if (!found) throw new Error('message unavailable');
          useChatStore.setState({
            pendingJump: { groupId: target.channelId, messageId: target.id },
            mentionJump: null,
          });
        } catch {
          if (!current(target)) continue;
          useToastStore.getState().pushToast({ title: translate('common.notificationUnavailable'), body: '' });
          useChatStore.setState({ mentionJump: null });
        }
      }
    } finally { running = false; }
  };
  const unsubscribe = useChatStore.subscribe(() => { void drain(); });
  void drain();
  return () => { disposed = true; unsubscribe(); };
}
