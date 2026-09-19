import 'server-only';

/**
 * Server-side relay reads, for the public viewer at `/notes/<id>` and
 * `/p/<id>`.
 *
 * The rest of this app is deliberately client-only — there is no backend, and
 * `CLAUDE.md` says so. This module is the documented exception, and it exists
 * for exactly one reason: **link previews**.
 *
 * A client-rendered page hands a crawler an empty shell. Paste a link to it
 * in any chat app and you get a blank card with the site name, which defeats
 * the entire point of having a shareable note URL. njump.me renders on the
 * server precisely so the preview works, and matching that requires fetching
 * the event before the HTML is sent.
 *
 * Scope discipline: this is read-only, unauthenticated, and used only by the
 * public viewer routes. It never signs, never AUTHs, and must not be imported
 * into the app shell — `server-only` enforces the last part at build time.
 */

import { SimplePool, nip19, type Event as NostrEvent } from 'nostr-tools';
import { safeRelayHints, type ViewerTarget } from '@/lib/social/identifier';

export type { ViewerTarget };

/**
 * Bounded, but not stingy. Opening a fresh WebSocket to a public relay and
 * getting an EOSE back routinely takes over a second, and 2.5s was short
 * enough that cold requests resolved to nothing — which then got cached as a
 * "not found" page. Crawlers generally allow ~5-10s, so 6s leaves room for
 * the handshake while still failing fast enough to render *something*.
 */
const FETCH_TIMEOUT_MS = 6000;

/**
 * Well-connected public relays plus the aggregator that exists for exactly
 * this (profile lookup). A visitor has no configured relay set — they may
 * never have opened the app — so the server has to guess well.
 */
export const VIEWER_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://purplepag.es',
];

/**
 * One bounded query. Always destroys the pool — a leaked socket in a server
 * process is a slow memory leak, not a transient annoyance.
 */
async function query(
  filters: Parameters<SimplePool['querySync']>[1][],
  relays: string[],
): Promise<NostrEvent[]> {
  const pool = new SimplePool();
  try {
    const results = await Promise.all(filters.map((filter) => (
      Promise.race([
        pool.querySync(relays, filter, { maxWait: FETCH_TIMEOUT_MS }),
        new Promise<NostrEvent[]>((resolve) => {
          setTimeout(() => resolve([]), FETCH_TIMEOUT_MS + 250);
        }),
      ])
    )));
    return results.flat();
  } catch {
    return [];
  } finally {
    try {
      pool.destroy();
    } catch {
      // Already torn down.
    }
  }
}

function relaysFor(target: ViewerTarget): string[] {
  return [...new Set([...safeRelayHints(target.relays), ...VIEWER_RELAYS])];
}

/** Newest wins — replaceable events legitimately arrive more than once. */
function newest(events: NostrEvent[]): NostrEvent | null {
  return events.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
}

export async function fetchEventForViewer(target: ViewerTarget): Promise<NostrEvent | null> {
  const relays = relaysFor(target);

  if (target.kind === 'address') {
    return newest(await query([{
      kinds: [target.eventKind],
      authors: [target.pubkey],
      '#d': [target.identifier],
      limit: 1,
    }], relays));
  }

  if (target.kind === 'profile') {
    return newest(await query([{ kinds: [0], authors: [target.pubkey], limit: 1 }], relays));
  }

  return newest(await query([{ ids: [target.id] }], relays));
}

export type ViewerProfile = {
  pubkey: string;
  name: string | null;
  displayName: string | null;
  about: string | null;
  picture: string | null;
  banner: string | null;
  nip05: string | null;
  website: string | null;
  lud16: string | null;
};

/** kind-0 content is arbitrary user JSON, so every field is checked. */
export function parseProfileContent(event: NostrEvent | null, pubkey: string): ViewerProfile {
  const empty: ViewerProfile = {
    pubkey,
    name: null,
    displayName: null,
    about: null,
    picture: null,
    banner: null,
    nip05: null,
    website: null,
    lud16: null,
  };
  if (!event) return empty;
  try {
    const raw = JSON.parse(event.content) as Record<string, unknown>;
    const str = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : null);
    return {
      pubkey,
      name: str('name'),
      displayName: str('display_name') ?? str('displayName'),
      about: str('about'),
      picture: str('picture'),
      banner: str('banner'),
      nip05: str('nip05'),
      website: str('website'),
      lud16: str('lud16'),
    };
  } catch {
    return empty;
  }
}

