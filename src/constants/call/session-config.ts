/**
 * Call: session config. Values the code in `services/call/session-config.ts`
 * reads, kept here so every reader imports the one copy.
 */

/** Rebuilds the caller attempts before a call that never connected gives up. */
export const MAX_REBUILDS = 4;

/** How long a connected call may stay down before it is ended. */
export const RECONNECT_GIVE_UP_MS = 30_000;

/** A call that hasn't connected this long after the rendezvous is given up. */
export const CONNECT_DEADLINE_MS = 40_000;
