/**
 * Mesh failure-mode handlers — small primitives the VoiceClient and
 * Peer wrap their publishes / lifecycle in.
 *
 *  - `withRateLimitBackoff` — exponential backoff on publish failure. Most
 *    relays send `OK ... false "rate-limit:..."` when our beacon cadence
 *    exceeds their per-pubkey ceiling. The publish wrapper detects that
 *    string in the rejection, sleeps, and retries up to `maxAttempts`
 *    times. The metrics surface counts hits and total backoff so the
 *    debug overlay can report relay throttling at a glance.
 *  - `installBeforeUnloadHandler` — registers a `beforeunload` listener
 *    that gives the active VoiceClient a synchronous chance to fire
 *    its goodbye sequence (control-channel `bye`, relay `bye`, mediasoup
 *    cleanup) so the other side learns within ~10 ms instead of waiting
 *    for the data-channel heartbeat or relay-side beacon expiry.
 */
import type { VoiceMetrics } from './metrics';

/** Heuristic match on relay rejection text — covers nostr-rs-relay,
 *  strfry, nip-29 reference impl. We accept any error message containing
 *  `rate-limit` or `slow down`; both are widely used. */
function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return lower.includes('rate-limit') || lower.includes('rate limit') || lower.includes('slow down');
}

export interface BackoffOptions {
  metrics: VoiceMetrics;
  /** Default schedule: 1s, 2s, 4s, 8s with ±25% jitter. Capped at 8s. */
  delaysMs?: number[];
  /** Optional sleep override for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Optional onGiveUp — called once after the last attempt. */
  onGiveUp?: (lastError: unknown) => void;
}

const DEFAULT_DELAYS = [1000, 2000, 4000, 8000];

function jitter(ms: number): number {
  const j = ms * 0.25;
  return Math.max(50, Math.round(ms + (Math.random() * 2 - 1) * j));
}

/**
 * Run `fn` with exponential-backoff retry on rate-limit-shaped errors.
 * Non-rate-limit errors are re-thrown immediately — those are real
 * failures the caller wants to see (signing, encoding, network down).
 *
 * Resolves to `fn`'s return value, or rejects with the last error if
 * every attempt fails.
 */
export async function withRateLimitBackoff<T>(
  fn: () => Promise<T>,
  opts: BackoffOptions,
): Promise<T> {
  const delays = opts.delaysMs ?? DEFAULT_DELAYS;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err)) throw err;
      opts.metrics.rateLimit.hit++;
      if (attempt === delays.length) break;
      const delay = jitter(delays[attempt]);
      opts.metrics.rateLimit.backoffMs += delay;
      await sleep(delay);
    }
  }
  opts.onGiveUp?.(lastErr);
  throw lastErr;
}

export interface UnloadHandlerHandle {
  /** Call to deregister the listener before reuse — leave() does this. */
  uninstall(): void;
}

export interface UnloadHandlerOptions {
  /** Synchronous goodbye. Should fire control-channel byes + a final relay
   *  publish via `navigator.sendBeacon` if available. Async work is best-
   *  effort; the browser may freeze the page before any pending promises
   *  resolve. */
  onUnload: () => void;
}

/**
 * Register a `beforeunload` listener that calls `onUnload` once. Idempotent
 * — calling `uninstall` then re-installing is safe. SSR-safe: returns a
 * no-op handle when `window` is undefined.
 */
export function installBeforeUnloadHandler(opts: UnloadHandlerOptions): UnloadHandlerHandle {
  if (typeof window === 'undefined') {
    return { uninstall: () => {} };
  }
  let fired = false;
  const handler = () => {
    if (fired) return;
    fired = true;
    try { opts.onUnload(); } catch (err) {
      console.warn('[voice] beforeunload handler threw', err);
    }
  };
  window.addEventListener('beforeunload', handler);
  // pagehide fires more reliably on iOS Safari and on bfcache navigation;
  // belt-and-braces — mark fired so we don't double-trigger.
  window.addEventListener('pagehide', handler);
  return {
    uninstall: () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('pagehide', handler);
    },
  };
}
