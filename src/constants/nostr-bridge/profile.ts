/**
 * The bridge: profile. Values the code in
 * `services/nostr-bridge/profile/profile-sync-cache.ts` reads, kept here so
 * every reader imports the one copy.
 */

import { LACRYPTA_RELAY } from '@/constants/nostr-bridge/relay';

// Quiet outbox/profile relays for bounded kind:0 metadata lookups. Keep this
// list intentionally small: normal channel browsing must not open persistent
// subscriptions against broad public profile relays.
export const DEFAULT_PROFILE_LOOKUP_RELAYS = [
  LACRYPTA_RELAY,
  'wss://public.obelisk.ar',
  'wss://purplepag.es',
] as const;

export const PROFILE_RELAYS = DEFAULT_PROFILE_LOOKUP_RELAYS;

export const PROFILE_SYNC_CACHE_KEY = 'obelisk/profile-sync-cache/v1';

export const PROFILE_SYNC_STATE_KEY = 'obelisk/profile-sync-state/v1';

export const PROFILE_LOOKUP_RELAYS_KEY = 'obelisk/profile-lookup-relays/v1';

export const OWN_PROFILE_LOOKUP_TTL_MS = 12 * 60 * 60 * 1000;

export const OTHER_PROFILE_LOOKUP_TTL_MS = 6 * 60 * 60 * 1000;

export const PROFILE_LOOKUP_MAX_WAIT_MS = 3500;

/**
 * Hard cap on cached kind-0 events. `lookupExternalUserMetadata` funnels
 * EVERY profile the UI ever renders (message authors, member lists,
 * popovers, DM peers) through {@link setCachedKind0}, and full signed
 * events are ~0.5–2KB each: unbounded, this single key grew to megabytes
 * and pushed the origin's localStorage over quota. 300 entries keeps the
 * blob under ~500KB while still covering every profile a heavy account
 * sees in a session. Evicting the own profile is self-healing:
 * `syncOwnProfileToActiveRelay` re-fetches on a cache miss.
 */
export const PROFILE_SYNC_CACHE_LIMIT = 300;
