/**
 * The bridge: subscriptions. Values the code in
 * `services/nostr-bridge/subscriptions/pinned.ts` reads, kept here so every
 * reader imports the one copy.
 */

/** How long the relay being switched away from keeps its socket, so A -> B -> A costs nothing. */
export const RELAY_SWITCH_GRACE_MS = 60_000;
