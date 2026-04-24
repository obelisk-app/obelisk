'use client';

import { useEffect, type MutableRefObject } from 'react';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';
import { subscribeBroadcast } from '@/lib/notification-broadcast';

/**
 * Same-browser multi-tab sync: mirror clear events posted by sibling tabs
 * into this tab's notification + DM store. (scenario 11, same browser.)
 * Cross-device sync is handled by the Socket.io read-update events.
 */
export function useBroadcastSync(profilePubkeyRef: MutableRefObject<string | null>) {
  useEffect(() => {
    const unsub = subscribeBroadcast((msg) => {
      // Pubkey scope: drop any clear from a sibling tab logged in as a
      // different user, so cross-account tab switches don't leak reads.
      const myPk = profilePubkeyRef.current;
      if (!myPk || msg.senderPubkey !== myPk) return;
      if (msg.kind === 'clear-channel') {
        useNotificationStore.getState().clearChannelUnread(msg.channelId);
      } else if (msg.kind === 'clear-dm') {
        useNotificationStore.getState().clearDMUnread(msg.pubkey);
        useDMStore.getState().updateThread(msg.pubkey, { unreadCount: 0 });
      }
    });
    return unsub;
  }, []);
}
