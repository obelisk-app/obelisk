/**
 * Where the page's one bridge lives: a slot on `globalThis`, not two module
 * variables in `client.ts`.
 *
 * A module variable is reset whenever the module is evaluated again, which
 * is what Fast Refresh does to `client.ts` (and everything under the bridge)
 * on an edit in development. The next `getBridge()` then built a second
 * `BridgeImpl` on the same page hub, with a second set of REQs and
 * listeners. On `globalThis` the slot outlives a re-evaluated module, so the
 * re-evaluated `getBridge()` finds the instance the page already has.
 *
 * The flip side is for tests: `vi.resetModules()` no longer forgets the
 * bridge either. A suite that wants a fresh one calls `unregisterBridge()`.
 *
 * Nothing but types is imported here, so reading or emptying the slot never
 * loads the client (a suite can empty it before its fake relay hub exists).
 * `client.ts` re-exports `registerBridge` and `unregisterBridge`, and owns
 * `getBridge()`, the one place a bridge is constructed.
 */
import type { BridgeImpl } from './client';

export interface BridgeSlot {
  /** The page bridge, once something constructed or registered it. */
  instance: BridgeImpl | null;
  /** Resolves to `instance` once it is ready to use (`initialize()` settled, or registered). */
  promise: Promise<BridgeImpl> | null;
}

declare global {
  var __obeliskBridge: BridgeSlot | undefined;
}

/** The page's slot, created empty on first use. */
export function bridgeSlot(): BridgeSlot {
  globalThis.__obeliskBridge ??= { instance: null, promise: null };
  return globalThis.__obeliskBridge;
}

/**
 * Make `instance` the page bridge: `getBridgeImpl()` returns it and
 * `getBridge()` resolves to it at once. No `initialize()` is run on a
 * registered instance; whoever registers it owns its readiness. Idempotent
 * for the instance already in the slot (its pending `initialize()` is kept).
 * `BridgeProvider` calls it with the instance it adopted, or with the fake a
 * test injected.
 */
export function registerBridge(instance: BridgeImpl): void {
  const slot = bridgeSlot();
  if (slot.instance === instance && slot.promise) return;
  slot.instance = instance;
  slot.promise = Promise.resolve(instance);
}

/**
 * Empty the slot so the next `getBridge()` builds a fresh bridge. Nothing is
 * disposed: that stays the caller's job. With `instance`, only that instance
 * is forgotten (a provider unmounting after another one registered leaves
 * the newer one alone). What the headless suites call between tests, now
 * that `vi.resetModules()` no longer forgets the bridge.
 */
export function unregisterBridge(instance?: BridgeImpl): void {
  const slot = bridgeSlot();
  if (instance && slot.instance !== instance) return;
  slot.instance = null;
  slot.promise = null;
}
