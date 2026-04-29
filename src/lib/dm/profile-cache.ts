import type { Event as NostrEvent } from 'nostr-tools/pure';
import { getExplicitRelays } from '@/lib/nostr';
import { createKeyedObservable, type Slot } from '@/lib/nostr-store';
import { subscribeReplaceable } from '@/lib/nostr-resource';

export interface ProfileEntry {
  event: NostrEvent;
  parsed: {
    name?: string;
    displayName?: string;
    picture?: string;
    about?: string;
    nip05?: string;
  };
  lastCheckedAt: number;
}

// 24h freshness window. Profiles change rarely enough that re-querying
// within a day is wasteful and adds visible relay load. Beyond TTL we
// always hit relays again.
const TTL_MS = 24 * 3600 * 1000;

// purplepag.es is the canonical kind-0 aggregator, but a single relay is
// fragile — if it's slow or down, every avatar and display name in the DM
// list shows the npub fallback. Add a couple of broad-coverage relays so
// the lookup has more than one chance to land.
const PROFILE_AGGREGATORS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

let extraRelays: string[] = [];
export function setProfileTestRelays(relays: string[]): void { extraRelays = relays; }

// Optional dynamic relay set — DM bootstrap calls this with the union of
// the relay pool, the user's NIP-65 outbox, and the extension's getRelays().
// Profile-cache's queries then ride the same warm sockets the walker is
// already using, so partner avatars resolve from whatever relays the user
// (or their contacts) actually publish on, not just our hard-coded few.
let dynamicRelays: string[] = [];
export function setProfileDynamicRelays(relays: string[]): void {
  dynamicRelays = Array.from(new Set(relays.filter((r) => r.startsWith('wss://'))));
}

// The keyed observable is the source of truth for in-memory state.
// localStorage is the cold-load seed: we hydrate the slot lazily on first
// access per (me, partner) pair, and write through on every update.
const profileStore = createKeyedObservable<string, ProfileEntry>({
  // No content-equality short-circuit on this layer — `getProfile` already
  // dedupes by `created_at` before calling `set`, so the store sees only
  // genuine updates.
});

/** Test/teardown helper. Clears in-memory state; localStorage stays as-is
 *  (per-account-keyed and survives across instances). */
export function _resetProfileCache(): void {
  profileStore._reset();
}

/** Direct access to the underlying observable for hooks (e.g. useProfile). */
export function _profileStore() { return profileStore; }

function slotKey(me: string, partner: string): string { return `${me}|${partner}`; }
function storageKey(me: string): string { return `obelisk:profiles:${me}`; }

function readPersisted(me: string): Record<string, ProfileEntry> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(storageKey(me)) ?? '{}'); } catch { return {}; }
}

function writePersisted(me: string, blob: Record<string, ProfileEntry>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(storageKey(me), JSON.stringify(blob)); } catch { /* ignore */ }
}

function parseKind0(content: string): ProfileEntry['parsed'] {
  try {
    const r = JSON.parse(content);
    return {
      name: r.name,
      displayName: r.displayName ?? r.display_name,
      picture: r.picture ?? r.image,
      about: r.about,
      nip05: r.nip05,
    };
  } catch { return {}; }
}

/**
 * Hydrate the slot for (me, partner) from localStorage if we haven't yet.
 * Returns the current slot (possibly empty if nothing was persisted).
 */
function hydrateSlot(me: string, partner: string): Slot<ProfileEntry> {
  const k = slotKey(me, partner);
  const slot = profileStore.get(k);
  if (slot.value !== undefined) return slot;
  const persisted = readPersisted(me)[partner];
  if (persisted) {
    profileStore.set(k, persisted);
    return profileStore.get(k);
  }
  return slot;
}

export interface SubscribeProfileOpts {
  /** Fires synchronously with the localStorage-hydrated entry, if any. */
  onCache?: (p: ProfileEntry) => void;
  /** Fires when a strictly newer kind-0 lands from relays. */
  onUpdate?: (p: ProfileEntry) => void;
}

/**
 * Subscribe to the profile resource for `partner` (kind 0). Built on the
 * generic `subscribeReplaceable` primitive — same loading contract as every
 * other replaceable resource (relay lists, follows). Consumers don't need
 * to remember to apply a synchronous cached value; `onCache` fires before
 * this function returns if the localStorage seed has data.
 *
 * Dedup is by `created_at`: older / equal events are dropped silently.
 * `lastCheckedAt` on the cached entry is NOT bumped on equal-or-older
 * arrivals — keeps the persisted blob smaller.
 */
export function subscribeProfile(
  me: string,
  partner: string,
  opts: SubscribeProfileOpts = {},
): () => void {
  const k = slotKey(me, partner);

  const relays = Array.from(new Set([
    ...PROFILE_AGGREGATORS,
    ...getExplicitRelays(),
    ...dynamicRelays,
    ...extraRelays,
  ]));

  return subscribeReplaceable<ProfileEntry>({
    filters: [{ kinds: [0], authors: [partner], limit: 1 }],
    relays,
    hydrate: () => hydrateSlot(me, partner).value ?? null,
    persist: (entry) => {
      const blob = readPersisted(me);
      blob[partner] = entry;
      writePersisted(me, blob);
      profileStore.set(k, entry);
    },
    parse: (event) => ({
      event,
      parsed: parseKind0(event.content),
      lastCheckedAt: Date.now(),
    }),
    match: (event) => event.kind === 0 && event.pubkey === partner,
    // Skip the relay round-trip when the cached entry was last refreshed
    // within TTL — typical case after a recent visit to the same partner.
    // Beyond TTL, always re-check (lets a partner's avatar/name update
    // without forcing the user to wait for a manual refresh).
    shouldFetch: (cached) => !cached || Date.now() - cached.lastCheckedAt > TTL_MS,
    onCache: opts.onCache,
    onUpdate: opts.onUpdate,
  });
}

// Compat shim — a few legacy call sites still use the result-shape API. New
// code should call `subscribeProfile` directly. The shim wires `onCache` so
// the synchronous return value matches the previous semantics.
export interface GetProfileResult {
  profile: ProfileEntry | null;
  dispose?: () => void;
}
export function getProfile(
  me: string,
  partner: string,
  opts: { onUpdate?: (p: ProfileEntry) => void } = {},
): GetProfileResult {
  let cached: ProfileEntry | null = null;
  const dispose = subscribeProfile(me, partner, {
    onCache: (entry) => { cached = entry; },
    onUpdate: opts.onUpdate,
  });
  return { profile: cached, dispose };
}