/** Author profile for a note, so the preview can name who wrote it. */
export async function fetchAuthorForViewer(pubkey: string): Promise<ViewerProfile> {
  const event = await fetchEventForViewer({ kind: 'profile', pubkey, relays: [] });
  return parseProfileContent(event, pubkey);
}

/** Recent notes by an author, for the "more from" rail on a note page. */
export async function fetchAuthorNotes(
  pubkey: string,
  opts: { limit?: number; excludeId?: string } = {},
): Promise<NostrEvent[]> {
  const events = await query(
    [{ kinds: [1], authors: [pubkey], limit: (opts.limit ?? 5) + 1 }],
    VIEWER_RELAYS,
  );
  return events
    .filter((event) => event.id !== opts.excludeId)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, opts.limit ?? 5);
}

/**
 * Which hashtags this author actually uses, most-used first.
 *
 * Derived from their recent notes rather than any declared list, because
 * nobody declares one — the `t` tags on what they post are the only honest
 * signal of what they write about.
 */
export function topHashtags(notes: readonly NostrEvent[], limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    // Count each tag once per note, or a single spammy post dominates.
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

/** Pubkeys this author follows (kind 3). */
export async function fetchAuthorFollows(pubkey: string, limit = 12): Promise<string[]> {
  const event = newest(await query([{ kinds: [3], authors: [pubkey], limit: 1 }], VIEWER_RELAYS));
  if (!event) return [];
  const seen = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] === 'p' && /^[0-9a-f]{64}$/i.test(tag[1] ?? '')) seen.add(tag[1].toLowerCase());
  }
  return [...seen].slice(0, limit);
}

export type AuthorRelays = { read: string[]; write: string[] };

/**
 * The author's NIP-65 relay list. An absent third element means the relay is
 * used for both directions — the common case, and easy to get wrong.
 */
export async function fetchAuthorRelays(pubkey: string): Promise<AuthorRelays> {
  const event = newest(await query([{ kinds: [10002], authors: [pubkey], limit: 1 }], VIEWER_RELAYS));
  const read: string[] = [];
  const write: string[] = [];
  if (!event) return { read, write };
  for (const tag of event.tags) {
    if (tag[0] !== 'r' || !tag[1]) continue;
    const marker = tag[2]?.trim().toLowerCase();
    if (!marker) {
      read.push(tag[1]);
      write.push(tag[1]);
    } else if (marker === 'read') {
      read.push(tag[1]);
    } else if (marker === 'write') {
      write.push(tag[1]);
    }
    // Anything else is unrecognised; treating it as neither is safer than
    // guessing, and it's rare enough not to matter for a display list.
  }
  return { read: [...new Set(read)], write: [...new Set(write)] };
}

/** Profiles for a batch of pubkeys, for the "follows" rail. */
export async function fetchProfilesForViewer(pubkeys: readonly string[]): Promise<ViewerProfile[]> {
  if (pubkeys.length === 0) return [];
  const events = await query([{ kinds: [0], authors: [...pubkeys] }], VIEWER_RELAYS);
  const byPubkey = new Map<string, NostrEvent>();
  for (const event of events) {
    const existing = byPubkey.get(event.pubkey);
    if (!existing || event.created_at > existing.created_at) byPubkey.set(event.pubkey, event);
  }
  return pubkeys
    .map((pubkey) => parseProfileContent(byPubkey.get(pubkey) ?? null, pubkey))
    // Only show people we could actually name — an unresolved row is noise.
    .filter((profile) => profile.name || profile.displayName || profile.picture);
}

/** Recent notes carrying a hashtag, for /t/<tag>. */
export async function fetchHashtagNotes(tag: string, limit = 30): Promise<NostrEvent[]> {
  const events = await query([{ kinds: [1], '#t': [tag.toLowerCase()], limit }], VIEWER_RELAYS);
  const byId = new Map<string, NostrEvent>();
  for (const event of events) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}

export function displayNameFor(profile: ViewerProfile): string {
  if (profile.displayName?.trim()) return profile.displayName.trim();
  if (profile.name?.trim()) return profile.name.trim();
  try {
    return `${nip19.npubEncode(profile.pubkey).slice(0, 12)}…`;
  } catch {
    return `${profile.pubkey.slice(0, 10)}…`;
  }
}
