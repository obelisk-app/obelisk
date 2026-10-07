/**
 * Identity: nip05 verify. Values the code in
 * `services/identity/nip05-verify.ts` reads, kept here so every reader imports
 * the one copy.
 */

/** Upper bound on cached (pubkey, identifier) pairs. */
export const NIP05_CACHE_MAX = 500;

/** How long a positive result is trusted before re-checking. */
export const NIP05_VERIFIED_TTL_MS = 60 * 60 * 1000;

/** How long a negative result is remembered. Shorter: outages are transient. */
export const NIP05_UNVERIFIED_TTL_MS = 10 * 60 * 1000;

/** A domain that never answers must not pin the UI in `checking`. */
export const NIP05_FETCH_TIMEOUT_MS = 5000;
