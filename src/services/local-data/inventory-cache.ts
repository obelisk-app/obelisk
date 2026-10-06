/**
 * Inventory, part 1: what is cached from the relays (channels, profiles,
 * read positions and alerts, DM settings). All of it can be fetched again;
 * removing it costs a slower next load, not data.
 *
 * The bridge cache (`obelisk-cache-v4/{relay}/{kind}/{id}`) is one prefix
 * split three ways by `when`: kind 0 and 3 entries are profiles, the two
 * read-state d tags are read positions, everything else is channel cache.
 */
import type { LocalDataEntry } from './types';

const BRIDGE_CACHE = 'obelisk-cache-v4/';
/** Kind 0 (profile) and kind 3 (follow list) entries, keyed by a hex pubkey. */
const PROFILE_CACHE_RE = /\/(?:0|3)\/[0-9a-f]{64}$/;
/** The read-state sync cursors (`D_TAG_GROUPS`, `D_TAG_DMS` in `read-state/sync-options.ts`). */
const READ_STATE_CACHE_RE = /\/\d+\/obelisk:(?:dm-)?readstate:v1$/;

export function isProfileCacheKey(key: string): boolean {
  return key.startsWith(BRIDGE_CACHE) && PROFILE_CACHE_RE.test(key);
}

export function isReadStateCacheKey(key: string): boolean {
  return key.startsWith(BRIDGE_CACHE) && READ_STATE_CACHE_RE.test(key);
}

const LS = 'localStorage' as const;

