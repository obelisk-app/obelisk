/**
 * Membership hooks: per-channel admins and members, relay-wide people with
 * their profiles, and the "membership evidence has arrived" flag.
 */
import { useMemo } from 'react';
import { displayNameFor } from '@/utils/identity/display-name';
import type { JsUserMetadata } from '../types';
import { useSubscription } from './subscription';

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

export function useAdminsByGroup(): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription((b, cb) => b.subscribeAdminsByGroup(cb), {});
}

export function useMembers(groupId: string | null): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>(
    (b, cb) => (groupId ? b.subscribeMembers(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useMembersByGroup(): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription((b, cb) => b.subscribeMembersByGroup(cb), {});
}

export interface JsMemberInfo {
  pubkey: string;
  displayName: string;
  picture?: string;
  nip05?: string;
  role: 'admin' | 'member';
}

/**
 * Everyone the active relay knows about: the union of every channel's admin and
 * member lists, with profile metadata attached and sorted by display name.
 *
 * Admin surfaces that hand something to a person (roles, moderation) need to
 * offer a search over names, demanding a pasted pubkey is not a UI. `role` is
 * `admin` when the pubkey administers *any* channel on the relay.
 */
export function useRelayPeople(): ReadonlyArray<JsMemberInfo> {
  const adminsByGroup = useAdminsByGroup();
  const membersByGroup = useMembersByGroup();
  const admins = useMemo(
    () => new Set(Object.values(adminsByGroup).flatMap((list) => [...list])),
    [adminsByGroup],
  );
  const pubkeys = useMemo(() => {
    const all = new Set<string>(admins);
    for (const list of Object.values(membersByGroup)) for (const pubkey of list) all.add(pubkey);
    return Array.from(all);
  }, [admins, membersByGroup]);
  const key = pubkeys.join(',');
  const metadata = useSubscription<Readonly<Record<string, JsUserMetadata>>>(
    (bridge, cb) => {
      pubkeys.forEach((pubkey) => void bridge.ensureUserMetadata(pubkey));
      return bridge.subscribeUserMetadataMap(cb);
    },
    {},
    [key],
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
