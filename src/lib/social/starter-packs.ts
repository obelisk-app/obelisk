/**
 * Follow starter packs — the fix for an account that has nothing to read.
 *
 * A fresh key follows nobody, so the Following feed is empty and the only
 * advice we had was "try the Global tab", which is a firehose of strangers
 * in languages you may not read. Starter packs are the convention the rest
 * of the network already uses to solve this: a curated list of people you
 * can follow in one action.
 *
 * ## Wire format
 *
 * Two kinds, because the ecosystem split:
 *
 *  - **kind 39089** — "starter pack", what Amethyst and Primal publish and
 *    what most packs in the wild are. Addressable, `d` identifier, `p` tags
 *    for members, `title`/`image`/`description` metadata.
 *  - **kind 30000** — NIP-51 follow sets. Older, same shape for our
 *    purposes, still used for curated lists.
 *
 * We read both and normalise, because a user doesn't care which kind a pack
 * happened to be published as. We never publish either.
 *
 * ## Following a pack
 *
 * Follows are one kind-3 contact list, so following a pack is a read-merge-
 * write of *that* event, not a per-person loop: publishing one kind 3 per
 * member would race itself and end with whichever write landed last, i.e.
 * one follow. The merge preserves existing tags (including the relay hints
 * and petnames other clients wrote there) and appends only what's missing.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { querySocial } from './pool';

export const KIND_STARTER_PACK = 39089;
export const KIND_FOLLOW_SET = 30000;

/** Packs with fewer than this are noise — someone's two-person test list. */
const MIN_MEMBERS = 3;

/** A pack nobody can read past is not a starter pack, it's an import. */
const MAX_MEMBERS = 500;

export type StarterPack = {
  /** `<kind>:<pubkey>:<d>` — stable across edits, unlike the event id. */
  id: string;
  title: string;
  description: string;
  image: string | null;
  /** Who published the pack. */
  curator: string;
  members: string[];
  createdAt: number;
};

function tagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

/**
 * Normalise a 39089 or 30000 event into a pack.
 *
 * Returns null for anything that wouldn't be useful to follow: no members,
 * too few to be curation, or so many that "follow all" is a mistake someone
 * has to undo by hand.
 */
export function parseStarterPack(event: NostrEvent): StarterPack | null {
  const identifier = tagValue(event, 'd');
  if (!identifier) return null;

  const members = [...new Set(
    event.tags
      .filter((tag) => tag[0] === 'p' && /^[0-9a-f]{64}$/i.test(tag[1] ?? ''))
      .map((tag) => tag[1].toLowerCase()),
  )];
  if (members.length < MIN_MEMBERS || members.length > MAX_MEMBERS) return null;

  return {
    id: `${event.kind}:${event.pubkey}:${identifier}`,
    // Amethyst writes `title`, some clients write `name`; fall back to the
    // `d` tag, which is usually a slug of the title.
    title: tagValue(event, 'title') || tagValue(event, 'name') || identifier,
    description: tagValue(event, 'description') || event.content || '',
    image: tagValue(event, 'image') || tagValue(event, 'picture') || null,
    curator: event.pubkey,
    members,
    createdAt: event.created_at,
  };
}

/** Newest edit of each pack wins; then bigger packs first. */
export function dedupePacks(packs: readonly StarterPack[]): StarterPack[] {
  const byId = new Map<string, StarterPack>();
  for (const pack of packs) {
    const existing = byId.get(pack.id);
    if (!existing || pack.createdAt > existing.createdAt) byId.set(pack.id, pack);
  }
  return [...byId.values()].sort(
    (a, b) => b.members.length - a.members.length || b.createdAt - a.createdAt,
  );
}

/**
 * Discover packs on the social relays.
 *
 * `curators` narrows the query to specific authors when the caller wants a
 * house selection; without it this is "whatever packs these relays hold",
 * which is the honest default for a client that curates nothing itself.
 */
export async function fetchStarterPacks({
  relays,
  curators,
  limit = 30,
}: {
  relays?: readonly string[];
  curators?: readonly string[];
  limit?: number;
} = {}): Promise<StarterPack[]> {
  const filter: Record<string, unknown> = {
    kinds: [KIND_STARTER_PACK, KIND_FOLLOW_SET],
    limit,
  };
  if (curators?.length) filter.authors = [...curators];

  const events = await querySocial([filter as never], relays ? { relays } : undefined);
  return dedupePacks(
    events
      // The coalescer hands us every consumer's events; take only ours.
      .filter((event) => event.kind === KIND_STARTER_PACK || event.kind === KIND_FOLLOW_SET)
      .map(parseStarterPack)
      .filter((pack): pack is StarterPack => pack !== null),
  );
}

/**
 * The tags for a kind 3 that follows everyone in `members`.
 *
 * Merge, never replace: the existing list carries relay hints and petnames
 * written by other clients, and a fresh `p`-only list would silently drop
 * them for every client the user owns.
 */
export function mergedFollowTags(
  current: readonly (readonly string[])[],
  members: readonly string[],
): string[][] {
  const tags = current.map((tag) => [...tag]);
  const known = new Set(
    current.filter((tag) => tag[0] === 'p').map((tag) => (tag[1] ?? '').toLowerCase()),
  );
  for (const member of members) {
    const pubkey = member.toLowerCase();
    if (known.has(pubkey)) continue;
    known.add(pubkey);
    tags.push(['p', pubkey]);
  }
  return tags;
}

/** How many of a pack's members you already follow. */
export function followedCount(
  pack: StarterPack,
  follows: readonly string[],
): number {
  const set = new Set(follows.map((pubkey) => pubkey.toLowerCase()));
  return pack.members.filter((member) => set.has(member)).length;
}
