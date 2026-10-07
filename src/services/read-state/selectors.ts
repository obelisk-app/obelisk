/**
 * Derived read-state selectors (the React side is `src/hooks/read-state/`).
 *
 * Counts are pure functions over the bridge's `dmsByPeer` / `messagesByGroup`
 * stores filtered by the persisted cursor in `useReadStateStore`. There is
 * no separate counter to keep in sync: every value here is recomputed on
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
import type { JsDirectMessage, JsMessage } from '@/services/nostr-bridge';
import { buildAuthorIndex, isReplyToMe } from './replies';
import { EMPTY_HIGHLIGHTS } from '@/constants/read-state/selectors';

const FALLBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The stored cursor, or the 24h bootstrap window when there is none yet. */
export function effectiveCursor(stored: number | undefined): number {
  if (stored && stored > 0) return stored;
  return Date.now() - FALLBACK_WINDOW_MS;
}

/**
 * Count incoming DMs from `peer` newer than the read cursor. Outgoing
 * messages don't count (you wrote them, so they're "read" by definition).
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

/**
 * `true` if any unread message in the channel mentions `ownPubkey`. Reads
 * the precomputed `mentions` field that the bridge stamps at ingest from
 * `extractMentionPubkeysFromMessage(content, tags)`: content tokens AND
 * `#p` tags both count.
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
    if (m.mentions.includes(ownPubkey)) return true;
  }
  return false;
}

/**
 * Highlights for a single channel: total unread, plus the subsets that are
 * mentions or replies-to-me, plus the ordered event ids the
 * `MentionNavigator` walks with `↑↓`. All four values are pure functions
 * of the messages list and the cursor, recomputed on render.
 *
 * `eventIds` is oldest→newest and contains only mention OR reply events
 * (deduped). Replies are detected via NIP-10 strict reply marker resolved
 * against the channel's local message list (parent must be known).
 */
export interface ChannelHighlights {
  readonly unread: number;
  readonly mentions: number;
  readonly replies: number;
  readonly eventIds: ReadonlyArray<string>;
}

export function computeChannelHighlights(
  messages: ReadonlyArray<JsMessage>,
  cursor: number,
  ownPubkey: string | null,
): ChannelHighlights {
  if (messages.length === 0) return EMPTY_HIGHLIGHTS;
  const authorById = buildAuthorIndex(messages);
  const eventIds: string[] = [];
  let unread = 0;
  let mentions = 0;
  let replies = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.createdAt * 1000 <= cursor) continue;
    if (ownPubkey && m.pubkey === ownPubkey) continue;
    unread++;
    const mentioned = !!ownPubkey && m.mentions.includes(ownPubkey);
    const replied = isReplyToMe(m, authorById, ownPubkey);
    if (mentioned) mentions++;
    if (replied) replies++;
    if (mentioned || replied) eventIds.push(m.id);
  }
  return { unread, mentions, replies, eventIds };
}

// Notification counts live in `src/hooks/notifications/useNotificationSelectors.ts`
// since the single mixed inbox was split into independent DM and mention
// streams. See `useNotificationBadgeCount` / `useUnreadMentionCount` /
// `useUnreadDmNotificationCount` there.
