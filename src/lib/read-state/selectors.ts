/**
 * Derived read-state selectors.
 *
 * Counts are pure functions over the bridge's `dmsByPeer` / `messagesByGroup`
 * stores filtered by the persisted cursor in `useReadStateStore`. There is
 * no separate counter to keep in sync — every value here is recomputed on
 * read, so the only write site is `setDmCursor` / `setGroupCursor`.
 *
 * Cursors are stored in unix **milliseconds**; relay messages carry
 * `createdAt` in unix **seconds**. The comparison is `msg.createdAt * 1000`.
 *
 * Bootstrap fallback: when no cursor exists for a key (first paint after
 * deploy, or a peer the user has never opened), the effective cursor is
 * `Date.now() - 24h`. This matches the legacy 24h heuristic the user lived
 * with for years and converges to a real cursor as soon as they open the
 * thread for the first time.
 */
import { useMemo } from 'react';
import type { JsDirectMessage, JsMessage } from '@/lib/nostr-bridge/types';
import {
  useDirectMessages,
  useMessages,
  useMessagesByGroup,
} from '@/lib/nostr-bridge';
import { useReadStateStore } from '@/store/read-state';
import { extractMentionPubkeys } from '@/lib/mentions';

const FALLBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

function effectiveCursor(stored: number | undefined): number {
  if (stored && stored > 0) return stored;
  return Date.now() - FALLBACK_WINDOW_MS;
}

/**
 * Count incoming DMs from `peer` newer than the read cursor. Outgoing
 * messages don't count (you wrote them — they're "read" by definition).
 *
 * Walks the list from the end and breaks once it hits the cursor; bridge
 * stores `dmsByPeer[peer]` sorted ascending by `createdAt`.
 */
export function countDMUnread(
  messages: ReadonlyArray<JsDirectMessage>,
  cursor: number,
): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.createdAt * 1000 <= cursor) break;
    if (!m.outgoing) n++;
  }
  return n;
}

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

/**
 * Channel unread count. Skips own messages (you wrote them).
 */
export function countChannelUnread(
  messages: ReadonlyArray<JsMessage>,
  cursor: number,
  ownPubkey: string | null,
): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.createdAt * 1000 <= cursor) break;
    if (ownPubkey && m.pubkey === ownPubkey) continue;
    n++;
  }
  return n;
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

/**
 * `true` if any unread message in the channel mentions `ownPubkey`. Uses the
 * same mention extractor as the legacy `read-gates.handleIncomingChannelMessage`
 * path, evaluated lazily on render rather than mutated into a side store.
 */
export function channelHasMention(
  messages: ReadonlyArray<JsMessage>,
  cursor: number,
  ownPubkey: string | null,
): boolean {
  if (!ownPubkey) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.createdAt * 1000 <= cursor) break;
    if (m.pubkey === ownPubkey) continue;
    if (extractMentionPubkeys(m.content).includes(ownPubkey)) return true;
  }
  return false;
}

export function useChannelHasMention(
  groupId: string | null | undefined,
  ownPubkey: string | null,
): boolean {
  const messages = useMessages(groupId ?? null);
  const stored = useReadStateStore((s) =>
    groupId ? s.groupCursors[groupId] : undefined,
  );
  return useMemo(() => {
    if (!groupId || !messages || messages.length === 0) return false;
    return channelHasMention(messages, effectiveCursor(stored), ownPubkey);
  }, [groupId, messages, stored, ownPubkey]);
}

export function useInboxUnreadCount(): number {
  const events = useReadStateStore((s) => s.inboxEvents);
  const cursor = useReadStateStore((s) => s.inboxLastReadAt);
  return useMemo(() => {
    let n = 0;
    for (const e of events) {
      const t = Date.parse(e.createdAt);
      if (!Number.isNaN(t) && t > cursor) n++;
    }
    return n;
  }, [events, cursor]);
}
