/**
 * Keep a watched subscription alive across quota / rate-limit CLOSEs.
 *
 * `subscribeWatched` treats such a CLOSE as final — right for bulk fan-out,
 * where re-issuing would only dig the hole deeper, wrong for a subscription
 * the feature cannot work without (voice roster and signaling). This wraps
 * the opener and reissues it on a slow, capped backoff instead.
 */

/** 5 s → 10 s → 20 s → 60 s, then 60 s forever. */
export const QUOTA_RESUBSCRIBE_DELAYS_MS: readonly number[] = [5_000, 10_000, 20_000, 60_000];

export interface QuotaResubscribeHooks {
  /** Pass as `onQuotaOrRateLimitClose` to the watched subscription. */
  onQuotaOrRateLimitClose: () => void;
  /** Call on any EVENT or EOSE — the relay is serving us again. */
  alive: () => void;
}

export function resubscribeOnQuotaClose(
  open: (hooks: QuotaResubscribeHooks) => () => void,
  opts: {
    /** Fires `true` when a CLOSE takes the sub down, `false` once it serves again. */
    onDegraded?: (degraded: boolean) => void;
    random?: () => number;
  } = {},
): () => void {
  const random = opts.random ?? Math.random;
  let closed = false;
  let generation = 0;
  let attempt = 0;
  let degraded = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: (() => void) | null = null;

  const setDegraded = (next: boolean) => {
    if (degraded === next) return;
    degraded = next;
    opts.onDegraded?.(next);
  };

  const start = () => {
    const gen = ++generation;
    current = open({
      onQuotaOrRateLimitClose: () => {
        if (closed || gen !== generation) return;
        current = null;
        setDegraded(true);
        const base = QUOTA_RESUBSCRIBE_DELAYS_MS[Math.min(attempt, QUOTA_RESUBSCRIBE_DELAYS_MS.length - 1)];
        attempt += 1;
        // ±20% jitter so every client in a call doesn't come back in lockstep.
        const delay = Math.round(base * (0.8 + 0.4 * random()));
        timer = setTimeout(() => {
          timer = null;
          if (!closed) start();
        }, delay);
      },
      alive: () => {
        if (closed || gen !== generation) return;
        attempt = 0;
        setDegraded(false);
      },
    });
  };

  start();
  return () => {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    timer = null;
    current?.();
    current = null;
  };
}
