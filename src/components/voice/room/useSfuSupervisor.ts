'use client';

/**
 * The SFU supervisor for `voice-sfu` channels: publish kind 25052 `start`,
 * arm a watchdog for the SFU's beacon, retry with backoff, republish when
 * the topology drops back (the room bumps `republishCounter`).
 */
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { ensureSfuRoomStarted } from '@/services/voice/sfu-control';
import type { SfuStatus } from './header';

export function useSfuSupervisor({ active, expectSfu, channelId, republishCounter, setSfuStatus }: {
  /** Gate resolved to `ready` and the user has joined. */
  active: boolean;
  expectSfu: boolean;
  channelId: string;
  /** Incremented by the room when `onTopologyChange(null)` follows a connected SFU. */
  republishCounter: number;
  setSfuStatus: Dispatch<SetStateAction<SfuStatus>>;
}): void {
  // SFU supervisor - owns the publish/retry/republish lifecycle for
  // `voice-sfu` channels. Re-runs whenever the user joins, the channel
  // kind flips to voice-sfu, or the topology drops back to mesh
  // (signaled by `sfuRepublishCounter`).
  //
  // Lifecycle for one supervisor invocation:
  //   1. Publish kind 25052 `start` (rate-limited on first attempt;
  //      forced on retries / republishes so a brief SFU outage isn't
  //      stranded by the cooldown).
  //   2. Arm an 8 s watchdog. The SFU's `["sfu","1"]` beacon flips
  //      `onTopologyChange` to 'connected', which clears state via
  //      a separate path. If the watchdog fires while still 'starting'
  //      we retry up to MAX_ATTEMPTS times with linear backoff before
  //      giving up with 'unauthorized'.
  //   3. If discovery returns no SFU we set 'unavailable' and try
  //      again every UNAVAILABLE_RETRY_MS - an SFU coming online later
  //      should heal the channel without a rejoin.
  //
  // The `onTopologyChange` handler is the inbound signal:
  //   - sfu === <pubkey>  → setSfuStatus('connected') (no work here)
  //   - sfu === null after being connected → bumps republish counter,
  //     this effect re-runs with `force` semantics already baked in.
  useEffect(() => {
    if (!active) return;
    if (!expectSfu) {
      setSfuStatus('na');
      return;
    }
    let cancelled = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 3;
    const SFU_JOIN_WATCHDOG_MS = 25000;
    const RETRY_BACKOFF_MS = [5000, 10000];
    const UNAVAILABLE_RETRY_MS = 15000;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let retryDelay: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      if (retryDelay) { clearTimeout(retryDelay); retryDelay = null; }
    };

    const tryStart = async (force: boolean) => {
      if (cancelled) return;
      clearTimers();
      // Don't drop a 'connected' label back to 'starting' while we
      // republish in the background - the topology event will flip it
      // if the SFU actually disappeared.
      setSfuStatus((prev) => (prev === 'connected' ? prev : 'starting'));
      let sfuPubkey: string | null = null;
      try {
        sfuPubkey = await ensureSfuRoomStarted(channelId, undefined, { force });
      } catch (err) {
        console.warn('[voice] ensureSfuRoomStarted threw', err);
      }
      if (cancelled) return;
      if (!sfuPubkey) {
        console.warn('[voice] no sfu available, mesh fallback; retrying in',
          UNAVAILABLE_RETRY_MS / 1000, 's');
        setSfuStatus((prev) => (prev === 'connected' ? prev : 'unavailable'));
        retryDelay = setTimeout(() => { void tryStart(true); }, UNAVAILABLE_RETRY_MS);
        return;
      }
      console.log('[voice] sfu start published target=', sfuPubkey.slice(0, 8),
        'attempt=', attempt + 1);
      watchdog = setTimeout(() => {
        if (cancelled) return;
        // If the topology callback already flipped us to 'connected', abort
        // the retry loop entirely. Republishing kind 25052 while a session
        // is up makes the SFU reset peer state and kicks the live call.
        setSfuStatus((prev) => {
          if (prev === 'connected') return prev;
          attempt += 1;
          if (attempt < MAX_ATTEMPTS) {
            const delay = RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)];
            console.warn('[voice] sfu beacon never arrived; retrying in', delay / 1000,
              's, attempt', attempt + 1, '/', MAX_ATTEMPTS);
            retryDelay = setTimeout(() => { void tryStart(true); }, delay);
            return prev;
          }
          console.warn('[voice] sfu start gave up after', MAX_ATTEMPTS, 'attempts');
          return 'unauthorized';
        });
      }, SFU_JOIN_WATCHDOG_MS);
    };

    // First entry uses force=false (cheap rate-limit); republish
    // counter changes always force (they're recovery signals).
    void tryStart(republishCounter > 0);
    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [active, expectSfu, channelId, republishCounter, setSfuStatus]);
}
