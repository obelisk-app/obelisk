/**
 * Reply-to-me detection — strict NIP-10.
 *
 * A message is a reply to me when:
 *   1. It has an `e` tag with marker `"reply"` (NIP-10), AND
 *   2. The event id pointed to by that tag corresponds to a message
 *      authored by `myPubkey`.
 *
 * The bridge already parses (1) into `JsMessage.replyToId` at ingest
 * (`client.ts:ingestMessage`); this module handles (2) — resolving the
 * parent event id back to its author by walking the channel's message
 * list.
 *
 * Root-only e-tags (NIP-10 marker `"root"` or unmarked positional) are
 * intentionally NOT treated as replies — those denote thread membership,
 * not a direct reply, and would over-count for everyone in a threaded
 * channel.
 */
import type { JsMessage } from '@/lib/nostr-bridge/types';

/**
 * Build a `Map<eventId, authorPubkey>` from a channel's message list.
 * Cheap to recompute; selectors call it once per render via `useMemo`.
 */
export function buildAuthorIndex(
  messages: ReadonlyArray<JsMessage>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of messages) out.set(m.id, m.pubkey);
  return out;
}

/**
 * `true` when `msg` is a NIP-10 reply pointing to a parent authored by
 * `myPubkey`. Returns `false` for plain messages, replies to other
 * users, and replies whose parent is no longer in the local message
 * list (we only flag what we can prove).
 */
export function isReplyToMe(
  msg: Pick<JsMessage, 'replyToId'>,
  authorById: ReadonlyMap<string, string>,
  myPubkey: string | null,
): boolean {
  if (!myPubkey) return false;
  if (!msg.replyToId) return false;
  const parentAuthor = authorById.get(msg.replyToId);
  return parentAuthor === myPubkey;
}
