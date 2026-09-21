/**
 * Search across the open network: notes, hashtags, and direct identifiers.
 *
 * Distinct from the group search in `client.ts` (`searchMessages`), which is
 * NIP-50 over kind 9 on the *active NIP-29 relay*. That one answers "what was
 * said in this room". This one answers "what is on Nostr", and so runs over
 * the social relays plus the NIP-50 indexers.
 *
 * People search already exists and is reused rather than rewritten:
 * `useNostrUserSearch` covers NIP-19 decode, NIP-05 resolution and NIP-50
 * kind-0 lookup.
 *
 * ## The trap this module exists to avoid
 *
 * NIP-50 is optional, and a relay that doesn't implement it **ignores the
 * `search` field rather than rejecting the filter** — so it happily answers
 * `{kinds:[1], search:"bitcoin"}` with its latest 50 notes about nothing in
 * particular. Trusting relay results verbatim therefore fills a search page
 * with content that doesn't match the query, which looks like the search is
 * broken rather than unsupported. Every result here is re-checked client
 * side.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_LONG_FORM, KIND_NOTE } from './kinds';
import { querySocial, socialRelays } from './pool';
import { parseIdentifier, type ViewerTarget } from './identifier';

/**
 * Indexers that actually implement NIP-50. Kept alongside the user's own
 * relays because most general relays don't index full text, and a search that
 * only queries the user's four relays usually returns nothing.
 *
 * Deliberately the same list as `useNostrUserSearch.NIP50_RELAYS` — see the
 * measured health notes there.
 */
export const SEARCH_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.noswhere.com',
  'wss://search.nos.today',
];

export const SEARCH_LIMIT = 40;

export type SearchKind = 'notes' | 'hashtag' | 'identifier';

export type ParsedQuery =
  | { kind: 'hashtag'; tag: string }
  | { kind: 'identifier'; target: ViewerTarget; raw: string }
  | { kind: 'text'; text: string }
  | { kind: 'empty' };

/**
 * What the user typed, classified.
 *
 * Order matters: `#foo` is unambiguous, an identifier is unambiguous, and
 * everything else is free text. Checking identifiers before text stops a
 * pasted `npub` being sent to a full-text index that will never match it.
 */
export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'empty' };

  if (trimmed.startsWith('#')) {
    // A lone `#` is someone mid-typing: searching full text for it burns a
    // round trip on every relay and can only return noise.
    const tag = trimmed.slice(1).trim().toLowerCase();
    return tag ? { kind: 'hashtag', tag } : { kind: 'empty' };
  }

  // Only try to decode things that look like identifiers — running every
  // query through bech32 decode is wasted work on ordinary words.
  if (/^(nostr:)?(npub|nprofile|note|nevent|naddr)1[a-z0-9]+$/i.test(trimmed)
    || /^[0-9a-f]{64}$/i.test(trimmed)) {
    const target = parseIdentifier(trimmed);
    if (target) return { kind: 'identifier', target, raw: trimmed };
  }

  return { kind: 'text', text: trimmed };
}

/** Relays worth asking for a full-text query. */
function textSearchRelays(): string[] {
  return [...new Set([...socialRelays(), ...SEARCH_RELAYS])];
}

/**
 * Does this event actually match the query?
 *
 * The guard against relays that ignore `search`. Every term must appear
 * somewhere in the content or the tags — an AND rather than an OR, because a
 * multi-word query matching on any single word is indistinguishable from no
 * filtering at all.
 */
export function noteMatchesQuery(note: Pick<NostrEvent, 'content' | 'tags'>, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = [
    note.content,
    // Title and summary carry the substance of a long-form post, whose
    // content is markdown the user may never see in a result row.
    ...note.tags
      .filter((tag) => tag[0] === 'title' || tag[0] === 'summary' || tag[0] === 't')
      .map((tag) => tag[1] ?? ''),
  ].join(' ').toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

function newestFirst(events: readonly NostrEvent[]): NostrEvent[] {
  const byId = new Map<string, NostrEvent>();
  for (const event of events) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => b.created_at - a.created_at);
}

/**
 * Full-text note search.
 *
 * Long-form is included because an article about a topic is usually a better
 * answer than a passing mention of it in a short note.
 */
export async function searchNotes(
  text: string,
  opts: { limit?: number } = {},
): Promise<NostrEvent[]> {
  const query = text.trim();
  if (!query) return [];
  const limit = opts.limit ?? SEARCH_LIMIT;

  const events = await querySocial(
    [{ kinds: [KIND_NOTE, KIND_LONG_FORM], search: query, limit } as never],
    { relays: textSearchRelays() },
  );

  // Re-check every hit: see the module header.
  return newestFirst(events.filter((event) => noteMatchesQuery(event, query))).slice(0, limit);
}

/**
 * Hashtag search.
 *
 * Uses a `#t` filter rather than NIP-50, so it works on every relay rather
 * than only the indexers — tags are indexed by the protocol itself.
 */
export async function searchHashtag(
  tag: string,
  opts: { limit?: number } = {},
): Promise<NostrEvent[]> {
  const clean = tag.trim().replace(/^#/, '').toLowerCase();
  if (!clean) return [];
  const limit = opts.limit ?? SEARCH_LIMIT;

  const events = await querySocial(
    [{ kinds: [KIND_NOTE, KIND_LONG_FORM], '#t': [clean], limit }],
    { relays: textSearchRelays() },
  );

  // Relays can over-deliver on tag filters too, and the shared coalescer
  // fans other consumers' events into this handle regardless.
  return newestFirst(events.filter((event) =>
    event.tags.some((t) => t[0] === 't' && t[1]?.toLowerCase() === clean),
  )).slice(0, limit);
}

/** Hashtags seen in a set of results, most frequent first. */
export function relatedHashtags(notes: readonly NostrEvent[], limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    const seen = new Set<string>();
    for (const tag of note.tags) {
      if (tag[0] !== 't' || !tag[1]) continue;
      const value = tag[1].toLowerCase();
      if (seen.has(value)) continue;
      seen.add(value);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}
