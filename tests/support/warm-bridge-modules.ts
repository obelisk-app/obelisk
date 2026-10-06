import { beforeAll } from 'vitest';

/**
 * Pay for the bridge's module graph once, before the first test's clock starts.
 *
 * The nostr-bridge suites `vi.resetModules()` in `beforeEach` and
 * `await import('./client')` inside each test, so the first test of every
 * file also carries the one-time transform of client.ts and the SDK packages
 * it inlines. In isolation that is well under a second; under CPU contention
 * the transform ran more than ten times slower and the first test of
 * dm-nip17.test.ts hit the 20 s ceiling while every later test in the file
 * took tens of milliseconds. The ceiling exists for hung tests, not for the
 * compiler, so this warms the graph in a hook with its own generous limit.
 * The instance is thrown away by the next `resetModules`; only the transform
 * cache survives, which is the part that was slow.
 */
export function warmBridgeModules(): void {
  beforeAll(async () => {
    await import('@/services/nostr-bridge/client');
  }, 120_000);
}

/**
 * The same, for a component that imports the bridge's front door lazily
 * (the marketing Navbar's Disconnect, `await import('@/services/nostr-bridge')`).
 * Alone, that first import takes three to four seconds, most of the 5 s a
 * `waitFor` allows; under a full parallel run it overran it. Warmed here, the
 * click's import resolves from the module cache and the test waits only on
 * what it asserts.
 */
export function warmBridgeFrontDoor(): void {
  beforeAll(async () => {
    await import('@/services/nostr-bridge');
  }, 120_000);
}
