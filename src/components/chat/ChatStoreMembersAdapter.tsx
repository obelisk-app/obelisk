'use client';

import { useEffect, useMemo } from 'react';
import { useProfile } from '@nostr-wot/data/react';
import { useAdmins, useMembers } from '@/lib/nostr-bridge';
import { useChatStore } from '@/store/chat';
import type { MemberInfo } from '@/lib/mentions';

/**
 * Mirrors the bridge's relay-published admin/member lists for `groupId` into
 * `chatStore.memberList`. Renders one {@link MemberMetaSync} per pubkey so
 * kind:0 profile metadata also flows back into the list — both for the
 * MemberList renderer (avatar + display name) and for inline @mention chips
 * in messages, which read `memberList[].displayName` via
 * `preprocessForMarkdown`.
 */
export default function ChatStoreMembersAdapter({ groupId }: { groupId: string }) {
  const admins = useAdmins(groupId);
  const members = useMembers(groupId);
  const setMemberList = useChatStore((s) => s.setMemberList);
  const setOnlinePubkeys = useChatStore((s) => s.setOnlinePubkeys);

  const allPubkeys = useMemo(() => {
    const set = new Set<string>([...admins, ...members]);
    return Array.from(set);
  }, [admins, members]);

  const adminSet = useMemo(() => new Set(admins), [admins]);

  // Seed/refresh the list when admin or member sets change. Preserve any
  // metadata (displayName/picture/nip05/customRoles) already attached to a
  // row — without this, every relay-driven update to admins/members (e.g. a
  // fresh 39001/39002 after NIP-42 AUTH) wipes every row back to
  // `pubkey.slice(0,10)` with no picture.
  useEffect(() => {
    const prev = useChatStore.getState().memberList;
    const prevByPk = new Map(prev.map((m) => [m.pubkey, m]));
    const list: MemberInfo[] = allPubkeys.map((pubkey) => {
      const role = adminSet.has(pubkey) ? 'admin' : 'member';
      const existing = prevByPk.get(pubkey);
      if (existing) return { ...existing, role };
      return { pubkey, displayName: pubkey.slice(0, 10), role };
    });
    setMemberList(list);
    setOnlinePubkeys(allPubkeys);
  }, [allPubkeys, adminSet, setMemberList, setOnlinePubkeys]);

  return (
    <>
      {allPubkeys.map((pk) => (
        <MemberMetaSync key={pk} pubkey={pk} />
      ))}
    </>
  );
}

/**
 * Per-pubkey kind:0 subscriber that mirrors profile metadata into the matching
 * `memberList` row.
 *
 * `rowExists` is intentionally part of the deps. React fires child effects
 * before parent effects in the same commit, so when `useProfile` resolves
 * synchronously from cache (the common revisit case where chat has already
 * primed the profile store), this child's mount-effect runs BEFORE the
 * parent's `setMemberList` has appended the row — `findIndex` returns -1, the
 * update is a no-op, and nothing re-fires the effect. Watching for the row to
 * appear closes that gap: when the parent finally commits, the selector flips
 * to `true`, the effect re-runs with the same cached `meta`, and the row gets
 * its display name and picture. Without this, members render as
 * `pubkey.slice(0,10)` in the member list and in inline @mention chips
 * forever, even though the chat panel shows their real names.
 */
function MemberMetaSync({ pubkey }: { pubkey: string }) {
  const meta = useProfile(pubkey);
  const rowExists = useChatStore((s) =>
    s.memberList.some((m) => m.pubkey === pubkey),
  );
  useEffect(() => {
    if (!meta || !rowExists) return;
    useChatStore.setState((state) => {
      const idx = state.memberList.findIndex((m) => m.pubkey === pubkey);
      if (idx === -1) return state;
      const cur = state.memberList[idx];
      const nextDisplayName = meta.displayName || meta.name || cur.displayName;
      const nextPicture = meta.picture ?? cur.picture;
      const nextNip05 = meta.nip05 ?? cur.nip05;
      if (
        cur.displayName === nextDisplayName &&
        cur.picture === nextPicture &&
        cur.nip05 === nextNip05
      ) {
        return state;
      }
      const next = [...state.memberList];
      next[idx] = {
        ...cur,
        displayName: nextDisplayName,
        picture: nextPicture,
        nip05: nextNip05,
      };
      return { memberList: next };
    });
  }, [pubkey, meta, rowExists]);
  return null;
}
