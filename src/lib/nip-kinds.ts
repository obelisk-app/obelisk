/**
 * Named constants for the Nostr event kinds Obelisk publishes and consumes.
 * Centralizing these here prevents typos (the numbers look alike — 1059 vs
 * 1069 is a silent bug) and gives each kind a single place to document the
 * NIP spec it comes from.
 *
 * Keep this file the single source of truth — grep `event.kind = \d` should
 * only turn up matches inside this module.
 */

/** NIP-01 — user metadata (profile). */
export const KIND_METADATA = 0;

/** NIP-01 — short text note. */
export const KIND_TEXT_NOTE = 1;

/** NIP-04 — legacy encrypted direct message. Deprecated in favor of NIP-17. */
export const KIND_ENCRYPTED_DM = 4;

/** NIP-17 — private message rumor (the inner unsigned event inside a 1059 gift wrap). */
export const KIND_DM_RUMOR = 14;

/** NIP-65 — relay list metadata (user's preferred relays). */
export const KIND_RELAY_LIST = 10002;

/** NIP-17 — DM inbox relays. */
export const KIND_DM_INBOX_RELAYS = 10050;

/** NIP-59 — gift-wrapped event, transport for NIP-17 DMs. */
export const KIND_GIFT_WRAP = 1059;

/** NIP-46 — Nostr Connect request/response (bunker signer protocol). */
export const KIND_NOSTR_CONNECT = 24133;

/** BUD-01 — Blossom auth event for media server uploads. */
export const KIND_BLOSSOM_AUTH = 24242;

/** NIP-98 — HTTP auth event (used by backend challenge/response). */
export const KIND_HTTP_AUTH = 27235;