export const CACHE_ENTRIES: ReadonlyArray<LocalDataEntry> = [
  // ---- channels -----------------------------------------------------------
  {
    id: 'bridge-cache', area: LS, key: BRIDGE_CACHE, match: 'prefix', category: 'channels',
    when: (key) => !isProfileCacheKey(key) && !isReadStateCacheKey(key),
    holds: 'Per relay: group metadata, recent messages, reactions, members and admins, relay branding, layout, roles, emoji sets, game logs, the social feed.',
    why: 'Paints the last known state instantly on reload (stale-while-revalidate) instead of an empty shell while the relay answers.',
    perAccount: false, sensitive: false, source: 'src/services/nostr-bridge/cache.ts',
  },
  {
    id: 'bridge-cache-legacy', area: LS, key: 'obelisk-cache-v3/', match: 'prefix', category: 'channels',
    holds: 'An older generation of the bridge cache.', why: 'None any more: evicted on load.',
    perAccount: false, sensitive: false, legacy: true, source: 'src/services/nostr-bridge/cache-keys.ts',
  },
  {
    id: 'bridge-cache-legacy-v2', area: LS, key: 'obelisk-cache-v2/', match: 'prefix', category: 'channels',
    holds: 'An older generation of the bridge cache.', why: 'None any more: evicted on load.',
    perAccount: false, sensitive: false, legacy: true, source: 'src/services/nostr-bridge/cache-keys.ts',
  },
  {
    id: 'bridge-cache-legacy-v1', area: LS, key: 'obelisk-cache/', match: 'prefix', category: 'channels',
    holds: 'The first generation of the bridge cache.', why: 'None any more: evicted on load.',
    perAccount: false, sensitive: false, legacy: true, source: 'src/services/nostr-bridge/cache-keys.ts',
  },
  {
    id: 'relay-info', area: LS, key: 'obelisk:relay-info-v3', match: 'exact', category: 'channels',
    holds: 'NIP-11 documents of the relays visited: name, icon, operator, limits.',
    why: 'Avoids refetching every relay document on every page load.',
    perAccount: false, sensitive: false, source: 'src/services/relay-info.ts',
  },
  {
    id: 'relay-info-legacy', area: LS, key: 'obelisk:relay-info-v2', match: 'exact', category: 'channels',
    holds: 'The previous relay-info cache.', why: 'None any more.',
    perAccount: false, sensitive: false, legacy: true, source: 'src/services/relay-info.ts',
  },
  {
    id: 'recent-relays', area: LS, key: 'obelisk-dex/recent-relays/', match: 'prefix', category: 'channels',
    holds: 'The relays this account used most recently.',
    why: 'Picks the three relays the background watch listens on for mentions.',
    perAccount: true, sensitive: true, source: 'src/services/nostr-bridge/background-watch.ts',
  },
  // ---- profiles -----------------------------------------------------------
  {
    id: 'bridge-cache-profiles', area: LS, key: BRIDGE_CACHE, match: 'prefix', category: 'profiles',
    when: isProfileCacheKey,
    holds: 'Kind 0 profiles and kind 3 follow lists, per relay and for the social tier.',
    why: 'Names and pictures show at once instead of as raw keys.',
    perAccount: false, sensitive: false, source: 'src/services/nostr-bridge/profiles.ts',
  },
  {
    id: 'profile-sync-cache', area: LS, key: 'obelisk/profile-sync-cache/v1', match: 'exact', category: 'profiles',
    holds: 'The bridge kind 0 cache as one blob.', why: 'Seeds profiles before any relay answers.',
    perAccount: false, sensitive: false, source: 'src/services/nostr-bridge/profile-sync-cache.ts',
  },
  {
    id: 'profile-sync-state', area: LS, key: 'obelisk/profile-sync-state/v1', match: 'exact', category: 'profiles',
    holds: 'When each profile was last refreshed.', why: 'Refreshes stale profiles only.',
    perAccount: false, sensitive: false, source: 'src/services/nostr-bridge/profile-sync-cache.ts',
  },
  {
    id: 'profile-lookup-relays', area: LS, key: 'obelisk/profile-lookup-relays/v1', match: 'exact', category: 'profiles',
    holds: 'An override for the relays profiles are looked up on (read, not written by today\'s code).',
    why: 'Lets a device keep a custom lookup list.',
    perAccount: false, sensitive: false, source: 'src/services/nostr-bridge/profile-lookup.ts',
  },
  {
    id: 'sdk-data-cache', area: LS, key: 'obelisk-social-sdk/', match: 'prefix', category: 'profiles',
    holds: 'The @nostr-wot/data TTL cache under the namespace the social pool configures.',
    why: 'Profiles, relay lists and notes for the feed. configurePersistence is a no-op in the SDK build the app loads, so nothing is written here today.',
    perAccount: false, sensitive: false, legacy: true, source: 'src/services/social/pool.ts',
  },
  {
    id: 'sdk-data-cache-default', area: LS, key: 'nostr-wot-sdk:', match: 'prefix', category: 'profiles',
    holds: 'The @nostr-wot/data TTL cache under its default namespace.',
    why: 'Written only by SDK getters the app does not call; listed so a device that has it is cleaned.',
    perAccount: false, sensitive: false, legacy: true, source: 'node_modules/@nostr-wot/data',
  },
  // ---- read positions, unread counts and alerts ---------------------------
  {
    id: 'read-state', area: LS, key: 'obelisk-read-state:', match: 'prefix', category: 'readState',
    holds: 'Read cursors per channel and per DM peer, and when the inbox was last read.',
    why: 'Unread counts and "new since" markers survive a reload. Also synced through relays as encrypted NIP-59 wraps.',
    perAccount: true, sensitive: true, source: 'src/store/read-state.ts',
  },
  {
    id: 'read-state-base', area: LS, key: 'obelisk-read-state', match: 'exact', category: 'readState',
    holds: 'The store\'s unscoped key: written while nobody is logged in, read by nothing.',
    why: 'Where state lived before per-account keys.',
    perAccount: false, sensitive: false, source: 'src/store/multi-account.ts',
  },
  {
    id: 'notifications', area: LS, key: 'obelisk-notifications:', match: 'prefix', category: 'readState',
    holds: 'Mention cards per relay, mention cursors, and DM alert cards with up to 280 characters of the decrypted message.',
    why: 'The bell and the phone inbox keep their alerts across reloads.',
    perAccount: true, sensitive: true, source: 'src/store/notifications.ts',
  },
  {
    id: 'notifications-base', area: LS, key: 'obelisk-notifications', match: 'exact', category: 'readState',
    holds: 'The unscoped key of the notifications store.', why: 'See read-state-base.',
    perAccount: false, sensitive: false, source: 'src/store/multi-account.ts',
  },
  {
    id: 'wrap-ledger', area: LS, key: 'obelisk-wrap-ledger:', match: 'prefix', category: 'readState',
    holds: 'Ids of gift wraps already opened (read-state sync and inert DM-inbox wraps).',
    why: 'A reload does not decrypt the whole backlog again (hundreds of signer round trips on a remote signer). Must go with the read-state cursors: kept alone it hides the wraps that would rebuild them.',
    perAccount: true, sensitive: false, source: 'src/services/nostr-bridge/wrap-ledger.ts',
  },
  {
    id: 'bridge-cache-read-state', area: LS, key: BRIDGE_CACHE, match: 'prefix', category: 'readState',
    when: isReadStateCacheKey,
    holds: 'The newest read-state sync payload per relay.', why: 'Seeds cursors before the sync subscription answers.',
    perAccount: false, sensitive: true, source: 'src/services/read-state/sync-ingest.ts',
  },
  {
    id: 'last-seen-legacy', area: LS, key: 'chat:lastSeen:', match: 'prefix', category: 'readState',
    holds: 'Per-channel last-seen anchors from before the read-state store.', why: 'None any more.',
    perAccount: false, sensitive: true, legacy: true, source: 'src/services/reset.ts',
  },
  // ---- direct message settings -------------------------------------------
  {
    id: 'dm-store', area: LS, key: 'obelisk-dm-store:', match: 'prefix', category: 'dms',
    holds: 'Per peer: whether to send NIP-17 or NIP-04. No message text (an old version\'s plaintext is dropped on load).',
    why: 'Keeps a chosen protocol for people whose client needs NIP-04.',
    perAccount: true, sensitive: true, source: 'src/store/dm.ts',
  },
  {
    id: 'dm-store-base', area: LS, key: 'obelisk-dm-store', match: 'exact', category: 'dms',
    holds: 'The unscoped key of the DM store.', why: 'See read-state-base.',
    perAccount: false, sensitive: false, source: 'src/store/multi-account.ts',
  },
];
