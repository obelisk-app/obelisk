/**
 * The bridge: session. Values the code in
 * `services/nostr-bridge/session/bunker.ts`,
 * `services/nostr-bridge/session/reset.ts`,
 * `services/nostr-bridge/session/session-storage.ts`,
 * `services/nostr-bridge/session/signer-queue.ts`,
 * `services/nostr-bridge/session/vault.ts` reads, kept here so every reader
 * imports the one copy.
 */

import { SESSION_IDENTITY_ID, type Identity } from '@nostr-wot/relay/hub';

export const BUNKER_AUTH_SIGNATURE_TIMEOUT_MS = 45_000;

/** The hub identity before login and after logout: its sockets never answer a challenge. */
export const ANONYMOUS_IDENTITY: Identity = { id: SESSION_IDENTITY_ID, pubkey: null, signer: null, authPolicy: 'auth-when-challenged' };

export const STORAGE_KEY = 'obelisk-dex/session';

export const RELAYS_KEY = 'obelisk-dex/relays';

export const LEGACY_STORAGE_KEY = 'obeliskord/session';

export const LEGACY_RELAYS_KEY = 'obeliskord/relays';

/**
 * How many signer requests may be outstanding at once. See the module doc:
 * this is the bound on how long an interactive request waits behind
 * background work, not a throughput knob.
 */
export const MAX_IN_FLIGHT = 1;

/**
 * The keys `@nostr-wot/ui`'s login widget writes through its default,
 * plaintext `localStorageSignerStorage`: the NIP-46 pairing record (with the
 * client nsec the bunker authorised) and a "remembered" nsec. Copied rather
 * than imported so the bridge does not pull the UI package in;
 * `tests/services/nostr-bridge/session/vault.test.ts` pins them to the SDK's
 * own `SIGNER_STORAGE_KEY_*` exports.
 */
export const SDK_SIGNER_STORAGE_KEYS = ['@nostr-wot/ui:nip46', '@nostr-wot/ui:nsec'] as const;
