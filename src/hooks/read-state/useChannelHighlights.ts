'use client';

/**
 * Mention and reply highlights for channels: one channel, one channel from
 * the already-loaded map, or "any channel at all". The computation is pure
 * and lives in `src/services/read-state/selectors.ts`.
 */
import { relayChannelKey } from '@/utils/chat/channel/relay-channel-key';
import { useMemo } from 'react';
import { useCurrentRelayUrl, useMessages, useMessagesByGroup } from '@/services/nostr-bridge';
import { useReadStateStore } from '@/store/read-state';
import {
  channelHasMention,
  computeChannelHighlights,
  effectiveCursor,
  type ChannelHighlights,
} from '@/services/read-state/selectors';
import { EMPTY_HIGHLIGHTS } from '@/constants/read-state/selectors';
import { useCachedGroupMessages } from './useCachedGroupMessages';

export function useChannelHasMention(
  groupId: string | null | undefined,
  ownPubkey: string | null,
): boolean {
  const relay = useCurrentRelayUrl();
  const messages = useMessages(groupId ?? null);
  const stored = useReadStateStore((s) =>
    relay && groupId ? s.groupCursors[relayChannelKey(relay, groupId)] : undefined,
  );
  return useMemo(() => {
    if (!groupId || !messages || messages.length === 0) return false;
    return channelHasMention(messages, effectiveCursor(stored), ownPubkey);
  }, [groupId, messages, stored, ownPubkey]);
}

export function useChannelHighlights(
  groupId: string | null | undefined,
  ownPubkey: string | null,
): ChannelHighlights {
  const relay = useCurrentRelayUrl();
  const messages = useMessages(groupId ?? null);
  const stored = useReadStateStore((s) =>
    relay && groupId ? s.groupCursors[relayChannelKey(relay, groupId)] : undefined,
  );
  return useMemo(() => {
    if (!groupId || !messages || messages.length === 0) return EMPTY_HIGHLIGHTS;
    return computeChannelHighlights(messages, effectiveCursor(stored), ownPubkey);
  }, [groupId, messages, stored, ownPubkey]);
}

/**
 * Highlight selector for channel lists. Unlike {@link useChannelHighlights},
 * this reads the already-loaded messages map and does not open a per-channel
 * message subscription. Channel menus can render dozens of rows; subscribing
 * each row would turn one menu paint into a relay REQ burst.
 *
 * Each row reads only its own channel (`useCachedGroupMessages`), so a new
 * message re-renders the row it belongs to and no other.
 */
export function useCachedChannelHighlights(
  groupId: string | null | undefined,
  ownPubkey: string | null,
): ChannelHighlights {
  const relay = useCurrentRelayUrl();
  const messages = useCachedGroupMessages(groupId);
  const stored = useReadStateStore((s) =>
    relay && groupId ? s.groupCursors[relayChannelKey(relay, groupId)] : undefined,
  );
  return useMemo(() => {
    if (!groupId || !messages || messages.length === 0) return EMPTY_HIGHLIGHTS;
    return computeChannelHighlights(messages, effectiveCursor(stored), ownPubkey);
  }, [groupId, messages, stored, ownPubkey]);
}

/**
 * `true` when ANY currently-loaded channel has unread mentions or replies.
 * Used by the ServerRail to overlay an `@`-icon on the active relay tile.
 *
 * Limitation: only reflects channels the bridge has messages for, i.e.
 * the active relay. Inactive relays don't get a badge until cross-relay
 * mention-watch ships in a follow-up PR.
 */
export function useHasAnyHighlights(ownPubkey: string | null): boolean {
  const relay = useCurrentRelayUrl();
  const byGroup = useMessagesByGroup();
  const cursors = useReadStateStore((s) => s.groupCursors);
  return useMemo(() => {
    for (const groupId of Object.keys(byGroup)) {
      const list = byGroup[groupId];
      if (!list || list.length === 0) continue;
      const h = computeChannelHighlights(list, effectiveCursor(relay ? cursors[relayChannelKey(relay, groupId)] : undefined), ownPubkey);
      if (h.mentions > 0 || h.replies > 0) return true;
    }
    return false;
  }, [byGroup, cursors, ownPubkey, relay]);
}
