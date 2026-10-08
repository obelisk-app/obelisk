export interface UserHit {
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
}

export const SEARCH_DEBOUNCE_MS = 250;

/**
 * NIP-50 search isn't universally supported; query a couple of indexers in
 * parallel so a flaky single relay doesn't silently kill the whole feature.
 *
 * These are deliberately *not* the active relay: this is profile discovery
 * (kind 0), the same category as `DEFAULT_PROFILE_LOOKUP_RELAYS` in the
 * bridge, not group data. The single-relay rule in CLAUDE.md scopes group
 * traffic; profile lookups have always been allowed to fan out. They are
 * also not all equally healthy (measured 2026-09-17): `search.nos.today`
 * answered in ~900ms, `relay.noswhere.com` EOSE'd instantly with an empty
 * index, and `relay.nostr.band` errored after ~10s.
 */
export const NIP50_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.noswhere.com',
  'wss://search.nos.today',
];

/**
 * Deliberately short. `useNostrQuery` resolves only when *every* relay
 * EOSEs, so the slowest (or dead) relay sets the floor, and its cleanup
 * marks the query cancelled without closing the subscription, so a long
 * timeout also means a long-lived orphaned REQ per keystroke. Capping this
 * bounds both the spinner and the leak. Upstream fix belongs in
 * `@nostr-wot/data`.
 */
export const QUERY_TIMEOUT_MS = 3500;

export const NIP05_RE = /^([a-z0-9._-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i;

