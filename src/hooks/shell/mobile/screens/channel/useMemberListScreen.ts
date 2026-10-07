import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  useAdmins,
  useCurrentRelayUrl,
  useGroups,
  useMembers,
  useMembershipReady,
} from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';
import { presenceActivityKey, useNostrPresence, PRESENCE_WINDOW_MS } from '@/hooks/chat/members/useNostrPresence';
import { channelHeaderLabel } from '@/utils/shell/mobile/labels';
import { everyoneIn, isRecentlyActive, nonAdminMembers, rankMemberSections } from '@/utils/shell/mobile/member-sections';

/**
 * The phone member list: the channel header, the admins and the ranked role
 * sections, who is online (re-evaluated on the presence tick, so people fade
 * to offline), and whether membership is still loading.
 */
export function useMemberListScreen(groupId: string) {
  const t = useTranslations();
  const groups = useGroups();
  const relayUrl = useCurrentRelayUrl();
  const group = groups.find((g) => g.id === groupId) ?? null;
  const parentGroup = group?.parent ? groups.find((g) => g.id === group.parent) ?? null : null;
  const admins = useAdmins(groupId);
  const members = useMembers(groupId);
  const membershipReady = useMembershipReady(groupId);
  const memberRoles = useChatStore((s) => s.rolesByPubkey);

  const sections = useMemo(
    () => rankMemberSections(nonAdminMembers(members, admins), memberRoles, t('mobile.members.members')),
    [members, admins, memberRoles, t],
  );
  const allPubkeys = useMemo(() => everyoneIn(admins, members), [admins, members]);
  useNostrPresence(allPubkeys, relayUrl);
  // presenceTick re-renders the list on the offline-fade timer.
  useChatStore((s) => s.presenceTick);
  const lastActivityAt = useChatStore((s) => s.lastActivityAt);

  const isOnline = useCallback(
    (pubkey: string) => isRecentlyActive(lastActivityAt[presenceActivityKey(relayUrl, pubkey)], Date.now(), PRESENCE_WINDOW_MS),
    [lastActivityAt, relayUrl],
  );
  const onlineCount = useMemo(() => allPubkeys.filter(isOnline).length, [allPubkeys, isOnline]);
  const empty = members.length === 0 && admins.length === 0;

  return {
    header: channelHeaderLabel(group, parentGroup, groupId),
    admins,
    sections,
    isOnline,
    onlineCount,
    total: allPubkeys.length,
    loading: empty && !membershipReady,
    empty: empty && membershipReady,
  };
}
