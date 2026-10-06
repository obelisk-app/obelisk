'use client';

/**
 * Unread counts for DMs and channels, recomputed on read from the bridge's
 * message stores and the persisted cursors. The counting itself is pure and
 * lives in `src/services/read-state/selectors.ts`.
 */
import { useMemo } from 'react';
import { useDirectMessages, useMessages, useMessagesByGroup } from '@/services/nostr-bridge';
import { useReadStateStore } from '@/store/read-state';
import { countChannelUnread, countDMUnread, effectiveCursor } from '@/services/read-state/selectors';

export function useDMUnreadCount(peer: string | null | undefined): number {
  const dms = useDirectMessages();
  const stored = useReadStateStore((s) => (peer ? s.dmCursors[peer] : undefined));
  return useMemo(() => {
    if (!peer) return 0;
    const list = dms[peer];
    if (!list || list.length === 0) return 0;
    return countDMUnread(list, effectiveCursor(stored));
  }, [peer, dms, stored]);
}

export function useTotalDMUnread(): number {
  const dms = useDirectMessages();
  const cursors = useReadStateStore((s) => s.dmCursors);
  return useMemo(() => {
    let total = 0;
    for (const peer of Object.keys(dms)) {
      const list = dms[peer];
      if (!list || list.length === 0) continue;
      total += countDMUnread(list, effectiveCursor(cursors[peer]));
    }
    return total;
  }, [dms, cursors]);
}

export function useChannelUnreadCount(
  groupId: string | null | undefined,
  ownPubkey: string | null,
): number {
  const messages = useMessages(groupId ?? null);
  const stored = useReadStateStore((s) =>
    groupId ? s.groupCursors[groupId] : undefined,
  );
  return useMemo(() => {
    if (!groupId || !messages || messages.length === 0) return 0;
    return countChannelUnread(messages, effectiveCursor(stored), ownPubkey);
  }, [groupId, messages, stored, ownPubkey]);
}

/**
 * Sum of `useChannelUnreadCount` across every channel the bridge has
 * messages for. Subscribes to `messagesByGroup` so it re-evaluates when
 * any channel's message list changes.
 */
export function useTotalChannelUnread(ownPubkey: string | null): number {
  const byGroup = useMessagesByGroup();
  const cursors = useReadStateStore((s) => s.groupCursors);
  return useMemo(() => {
    let total = 0;
    for (const groupId of Object.keys(byGroup)) {
      const list = byGroup[groupId];
      if (!list || list.length === 0) continue;
      total += countChannelUnread(list, effectiveCursor(cursors[groupId]), ownPubkey);
    }
    return total;
  }, [byGroup, cursors, ownPubkey]);
}
