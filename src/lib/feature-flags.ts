/**
 * Centralized feature flags. Flip these to hide unfinished features from
 * the UI without ripping out code.
 */

/**
 * DMs are temporarily disabled. NIP-17 inbox relays require a live signer
 * on every page load, and the browser-side signer-restore story still has
 * rough edges (bunker/NostrConnect reload, NIP-42 AUTH edge cases). We
 * keep the code paths in place so the commit history reflects the work
 * done, but the DM icon and all Nostr DM subscriptions are gated off
 * until the signer lifecycle is solid.
 */
export const DM_FEATURE_ENABLED = false;
