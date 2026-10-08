'use client';

import { useEffect } from 'react';
import { useConfiguredRelays, useCurrentRelayUrl, useGroups } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { useKeyedValue } from '@/hooks/common/useKeyedValue';
import { useAutoMarkRead } from './useAutoMarkRead';
import { useMentionSeen } from './useMentionSeen';
import { useReadyToSync } from './useReadyToSync';
import { useFaviconBadge } from '@/hooks/notifications/useFaviconBadge';
import { armNotificationPermissionPrompt } from '@/services/notifications/permission-prompt';
import { ensureReadStateAccount } from '@/services/read-state/account-stores';
import { startGroupsRelaySync } from '@/services/read-state/relay-sync';
import { startAccountDmSync } from '@/services/read-state/account-dm-sync';

/** Account persistence first, eager active-relay cursors, deferred cross-relay DM cursors. */
export function useReadStateRuntime(): void {
  const myPubkey = useMyPubkey();
  const relays = useConfiguredRelays();
  const activeRelay = useCurrentRelayUrl();
  const groups = useGroups();
  const readyToSync = useReadyToSync();
  // Metadata edits and ordering changes do not change the sync subscription.
  const ids = groups.map((group) => group.id).sort();
  const groupIds = useKeyedValue(ids, JSON.stringify(ids));

  useEffect(() => {
    if (myPubkey) ensureReadStateAccount(myPubkey);
  }, [myPubkey]);

  useEffect(() => {
    if (myPubkey) return armNotificationPermissionPrompt();
  }, [myPubkey]);

  // Groups stay on the relay being browsed. Start before messages paint,
  // as soon as its groups are known, to avoid flashing unread badges.
  useEffect(() => {
    if (!myPubkey || !activeRelay || groupIds.length === 0) return;
    return startGroupsRelaySync(activeRelay, groupIds);
  }, [myPubkey, activeRelay, groupIds]);

  // The lookup and the resulting subscription have one lifetime. An account
  // or relay switch cancels both; no previous account's relay list is state.
  useEffect(() => {
    if (!readyToSync || !myPubkey) return;
    return startAccountDmSync(myPubkey, relays, activeRelay);
  }, [readyToSync, myPubkey, relays, activeRelay]);

  useAutoMarkRead();
  useMentionSeen();
  useFaviconBadge();
}
