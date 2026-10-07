'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useChatStore } from '@/store/chat';
import { useCurrentRelayUrl, useGroupMemberInfo } from '@/services/nostr-bridge';
import { groupMembers } from '@/utils/chat/members/member-groups';
import { presenceActivityKey, useNostrPresence, PRESENCE_WINDOW_MS } from './useNostrPresence';

/**
 * The member list's view model: the channel's members split into online
 * sections by standing and one offline list, watched for presence on the
 * active relay, and whether the offline list is collapsed.
 */
export function useMemberList(groupId: string) {
  const t = useTranslations();
  const memberList = useGroupMemberInfo(groupId);
  const relayUrl = useCurrentRelayUrl();
  const lastActivityAt = useChatStore((state) => state.lastActivityAt);
  const presenceTick = useChatStore((state) => state.presenceTick);
  const rolesByPubkey = useChatStore((state) => state.rolesByPubkey);
  const [offlineCollapsed, setOfflineCollapsed] = useState(false);

  const memberPubkeys = useMemo(() => memberList.map((member) => member.pubkey), [memberList]);
  useNostrPresence(memberPubkeys, relayUrl);

  const onlinePubkeys = useMemo(() => {
    if (!presenceTick) return new Set<string>();
    const cutoff = presenceTick - PRESENCE_WINDOW_MS;
    return new Set(memberPubkeys.filter((pubkey) => (lastActivityAt[presenceActivityKey(relayUrl, pubkey)] ?? 0) >= cutoff));
  }, [lastActivityAt, memberPubkeys, presenceTick, relayUrl]);

  const { onlineGroups, offline } = useMemo(
    () => groupMembers(memberList, onlinePubkeys, rolesByPubkey, { admin: t('chat.members.admin'), member: t('chat.members.member') }),
    [memberList, onlinePubkeys, rolesByPubkey, t],
  );

  return {
    onlineGroups,
    offline,
    offlineCollapsed,
    toggleOffline: () => setOfflineCollapsed((collapsed) => !collapsed),
  };
}
