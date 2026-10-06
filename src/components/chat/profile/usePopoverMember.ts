'use client';

import { useMemo } from 'react';
import { displayNameFor } from '@/utils/identity/display-name';
import { useGroupMemberInfo, useUserMetadata } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';

/** Colour per base role; the label is a key, resolved at render. */
export const BASE_ROLE: Record<string, { key: string; color: string }> = {
  owner: { key: 'roles.base.owner', color: '#f59e0b' },
  admin: { key: 'roles.base.admin', color: '#ef4444' },
  mod: { key: 'roles.base.mod', color: '#3b82f6' },
  member: { key: 'roles.base.member', color: '#737373' },
};


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

/** `https://` in front of a bare website, so the link leaves the app. */
export function websiteHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}
