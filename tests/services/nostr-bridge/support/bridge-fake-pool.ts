/**
 * The pool-level fake the bridge's integration suites run on: a stand-in for
 * nostr-tools' `SimplePool` that records every REQ, publish, close and
 * handshake, replays published events to matching subscriptions, and fires
 * EOSE on a microtask so the watchdogs stay quiet. Built from inside a
 * hoisted block, before `nostr-tools` is mocked, so this file imports only
 * types:
 *
 *   const fake = await vi.hoisted(async () =>
 *     (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());
 *   vi.mock('nostr-tools', async (orig) => ({ ...((await orig()) as object), SimplePool: fake.FakePool }));
 *
 * Split out of `bridge.test.ts` (round 16) so the suites split along the
 * bridge's module seams share one fake instead of copying it.
 */
import type { Event as NostrEvent } from 'nostr-tools';

export function createFakeBridgePool() {
  const state = {
    published: [] as Array<{ kind: number; pubkey: string; tags: string[][]; content: string; id: string; created_at: number; relays?: string[] }>,
    subscriptions: [] as Array<{
      filter: Record<string, unknown>;
      sink: (ev: any) => void;
      relays?: string[];
      onclose?: (reasons: string[]) => void;
      poolId?: number;
    }>,
    /**
     * Append-only record of every REQ the bridge opened. `subscriptions`
     * drops entries on close, which hides short-lived one-shots (batched
     * kind:0 lookups close on their own EOSE) from assertions that run
     * after the microtask queue has drained.
     */
    subscriptionLog: [] as Array<{ filter: Record<string, unknown>; relays?: string[] }>,
    ensureRelayCalls: [] as string[],
    ensureRelayImpl: null as null | ((url: string, opts?: { connectionTimeout?: number }) => Promise<{ connected: boolean; onclose?: () => void }>),
    publishImpl: null as null | ((relays: string[], event: NostrEvent) => Promise<string>[]),
    querySyncCalls: [] as Array<{ relays: string[]; filter: Record<string, unknown>; opts?: { maxWait?: number } }>,
    suppressNextEose: false,
    /**
     * Silence EOSE on EVERY sub, not just the next one: a relay that is
     * mid-scan and has answered nothing yet. `suppressNextEose` is consumed by
     * whichever sub happens to open first, which on the login path is never the
     * one a test is aiming at.
     */
    suppressAllEose: false,
    poolSeq: 0,
    poolOptions: [] as Array<Record<string, unknown>>,
    closeCalls: [] as Array<{ poolId: number; relays: string[] }>,
    closeOpenSubscriptionCounts: [] as Array<{ poolId: number; count: number }>,
    /** Bumped per test; pools built by an earlier test are ignored. */
    testNo: 0,
  };

  function matchesInternal(f: Record<string, unknown>, ev: { kind: number; pubkey: string; tags: string[][] }): boolean {
    if (Array.isArray(f.kinds) && !(f.kinds as number[]).includes(ev.kind)) return false;
    if (Array.isArray(f.authors) && !(f.authors as string[]).includes(ev.pubkey)) return false;
    for (const k of Object.keys(f)) {
      if (!k.startsWith('#')) continue;
      const tag = k.slice(1);
      const wanted = f[k] as string[];
      const present = ev.tags.some((t) => t[0] === tag && wanted.includes(t[1]));
      if (!present) return false;
    }
    return true;
  }

  class FakePool {
    private readonly id: number;
    private readonly testNo: number;
    constructor(opts: Record<string, unknown> = {}) {
      this.id = ++state.poolSeq;
      this.testNo = state.testNo;
      state.poolOptions.push(opts);
    }
    subscribe(relays: string[], filter: Record<string, unknown>, opts: { onevent: (ev: any) => void; oneose?: () => void; onclose?: (reasons: string[]) => void; onauth?: unknown; maxWait?: number; label?: string }) {
      if (opts.label === 'obelisk-query') state.querySyncCalls.push({ relays, filter, opts: { maxWait: opts.maxWait } });
      const sub = { filter, sink: opts.onevent, relays, onclose: opts.onclose, poolId: this.id };
      // A bridge from a finished test can still be unwinding an awaited
      // switch/reconnect. Its pools must not write into this test's record
      // (pool ids restart at 1 every test, so it would be indistinguishable).
      if (this.stale()) return { close: () => {} };
      if (opts.label !== 'obelisk-query') {
        state.subscriptions.push(sub);
        state.subscriptionLog.push({ filter, relays });
      }
      for (const ev of state.published) if (matchesInternal(filter, ev as any)) opts.onevent(ev);
      // Fire EOSE so subscribeWatched's watchdog marks the sub as alive and
      // doesn't queue retries during tests.
      if (state.suppressAllEose) { /* relay is still scanning */ }
      else if (state.suppressNextEose) state.suppressNextEose = false;
      else queueMicrotask(() => opts.oneose?.());
      return { close: () => { state.subscriptions = state.subscriptions.filter((s) => s !== sub); } };
    }
    publish(relays: string[], event: NostrEvent): Promise<string>[] {
      if (state.publishImpl) return state.publishImpl(relays, event);
      // The hub publishes one relay per call, URL normalized (`wss://host/`).
      // Keep one record per event listing every relay it went to, written
      // the way the tests name relays (no trailing slash on a bare host).
      const named = relays.map((url) => url.replace(/\/$/, ''));
      const seen = state.published.find((e) => e.id === event.id);
      if (seen) {
        seen.relays = Array.from(new Set([...(seen.relays ?? []), ...named]));
        return named.map(() => Promise.resolve('ok'));
      }
      state.published.push({ ...event, relays: named });
      queueMicrotask(() => {
        for (const sub of state.subscriptions) if (matchesInternal(sub.filter, event)) sub.sink(event);
      });
      return named.map(() => Promise.resolve('ok'));
    }
    private stale(): boolean {
      return this.testNo !== state.testNo;
    }
    close(relays: string[]): void {
      if (this.stale()) return;
      state.closeOpenSubscriptionCounts.push({
        poolId: this.id,
        count: state.subscriptions.filter((sub) => sub.poolId === this.id).length,
      });
      state.closeCalls.push({ poolId: this.id, relays });
      const closing = new Set(relays);
      state.subscriptions = state.subscriptions.filter((sub) =>
        sub.poolId !== this.id || !sub.relays?.some((relay) => closing.has(relay)),
      );
    }
    /**
     * The bridge's `connect()` awaits `pool.ensureRelay(url, ...)` before
     * issuing REQs (post Fix A: login no longer flips `isLoggedIn` until
     * connect resolves). The fake returns `connected: true` instantly so
     * tests pretend every relay is reachable.
     */
    async ensureRelay(_url: string, _opts?: { connectionTimeout?: number }): Promise<{ connected: boolean; onclose?: () => void }> {
      state.ensureRelayCalls.push(_url);
      if (state.ensureRelayImpl) return state.ensureRelayImpl(_url, _opts);
      return { connected: true };
    }
    /**
     * Resolve to every previously-`publish()`ed event that matches the
     * filter. The bridge uses this for fetchGroupMetadata, search, and
     * (post cold-load-fix) the kind-9 querySync fallback when the retry
     * ladder exhausts. Tests that want querySync to return events should
     * pre-`publish` them; tests that want it empty just leave state.published
     * alone for that filter.
     */
    async querySync(_relays: string[], filter: Record<string, unknown>, _opts?: { maxWait?: number }): Promise<NostrEvent[]> {
      state.querySyncCalls.push({ relays: _relays, filter, opts: _opts });
      return state.published.filter((ev) => matchesInternal(filter, ev as { kind: number; pubkey: string; tags: string[][] })) as NostrEvent[];
    }
  }

  return { state, FakePool, matchesInternal };
}

export type FakeBridgePool = ReturnType<typeof createFakeBridgePool>;
