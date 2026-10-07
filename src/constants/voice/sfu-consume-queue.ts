/**
 * Voice: sfu consume queue. Values the code in
 * `services/voice/sfu-consume-queue.ts` reads, kept here so every reader
 * imports the one copy.
 */

/**
 * Backoff ladder for `consume` / `resumeConsumer` retries. 4 attempts
 * spread over ~16 s (500 ms, 1.5 s, 4 s, 10 s). Keeps transient SFU recovery bounded without coupling it to mesh internals. Pre-fix every transient failure
 * was logged-and-forgotten: a single dropped `consume` RPC would
 * silently strand a remote track until the user left and rejoined.
 */
export const CONSUME_RETRY_DELAYS_MS = [500, 1500, 4000, 10000] as const;
