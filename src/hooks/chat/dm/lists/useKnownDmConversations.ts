import { useDmLock } from '@/services/nostr-bridge';
import { useMemo } from 'react';
import { useDmOptInEnabled } from '../unlock/useDmOptInEnabled';
import { useDMStore } from '@/store/chat/dm';
import { useDmNotifications } from '@/hooks/notifications/useNotificationSelectors';

/** Saved counterparty metadata plus older notification records, without opening message bodies. */
export function useKnownDmConversations(): Readonly<Record<string, number>> {
  const enabled = useDmOptInEnabled();
  const index = useDMStore((s) => s.conversationIndex);
  const { encryptedMessages } = useDmLock();
  const notifications = useDmNotifications();
  return useMemo(() => {
    if (!enabled) return {};
    const known = { ...index };
    for (const entry of notifications) {
      if (!entry.senderPubkey) continue;
      known[entry.senderPubkey] = Math.max(known[entry.senderPubkey] ?? 0, entry.createdAt / 1000);
    }
    for (const message of encryptedMessages ?? []) {
      if (message.counterparty) known[message.counterparty] ??= message.createdAt ?? 0;
    }
    return known;
  }, [enabled, index, notifications, encryptedMessages]);
}
