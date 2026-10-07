/**
 * Where the app keeps the signed-in account in this browser, as the
 * marketing pages read it without loading the Nostr bridge.
 *
 * The three storage keys are copied rather than imported: code outside the
 * bridge may only enter it through `@/services/nostr-bridge`, which is the
 * whole bridge. `tests/hooks/marketing/useSavedAccount.test.tsx` pins each
 * copy to the bridge's own export, so they cannot drift apart.
 */
export const SESSION_KEY = 'obelisk-dex/session';
export const LEGACY_SESSION_KEY = 'obeliskord/session';
export const PROFILE_CACHE_KEY = 'obelisk/profile-sync-cache/v1';
