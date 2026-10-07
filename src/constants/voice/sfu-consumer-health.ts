/**
 * Voice: sfu consumer health. Values the code in
 * `services/voice/sfu-consumer-health.ts` reads, kept here so every reader
 * imports the one copy.
 */

/** How often the stale-consumer watchdog polls `consumer.getStats()`. */
export const STALE_CHECK_INTERVAL_MS = 5_000;

/**
 * A non-paused consumer whose `bytesReceived` has been frozen for this
 * long is treated as wedged: we close it and re-issue `consume`. 12 s
 * comfortably outlasts a normal jitter pause and the warm-up grace
 * window below, while still recovering well before the user notices.
 */
export const STALE_TIMEOUT_MS = 12_000;

/**
 * After `consume` succeeds the consumer needs ICE to nominate, DTLS to
 * finish, and the first keyframe to arrive, typically <1 s but can be
 * longer on lossy links. Skip the staleness check for this many ms
 * after the consumer is first surfaced so warm-up isn't misdiagnosed.
 */
export const STALE_WARMUP_MS = 3_000;
