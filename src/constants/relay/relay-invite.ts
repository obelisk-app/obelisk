/**
 * Relay invitation codes: the values `services/relay/relay-invite.ts` and
 * `utils/relay/relay-invite.ts` read. Protocol: obelisk-relay
 * `docs/relay-invites.md`; client flow: `docs/features/relay-invites.md`.
 */

/**
 * The pending invite, kept apart from the session record on purpose: logging
 * out or making a new key must not lose it, because the next key is redeemed
 * with the same code.
 */
export const RELAY_INVITE_KEY = 'obelisk-dex/relay-invite';

/** Every invite refusal from obelisk-relay starts with this, then a reason word. */
export const RELAY_INVITE_REFUSAL_PREFIX = 'restricted: invite ';

/** Reasons that mean the code will never work again; the stored invite is dropped. */
export const RELAY_INVITE_DEAD_REASONS = ['unknown', 'revoked', 'expired', 'exhausted', 'inactive'] as const;

/** The relay's minter API, relative to its HTTP origin. */
export const RELAY_INVITE_API_PATH = '/api/invites';

/** Upper bound on a code read from a link; real codes are 20 characters. */
export const RELAY_INVITE_CODE_MAX = 64;

/** How long the claim waits for the relay's OK. */
export const RELAY_INVITE_CLAIM_TIMEOUT_MS = 8000;

/** Default lifetime asked for a code minted from settings: 7 days. */
export const RELAY_INVITE_DEFAULT_TTL_SECS = 7 * 24 * 60 * 60;
