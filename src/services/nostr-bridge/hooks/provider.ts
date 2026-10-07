/**
 * The bridge's React context and the hooks around it. `<BridgeProvider>`
 * (`../provider.tsx`) fills the context with `useProvidedBridge`; the hooks
 * under `hooks/` and the React files read it.
 *
 * One instance per page, still: the provider does not create a second
 * bridge, it adopts the page bridge `getBridge()` creates (or registers the
 * fake a test hands it), so React code and the non-React callers of
 * `getBridge()` / `getBridgeImpl()` always see the same object.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getBridge, getBridgeImpl, registerBridge, unregisterBridge, type BridgeImpl } from '../facade/client';

export interface BridgeContextValue {
  /**
   * The page bridge, once its `initialize()` has settled (which is when the
   * hooks used to subscribe, and still do). `null` during SSR and until
   * then. An injected bridge is here from the first render.
   */
  readonly bridge: BridgeImpl | null;
  /** `initialize()` has settled: the stored session was restored, or there was none. */
  readonly ready: boolean;
}

/**
 * Outside any provider there is no bridge, ever: the hooks answer their
 * initial value and `useBridge()` answers `null`. Nothing creates a bridge
 * on behalf of a component; a route whose components use the bridge mounts
 * `<BridgeProvider>` (see `tests/bridge-in-react-files.test.ts`).
 */
const NO_PROVIDER: BridgeContextValue = { bridge: null, ready: false };

export const BridgeContext = createContext<BridgeContextValue>(NO_PROVIDER);

/** Internal to the bridge: the raw context, for `useSubscription` and the hooks here. */
export function useBridgeContext(): BridgeContextValue {
  return useContext(BridgeContext);
}

/**
 * The bridge for imperative use in handlers and effects: the provider's
 * instance. `null` until the bridge is ready, and always outside a provider.
 * An effect that needs it lists it in its dependencies, so it runs again
 * when the bridge arrives.
 */
export function useBridge(): BridgeImpl | null {
  return useBridgeContext().bridge;
}

/** `true` once the page bridge has finished `initialize()`. Always `false` outside a provider. */
export function useBridgeReady(): boolean {
  return useBridgeContext().ready;
}

/**
 * A stable `() => Promise<BridgeImpl>` that resolves with the provider's
 * bridge, at once when it is there and otherwise when it arrives. For a
 * callback that may run before the bridge has started (a deep link parsed
 * in a mount effect) and would otherwise have reached for `getBridge()`.
 * Outside a provider the promise never settles, the same answer the hooks
 * give there.
 */
export function useAwaitBridge(): () => Promise<BridgeImpl> {
  const { bridge } = useBridgeContext();
  const latest = useRef<{ bridge: BridgeImpl | null; waiting: Array<(b: BridgeImpl) => void> }>({
    bridge,
    waiting: [],
  });
  useEffect(() => {
    latest.current.bridge = bridge;
    if (bridge) for (const resolve of latest.current.waiting.splice(0)) resolve(bridge);
  }, [bridge]);
  return useCallback(() => {
    const now = latest.current.bridge;
    return now ? Promise.resolve(now) : new Promise<BridgeImpl>((resolve) => latest.current.waiting.push(resolve));
  }, []);
}

/**
 * The provider's state. With `injected` (tests): that object is the bridge,
 * registered in the page slot during the first render, before any child
 * renders, so a child's effect calling `getBridge()` or `getBridgeImpl()`
 * (effects run child first) finds the fake rather than building a real
 * bridge; it is unregistered on unmount. Without it (the app): the page
 * bridge is adopted once `getBridge()` settles and is never disposed or
 * unregistered here, since it lives as long as the page (Strict Mode runs
 * this effect twice in development; disposing would re-initialize it).
 * Construction only ever happens in the effect, never during a server render.
 */
export function useProvidedBridge(injected: BridgeImpl | undefined, injectedReady: boolean): BridgeContextValue {
  useState(() => {
    if (injected) registerBridge(injected);
    return null;
  });
  const [adopted, setAdopted] = useState<BridgeImpl | null>(null);

  useEffect(() => {
    if (injected) {
      registerBridge(injected);
      return () => unregisterBridge(injected);
    }
    let live = true;
    const adopt = () => {
      const instance = getBridgeImpl();
      if (!live || !instance) return;
      registerBridge(instance);
      setAdopted(instance);
    };
    getBridge().then(adopt, adopt);
    return () => {
      live = false;
    };
  }, [injected]);

  const bridge = injected ?? adopted;
  const ready = injected ? injectedReady : adopted !== null;
  return useMemo(() => ({ bridge, ready }), [bridge, ready]);
}
