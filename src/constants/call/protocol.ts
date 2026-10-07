/**
 * Call: protocol. Values the code in `services/call/protocol.ts` reads, kept
 * here so every reader imports the one copy.
 */

/** How old a control message may be and still count. */
export const CALL_MESSAGE_MAX_AGE_S = 60;

/** How long an invite rings before the caller gives up. */
export const CALL_RING_TIMEOUT_MS = 45_000;

export const MAX_CALL_RELAYS = 4;
