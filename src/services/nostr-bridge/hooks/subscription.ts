/**
 * The one shape every bridge hook has: subscribe on mount (once the bridge
 * is there), replay the latest value, unsubscribe on unmount.
 *
 * Where the bridge comes from: `<BridgeProvider>` (the layouts of `/app` and
 * of the public routes that use the bridge, or a test's `renderWithBridge`),
 * so the hook subscribes as soon as the provider has it. Outside a provider
 * there is no bridge and the hook answers `initial` for as long as it is
 * mounted; it never creates one.
 *
 * A value belongs to the bridge and the inputs (`deps`) it was delivered
 * for. When the inputs change (channel A to channel B), the hook answers
 * `initial` until the new subscription replays, and never the previous
 * inputs' value: the old effect's value would otherwise paint for a frame
 * under the new channel (the stale-channel flash). During a server render
 * and until the bridge is there it answers `initial`.
 */
import { useEffect, useState } from 'react';
import type { BridgeImpl } from '../client';
import { useBridgeContext } from './provider';

interface Delivered<T> {
  readonly key: ReadonlyArray<unknown>;
  readonly value: T;
}

function sameKey(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

export function useSubscription<T>(
  subscribe: (bridge: BridgeImpl, cb: (value: T) => void) => () => void,
  initial: NoInfer<T>,
  deps: ReadonlyArray<unknown> = [],
): T {
  const { bridge } = useBridgeContext();
  const key = [bridge, ...deps];
  const [delivered, setDelivered] = useState<Delivered<T>>(() => ({ key, value: initial }));
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    const attach = (b: BridgeImpl) => {
      if (cancelled) return;
      unsub = subscribe(b, (value) => {
        // Same value for the same bridge and inputs: keep the state object,
        // so a replay does not re-render.
        setDelivered((prev) => (prev.value === value && sameKey(prev.key, key) ? prev : { key, value }));
      });
    };
    if (bridge) attach(bridge);
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, key);
  return sameKey(delivered.key, key) ? delivered.value : initial;
}
