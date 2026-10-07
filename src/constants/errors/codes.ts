/**
 * Errors: codes. Values the code in `utils/errors/codes.ts` reads, kept here
 * so every reader imports the one copy.
 */

/** One per message under `codes` in errors.json. */
export const ERROR_CODES = [
  'not-logged-in', 'not-ready', 'offline', 'no-relays-connected',
  'extension-missing', 'extension-no-nip04', 'extension-no-nip44', 'signer-no-nip44',
  'signer-unsupported', 'pq-unavailable', 'signer-timeout', 'signer-reset',
  'publish-rejected', 'publish-timeout', 'auth-refused', 'not-whitelisted', 'relay-error',
  'invalid-relay-url', 'dms-off', 'files-need-nip17', 'search-timeout', 'own-packs-only',
  'profile-load-failed', 'profile-lookup-timeout', 'mute-list-load-failed',
  'invalid-bunker-url', 'bunker-missing-secret', 'bunker-no-session', 'nostrconnect-cancelled',
  'call-relay-failed', 'game-unconfirmed',
  // A Nostr Wallet Connect wallet (`src/lib/nwc`, whose `NwcErrorCode` is this subset).
  'nwc-invalid-uri', 'nwc-unreachable', 'nwc-cannot-pay', 'wallet-timeout', 'wallet-relay-failed',
  'wallet-rate-limited', 'wallet-not-supported', 'wallet-insufficient-balance', 'wallet-quota-exceeded',
  'wallet-restricted', 'wallet-unauthorized', 'wallet-payment-failed', 'wallet-failed',
] as const;

/** What an activity-log entry from the bridge carries as its `label`; one per group under `activity` in errors.json. */
export const ACTIVITY_CODES = [
  'signExtension', 'signBunker', 'signLocal', 'publish', 'connect', 'reconnect', 'relayAuth',
  'bunkerConnect', 'bunkerScan',
] as const;

/** What an activity-log entry carries as its `description`: the event kind, named. One per key under `kinds` in errors.json but `number`. */
export const EVENT_KIND_LABELS = [
  'relayAuth', 'message', 'dm', 'groupMetadata', 'groupAdmins', 'groupMembers', 'reaction',
  'appData', 'relayList', 'event',
] as const;
