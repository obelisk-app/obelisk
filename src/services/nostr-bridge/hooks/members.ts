/**
 * Membership hooks: per-channel admins and members, relay-wide people with
 * their profiles, and the "membership evidence has arrived" flag.
 */
import { useMemo } from 'react';
import { displayNameFor } from '@/utils/identity/display-name';
import type { JsUserMetadata } from '../common/types';
import { useSubscription } from './subscription';
import { useGroups, useGroupCreators } from './groups';
import { relayMentionCandidates } from '@/utils/message-text/mentions';

export function useMembershipReady(groupId: string | null): boolean {
  return useSubscription(
    (b, cb) => (groupId ? b.subscribeMembershipReady(groupId, cb) : () => {}),
    false,
    [groupId],
  );
}

export function useAdmins(groupId: string | null): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>(
    (b, cb) => (groupId ? b.subscribeAdmins(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useAdminsByGroup(enabled = true): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription((b, cb) => b.subscribeAdminsByGroup(cb), {}, [], enabled);
}

export function useMembers(groupId: string | null): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>(
    (b, cb) => (groupId ? b.subscribeMembers(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useMembersByGroup(enabled = true): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription((b, cb) => b.subscribeMembersByGroup(cb), {}, [], enabled);
}

export interface JsMemberInfo {
  pubkey: string;
  displayName: string;
  picture?: string;
  nip05?: string;
  role: 'admin' | 'member';
}

/**
 * Known people on accessible active-relay channels: members, admins and
 * creators, with profile metadata attached and sorted by display name.
 *
 * Admin surfaces that hand something to a person (roles, moderation) need to
 * offer a search over names, demanding a pasted pubkey is not a UI. `role` is
 * `admin` when the pubkey administers any visible channel, or only `groupId`
 * when supplied. Membership controls continue to use channel-specific lists.
 */
export function useRelayPeople(groupId?: string, enabled = true): ReadonlyArray<JsMemberInfo> {
  const groups = useGroups(enabled);
  const creators = useGroupCreators(enabled);
  const adminsByGroup = useAdminsByGroup(enabled);
  const membersByGroup = useMembersByGroup(enabled);
  const admins = useMemo(
    () => new Set(groups.flatMap((group) => groupId && group.id !== groupId ? [] : [...(adminsByGroup[group.id] ?? [])])),
    [groups, adminsByGroup, groupId],
  );
  const pubkeys = useMemo(
    () => relayMentionCandidates(groups.map((group) => group.id), membersByGroup, adminsByGroup, creators),
    [groups, membersByGroup, adminsByGroup, creators],
  );
  const key = pubkeys.join(',');
  const metadata = useSubscription<Readonly<Record<string, JsUserMetadata>>>(
    (bridge, cb) => {
      pubkeys.forEach((pubkey) => void bridge.ensureUserMetadata(pubkey));
      return bridge.subscribeUserMetadataMap(cb);
    },
    {},
    [key],
    enabled,
  );
  return useMemo(() => pubkeys
    .map((pubkey) => {
      const meta = metadata[pubkey];
      return {
        pubkey,
        displayName: displayNameFor(pubkey, meta),
        ...(meta?.picture ? { picture: meta.picture } : {}),
        ...(meta?.nip05 ? { nip05: meta.nip05 } : {}),
        role: admins.has(pubkey) ? 'admin' as const : 'member' as const,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [pubkeys, metadata, admins]);
}

export function useGroupMemberInfo(groupId: string | null): ReadonlyArray<JsMemberInfo> {
  const admins = useAdmins(groupId);
  const members = useMembers(groupId);
  const pubkeys = useMemo(() => Array.from(new Set([...admins, ...members])), [admins, members]);
  const key = pubkeys.join(',');
  const metadata = useSubscription<Readonly<Record<string, JsUserMetadata>>>(
    (bridge, cb) => {
      pubkeys.forEach((pubkey) => void bridge.ensureUserMetadata(pubkey));
      return bridge.subscribeUserMetadataMap(cb);
    },
    {},
    [key],
  );
  const adminSet = useMemo(() => new Set(admins), [admins]);
  return useMemo(() => pubkeys.map((pubkey) => {
    const meta = metadata[pubkey];
    return {
      pubkey,
      displayName: displayNameFor(pubkey, meta),
      ...(meta?.picture ? { picture: meta.picture } : {}),
      ...(meta?.nip05 ? { nip05: meta.nip05 } : {}),
      role: adminSet.has(pubkey) ? 'admin' : 'member',
    };
  }), [pubkeys, metadata, adminSet]);
}
