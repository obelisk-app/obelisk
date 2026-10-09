/**
 * Voice: transport core. Values the code in `services/voice/transport-core.ts`
 * reads, kept here so every reader imports the one copy.
 */

export const PRESENCE_TTL_SECONDS = 150;

/** Keep expiry pruning responsive independently of the publish lease. */
export const PRESENCE_SWEEP_MS = 10_000;
