import type { Event as NostrEvent } from 'nostr-tools/pure';
import { sharedCoalescer } from '@/lib/nostr-coalescer';
import { createKeyedObservable, type Slot } from '@/lib/nostr-store';

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
const PROFILE_AGGREGATORS = ['wss://purplepag.es'];

let extraRelays: string[] = [];
export function setProfileTestRelays(relays: string[]): void { extraRelays = relays; }

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
    sharedCoalescer.enqueue({
      filters: [{ kinds: [0], authors: [partner], limit: 1 }],
      relays: [...PROFILE_AGGREGATORS, ...extraRelays],
      onEvent: (event: NostrEvent) => {
        if (event.kind !== 0 || event.pubkey !== partner) return;
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
