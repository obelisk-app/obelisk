/**
 * Feed engine — the three ways to read kind-1 traffic, plus the merge rules
 * every feed shares.
 *
 * Kept deliberately free of React so the ordering/dedupe/pagination logic is
 * unit-testable without a DOM. The hooks live in `useFeed.ts`.
 */

import { fetchNotesByAuthor, findReplyParentId, findRootEventId } from '@nostr-wot/data';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_TEXT_NOTE } from '../nip-kinds';
import { FEED_KINDS } from './kinds';
import { querySocial } from './pool';
import { dedupeReposts } from './repost';

export const FEED_PAGE_SIZE = 50;
/** Ceiling on notes held in memory for one feed. Cache keeps fewer still. */
export const FEED_MAX_NOTES = 500;

/**
 * Relays cap the number of values in a filter field, and a heavy Nostr user
 * follows thousands of pubkeys. Splitting `authors` into chunks keeps each
 * REQ inside what relays actually accept — one oversized filter is commonly
 * answered with nothing at all, which reads as "your follows posted nothing".
 */
export const AUTHORS_PER_FILTER = 300;

export type FeedKind = 'following' | 'global';

export function chunkAuthors(
  authors: readonly string[],
  size = AUTHORS_PER_FILTER,
): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < authors.length; i += size) chunks.push([...authors.slice(i, i + size)]);
  return chunks;
}

/**
 * Merge newly arrived notes into an existing list: dedupe by id, newest
 * first, capped. Pure — the same input always yields the same output, which
 * is what makes the feed safe to re-derive from cache + live events.
 */
export function mergeNotes(
  current: readonly NostrEvent[],
  incoming: readonly NostrEvent[],
  cap = FEED_MAX_NOTES,
): NostrEvent[] {
  if (incoming.length === 0) return current.slice(0, cap) as NostrEvent[];
  const byId = new Map<string, NostrEvent>();
  for (const note of current) byId.set(note.id, note);
  for (const note of incoming) {
    // First write wins on id collision: an id is content-addressed, so a
    // second copy from another relay is byte-identical anyway.
    if (!byId.has(note.id)) byId.set(note.id, note);
  }
  return [...byId.values()]
    .sort((a, b) => (b.created_at - a.created_at) || (a.id < b.id ? -1 : 1))
    .slice(0, cap);
}

/** Oldest `created_at` in a page — the `until` cursor for "load more". */
export function oldestCreatedAt(notes: readonly NostrEvent[]): number | null {
  if (notes.length === 0) return null;
  let oldest = notes[0].created_at;
  for (const note of notes) if (note.created_at < oldest) oldest = note.created_at;
  return oldest;
}

/**
 * `until` is inclusive on the relay side, so paging with the oldest
 * timestamp re-delivers the boundary note (and every note sharing that
 * second). Stepping back one second would risk skipping them instead; we
 * keep the overlap and let `mergeNotes` dedupe, which is the safe direction.
 */
export function nextCursor(notes: readonly NostrEvent[]): number | undefined {
  const oldest = oldestCreatedAt(notes);
  return oldest === null ? undefined : oldest;
}

function baseFilter(limit: number, until?: number): Filter {
  return { kinds: FEED_KINDS, limit, ...(until ? { until } : {}) };
}

/** Global firehose. */
export async function loadGlobalFeed(
  opts: { until?: number; limit?: number; relays?: readonly string[] } = {},
): Promise<NostrEvent[]> {
  const events = await querySocial([baseFilter(opts.limit ?? FEED_PAGE_SIZE, opts.until)], {
    ...(opts.relays ? { relays: opts.relays } : {}),
  });
  return dedupeReposts(mergeNotes([], events));
}

/**
 * Notes from the people you follow.
 *
 * Note this does NOT do per-author outbox (NIP-65) resolution: doing so for a
 * 1000-follow list would mean a thousand kind-10002 lookups and hundreds of
 * sockets. Following reads the configured social relay set; outbox routing is
 * reserved for single-author reads (`loadProfileFeed`) and for publishing.
 */
export async function loadFollowingFeed(
  authors: readonly string[],
  opts: { until?: number; limit?: number; relays?: readonly string[] } = {},
): Promise<NostrEvent[]> {
  if (authors.length === 0) return [];
  const limit = opts.limit ?? FEED_PAGE_SIZE;
  const filters = chunkAuthors(authors).map((chunk) => ({
    ...baseFilter(limit, opts.until),
    authors: chunk,
  }));
  const events = await querySocial(filters, {
    ...(opts.relays ? { relays: opts.relays } : {}),
  });
  return dedupeReposts(mergeNotes([], events));
}

/**
 * One author's notes. Goes through the SDK's `fetchNotesByAuthor`, which
 * unions the default relays with the author's NIP-65 *write* relays — so a
 * user who publishes somewhere unfashionable is still found.
 */
export async function loadProfileFeed(
  pubkey: string,
  opts: { until?: number; limit?: number; relays?: readonly string[] } = {},
): Promise<NostrEvent[]> {
  const notes = await fetchNotesByAuthor(pubkey, {
    limit: opts.limit ?? FEED_PAGE_SIZE,
    ...(opts.until ? { until: opts.until } : {}),
    ...(opts.relays ? { relays: [...opts.relays] } : {}),
  });
  // NoteEntry -> NostrEvent shape. The SDK drops sig/kind because it only
  // ever returns kind 1 here; the rest of our pipeline wants real events.
  return mergeNotes([], notes.map((n) => ({
    id: n.id,
    pubkey: n.pubkey,
    content: n.content,
    created_at: n.createdAt,
    tags: n.tags,
    kind: KIND_TEXT_NOTE,
    sig: '',
  })));
}

/**
 * True when a note is a genuine NIP-10 reply.
 *
 * Replaces `profile-feed.ts`'s `isReply`, which counted ANY `e` tag — so a
 * note that merely quoted or mentioned another event was filed under
 * "Replies". The SDK's helper honours the `root`/`reply` markers.
 */
export function isReplyNote(note: Pick<NostrEvent, 'tags'>): boolean {
  return findReplyParentId(note.tags) !== null;
}

export function rootIdOf(note: Pick<NostrEvent, 'tags'>): string | null {
  return findRootEventId(note.tags);
}

export function parentIdOf(note: Pick<NostrEvent, 'tags'>): string | null {
  return findReplyParentId(note.tags);
}

/** Hide notes from muted/blocked authors without refetching the feed. */
export function applyModeration(
  notes: readonly NostrEvent[],
  hidden: (pubkey: string) => boolean,
): NostrEvent[] {
  return notes.filter((note) => !hidden(note.pubkey));
}
