/**
 * The bridge: publish. Values the code in
 * `services/nostr-bridge/publish/publish-round.ts` reads, kept here so every
 * reader imports the one copy.
 */

export const PUBLISH_TIMED_OUT = 'publish timed out';

/**
 * Once one relay has accepted an event, how much longer a publish waits for
 * the other targets that are up but have not answered yet. The hub keeps
 * delivering to them in the background; the caller just stops waiting.
 */
export const PUBLISH_STRAGGLER_GRACE_MS = 2000;
