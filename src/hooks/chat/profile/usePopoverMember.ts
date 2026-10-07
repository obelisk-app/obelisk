'use client';

import { useMemo } from 'react';
import { displayNameFor } from '@/utils/identity/display-name';
import { useGroupMemberInfo, useUserMetadata } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';

/**
 * Who the popover shows: the active channel's member entry merged with the
 * live kind 0. For arbitrary pubkeys (e.g. the search-bar dropdown) the
 * member list has no entry, so kind 0 alone still fills avatar, name,
 * nip05, about, website, lud16 and banner. Undefined while neither knows
 * anything.
 */
export function usePopoverMember(pubkey: string) {
  const activeGroupId = useChatStore((s) => s.activeChannelId);
  const memberFromList = useGroupMemberInfo(activeGroupId).find((m) => m.pubkey === pubkey);
  const meta = useUserMetadata(pubkey);
  return useMemo(() => {
    if (!memberFromList && !meta) return undefined;
    return {
      pubkey,
      displayName: meta?.displayName ?? meta?.name ?? memberFromList?.displayName ?? displayNameFor(pubkey),
      picture: meta?.picture ?? memberFromList?.picture,
      banner: meta?.banner ?? undefined,
      nip05: meta?.nip05 ?? memberFromList?.nip05,
      about: meta?.about ?? undefined,
      website: meta?.website ?? undefined,
      lud16: meta?.lud16 ?? undefined,
      role: memberFromList?.role,
    };
  }, [memberFromList, meta, pubkey]);
}

export type PopoverMember = NonNullable<ReturnType<typeof usePopoverMember>>;

