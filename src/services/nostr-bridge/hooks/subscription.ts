/**
 * The one shape every bridge hook has: subscribe on mount (once the bridge
 * singleton exists), replay the latest value, unsubscribe on unmount.
 *
 * A value belongs to the inputs (`deps`) it was delivered for. When the
 * inputs change (channel A to channel B), the hook answers `initial` until
 * the new subscription replays, and never the previous inputs' value: the
 * old effect's value would otherwise paint for a frame under the new
 * channel (the stale-channel flash).
 */
import { useEffect, useState } from 'react';
import { getBridge } from '../client';

interface Delivered<T> {
  readonly deps: ReadonlyArray<unknown>;
  readonly value: T;
}

function sameDeps(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

export function useSubscription<T>(
  subscribe: (
    bridge: Awaited<ReturnType<typeof getBridge>>,
    cb: (value: T) => void,
  ) => () => void,
  initial: NoInfer<T>,
  deps: ReadonlyArray<unknown> = [],
): T {
  const [delivered, setDelivered] = useState<Delivered<T>>(() => ({ deps, value: initial }));
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    getBridge().then((bridge) => {
      if (cancelled) return;
      unsub = subscribe(bridge, (value) => {
        // Same value for the same inputs: keep the state object, so a replay
        // does not re-render.
        setDelivered((prev) => (prev.value === value && sameDeps(prev.deps, deps) ? prev : { deps, value }));
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return sameDeps(delivered.deps, deps) ? delivered.value : initial;
}
