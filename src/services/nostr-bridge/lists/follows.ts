import type { Event as NostrEvent } from 'nostr-tools';

interface Follows {
  readonly list: ReadonlyArray<string>;
  readonly set: ReadonlySet<string>;
}

const empty: Follows = { list: [], set: new Set<string>() };
// Signed events are immutable. Weak keys let replaced contact events and
// their derived indexes leave memory together, including after logout.
const cache = new WeakMap<NostrEvent, Follows>();

/** One parse and membership index shared by all rows reading a contact event. */
export function contactFollows(event: NostrEvent | null): Follows {
  if (!event) return empty;
  const cached = cache.get(event);
  if (cached) return cached;
  const set = new Set<string>();
  for (const tag of event.tags) {
    const pubkey = tag[0] === 'p' ? tag[1]?.toLowerCase() : null;
    if (pubkey && /^[0-9a-f]{64}$/.test(pubkey)) set.add(pubkey);
  }
  const follows = { list: Array.from(set), set };
  cache.set(event, follows);
  return follows;
}
