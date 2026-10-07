/**
 * Call: signal outbox. Values the code in `services/call/signal-outbox.ts`
 * reads, kept here so every reader imports the one copy.
 */

/** Coalescing window for outbound messages and acks. */
export const FLUSH_MS = 40;

/** Re-send an unacknowledged message after this long. */
export const RESEND_MS = 1200;

/** Give up on a message after this many sends (~12 s). */
export const MAX_ATTEMPTS = 10;
