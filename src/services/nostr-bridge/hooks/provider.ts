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
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getBridge, getBridgeImpl, registerBridge, unregisterBridge, type BridgeImpl } from '../client';

export interface BridgeContextValue {
  /**
   * The page bridge, once its `initialize()` has settled (which is when the
   * hooks used to subscribe, and still do). `null` during SSR and until
   * then. An injected bridge is here from the first render.
   */
  readonly bridge: BridgeImpl | null;
  /** `initialize()` has settled: the stored session was restored, or there was none. */
  readonly ready: boolean;
  /**
   * `false` only for the default value, i.e. no provider above the caller.
   * The hooks then keep their old path (`getBridge()` in an effect), which
   * the routes without a provider and the suites that mock the client still
   * rely on, until migration step 7 removes it.
   */
  readonly provided: boolean;
}

const NO_PROVIDER: BridgeContextValue = { bridge: null, ready: false, provided: false };

export const BridgeContext = createContext<BridgeContextValue>(NO_PROVIDER);

/** Internal to the bridge: the raw context, for `useSubscription` and the hooks here. */
export function useBridgeContext(): BridgeContextValue {
  return useContext(BridgeContext);
}

/**
 * The bridge for imperative use in handlers and effects: the provider's
 * instance, or, outside a provider, whatever `getBridgeImpl()` holds (the
 * old behaviour, kept until step 7). Null until the bridge is ready.
 */
export function useBridge(): BridgeImpl | null {
  return bridgeFrom(useBridgeContext());
}

/**
 * `useBridge()`'s answer for a context already read. For hooks that need the
 * instance only on some renders: outside a provider it reads
 * `getBridgeImpl()`, which a suite mocking the client may not define, so
 * they call this only when they use the result.
 */
export function bridgeFrom(ctx: BridgeContextValue): BridgeImpl | null {
  return ctx.provided ? ctx.bridge : getBridgeImpl();
}

/** `true` once the page bridge has finished `initialize()`. Outside a provider: once a bridge exists. */
export function useBridgeReady(): boolean {
  const ctx = useBridgeContext();
  return ctx.provided ? ctx.ready : getBridgeImpl() !== null;
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
  return useMemo(() => ({ bridge, ready, provided: true }), [bridge, ready]);
}
