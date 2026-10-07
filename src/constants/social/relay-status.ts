/**
 * Social: relay status. Values the code in `services/social/relay-status.ts`
 * reads, kept here so every reader imports the one copy.
 */

/** Long enough to ride out a reconnect, short enough to still feel live. */
export const FAILURE_SOAK_MS = 4000;
