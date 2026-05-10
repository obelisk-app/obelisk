import type { Event as NostrEvent } from 'nostr-tools/pure';
import { sharedCoalescer } from '@/lib/nostr-coalescer';
import { getDefaultRelays } from '@nostr-wot/data';
import { createKeyedObservable, type Slot } from '@/lib/nostr-store';

/**
 * SDK pool default relays. Browser-only — returns `[]` server-side because
 * the SDK pool is configured per-app.
 */
function poolRelays(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return getDefaultRelays();
  } catch {
    return [];
  }
}

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
// the NDK pool, the user's NIP-65 outbox, and the extension's getRelays().
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

export interface GetProfileResult {
  profile: ProfileEntry | null;
  dispose?: () => void;
}

export function getProfile(
  me: string,
  partner: string,
  opts: { onUpdate?: (p: ProfileEntry) => void } = {},
): GetProfileResult {
  const k = slotKey(me, partner);
  const slot = hydrateSlot(me, partner);
  const cached = slot.value ?? null;
  const stale = !cached || Date.now() - cached.lastCheckedAt > TTL_MS;

  let unsubStore: (() => void) | undefined;
  if (opts.onUpdate) {
    const cb = opts.onUpdate;
    unsubStore = profileStore.subscribe(k, (s) => {
      if (s.value !== undefined) cb(s.value);
    });
  }

  if (stale) {
    const relays = Array.from(new Set([
      ...PROFILE_AGGREGATORS,
      ...poolRelays(),
      ...dynamicRelays,
      ...extraRelays,
    ]));
    if (typeof window !== 'undefined') {
      console.log('[profile-cache] fetching kind 0', { partner: partner.slice(0, 8), relayCount: relays.length });
    }
    sharedCoalescer.enqueue({
      filters: [{ kinds: [0], authors: [partner], limit: 1 }],
      relays,
      onEvent: (event: NostrEvent) => {
        if (event.kind !== 0 || event.pubkey !== partner) return;
        if (typeof window !== 'undefined') {
          console.log('[profile-cache] got kind 0', { partner: partner.slice(0, 8), at: event.created_at });
        }
        const current = profileStore.get(k).value;
        if (current && current.event.created_at >= event.created_at) {
          // Same or older event — refresh `lastCheckedAt` only, no notify.
          // Persist + write the slot with bumped timestamp; we use `set`
          // here because we want to keep the in-memory slot in sync, and
          // the equal() function isn't configured. Avoid the notify by
          // only writing if the partner record exists in localStorage.
          const refreshed: ProfileEntry = { ...current, lastCheckedAt: Date.now() };
          const blob = readPersisted(me);
          blob[partner] = refreshed;
          writePersisted(me, blob);
          return;
        }
        const entry: ProfileEntry = {
          event,
          parsed: parseKind0(event.content),
          lastCheckedAt: Date.now(),
        };
        const blob = readPersisted(me);
        blob[partner] = entry;
        writePersisted(me, blob);
        profileStore.set(k, entry);
      },
    });
  }

  return { profile: cached, dispose: unsubStore };
}
