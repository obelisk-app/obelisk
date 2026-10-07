/**
 * The bridge: relay. Values the code in
 * `services/nostr-bridge/relay/background-watch.ts`,
 * `services/nostr-bridge/relay/relay-list.ts` reads, kept here so every reader
 * imports the one copy.
 */

/** How many non-active relays stay watched. */
export const BACKGROUND_RELAY_LIMIT = 3;

/** MRU length: the active relay plus the watched ones. */
export const RECENT_RELAY_CAP = BACKGROUND_RELAY_LIMIT + 1;

/** How far back a (re)opened watch looks, at most. */
export const BACKGROUND_LOOKBACK_S = 7 * 24 * 3600;

/** Backoff before reopening a stream the hub gave up on. */
export const BACKGROUND_RETRY_MS = 30_000;

export const DEFAULT_RELAY = 'wss://public.obelisk.ar';

export const LACRYPTA_RELAY = 'wss://lacrypta-relay.obelisk.ar';

export const RETIRED_RELAY = 'wss://relay.obelisk.ar';

export const DEFAULT_RELAYS = [DEFAULT_RELAY, LACRYPTA_RELAY];
