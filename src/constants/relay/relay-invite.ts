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

/** One more try for a claim the relay called `stale` or never answered, after this pause. */
export const RELAY_INVITE_RETRY_DELAY_MS = 1500;

/** How long a minter API request may take before it counts as failed. */
export const RELAY_INVITE_API_TIMEOUT_MS = 10_000;

/**
 * HTTP answers that mean the relay has no invite API at all (any relay but
 * obelisk-relay). A definitive answer, cached like a success.
 */
export const RELAY_INVITE_NO_API_STATUSES: ReadonlyArray<number> = [404, 405, 501];

/** People the owner, admins and reference accounts may bring in, in total, from the apps. */
export const RELAY_INVITE_AUTO_ALLOWANCE = 10;

/** The longest link the automatic allowance may make: 30 days. */
export const RELAY_INVITE_AUTO_MAX_TTL_SECS = 30 * 24 * 60 * 60;

/** The create form's default lifetime, in days (`RELAY_INVITE_DEFAULT_TTL_SECS`). */
export const RELAY_INVITE_DEFAULT_DAYS = 7;

/** The relay keeps labels up to this many characters. */
export const RELAY_INVITE_LABEL_MAX = 80;
