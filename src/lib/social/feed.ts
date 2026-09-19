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
import { FEED_KINDS, kindsForFilter, type ContentFilter } from './kinds';
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

/**
 * Does this event actually belong in the feed that asked for it?
 *
 * This exists because the shared request coalescer fans every event out to
 * every consumer sharing a relay set — it merges filters into one
 * subscription and then calls `onEvent` on all active handles, without
 * checking which handle's filter actually matched. So a feed subscribed to
 * `authors: [...my follows]` still receives the kind-1 notes fetched by the
 * reply-count query, which are by whoever happened to reply to anything.
 *
 * That is what put strangers in the Following feed. Relays over-deliver too
 * (a filter is a hint, not a contract), so the guard is worth having on its
 * own merits: never trust the transport to have applied your filter.
 */
export function noteMatchesSource(
  note: Pick<NostrEvent, 'pubkey' | 'kind'>,
  source: { kind: 'following'; authors: readonly string[] } | { kind: 'global' } | { kind: 'profile'; pubkey: string },
  allowedAuthors?: ReadonlySet<string>,
  filter: ContentFilter = 'all',
): boolean {
  if (!kindsForFilter(filter).includes(note.kind)) return false;
  if (source.kind === 'profile') return note.pubkey === source.pubkey;
  if (source.kind === 'following') {
    const allowed = allowedAuthors ?? new Set(source.authors);
    return allowed.has(note.pubkey);
  }
  return true;
}

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

function baseFilter(limit: number, until?: number, filter: ContentFilter = 'all'): Filter {
  // Narrow the REQ itself, not just the rendering — asking for 50 mixed
  // events and showing the three articles among them is how an "Articles"
  // view ends up looking empty.
  return { kinds: kindsForFilter(filter), limit, ...(until ? { until } : {}) };
}

/** Global firehose. */
export async function loadGlobalFeed(
  opts: { until?: number; limit?: number; relays?: readonly string[]; filter?: ContentFilter } = {},
): Promise<NostrEvent[]> {
  const events = await querySocial([baseFilter(opts.limit ?? FEED_PAGE_SIZE, opts.until, opts.filter)], {
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
  opts: { until?: number; limit?: number; relays?: readonly string[]; filter?: ContentFilter } = {},
): Promise<NostrEvent[]> {
  if (authors.length === 0) return [];
  const limit = opts.limit ?? FEED_PAGE_SIZE;
  const filters = chunkAuthors(authors).map((chunk) => ({
    ...baseFilter(limit, opts.until, opts.filter),
    authors: chunk,
  }));
  const events = await querySocial(filters, {
    ...(opts.relays ? { relays: opts.relays } : {}),
  });
  // Filter by author on the way in: see `noteMatchesSource`.
  const allowed = new Set(authors);
  return dedupeReposts(mergeNotes([], events.filter((event) => allowed.has(event.pubkey))));
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
  // Same guard as the following feed: the coalescer fans other consumers'
  // events into this handle too.
  return mergeNotes([], notes.filter((n) => n.pubkey === pubkey).map((n) => ({
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
