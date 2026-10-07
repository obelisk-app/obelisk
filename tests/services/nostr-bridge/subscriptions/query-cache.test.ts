/**
 * The bridge's one-shot reads use the hub's result cache by default
 * (round 16, re-audit item 4). Before this, `queryRelaysWithConfidence`
 * passed `cache: { mode: 'bypass' }` on every call, so a repeated identical
 * read always went back to the wire. These run the real hub over
 * `FakeRelay`, so a REQ in `reqLog` is a REQ the relay would have seen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestsModule } from '@/services/nostr-bridge/subscriptions/registry';
import { StateStore } from '@/services/nostr-bridge/common/state-store';
import { A, fakeEvent, flush, makeHub, makeSigner, sessionIdentity, type TestHub } from '@/lib/relay-hub/test-support';

const FILTER = { kinds: [0], authors: ['ab'.repeat(32)] };

function requests(t: TestHub): RequestsModule {
  return new RequestsModule({
    hub: t.hub,
    relays: () => [A],
    watched: {
      hub: t.hub,
      signerOffered: () => true,
      setRelayAccess: () => undefined,
      setRelayAccessDeferred: () => undefined,
    },
    connectionState: new StateStore('Connected'),
    activeSocketUp: () => true,
  });
}

describe('RequestsModule.queryRelaysWithConfidence and the hub cache', () => {
  let t: TestHub;

  beforeEach(() => {
    vi.useFakeTimers();
    t = makeHub();
    t.hub.setIdentity(sessionIdentity(makeSigner()));
  });
  afterEach(() => {
    t.hub.dispose();
    vi.useRealTimers();
  });

  async function firstRead(reqs: RequestsModule) {
    const pending = reqs.queryRelaysWithConfidence([A], FILTER, 4000);
    await flush();
    const relay = t.factory.get(A);
    if (!relay) throw new Error('no socket for A');
    const ev = fakeEvent({ kind: 0, pubkey: 'ab'.repeat(32) });
    relay.emit(ev);
    relay.eose();
    const result = await pending;
    return { relay, ev, result };
  }

  it('serves a repeated identical read from the cache instead of the network', async () => {
    const reqs = requests(t);
    const { relay, ev, result } = await firstRead(reqs);
    expect(result).toEqual({ events: [ev], complete: true });
    expect(relay.reqLog).toHaveLength(1);

    // Same read, filter keys in another order and hex in another case: the
    // hub's canonical key makes it the same question.
    const again = reqs.queryRelaysWithConfidence([A], { authors: ['AB'.repeat(32)], kinds: [0] }, 4000);
    await flush();
    expect(relay.reqLog).toHaveLength(1);
    expect(await again).toEqual({ events: [ev], complete: true });
  });

  it("goes back to the wire when a call site asks for 'bypass' or 'fresh'", async () => {
    const reqs = requests(t);
    const { relay } = await firstRead(reqs);
    expect(relay.reqLog).toHaveLength(1);

    const bypass = reqs.queryRelaysWithConfidence([A], FILTER, 4000, { cache: 'bypass' });
    await flush();
    expect(relay.reqLog).toHaveLength(2);
    relay.eose();
    await bypass;

    const fresh = reqs.queryRelaysWithConfidence([A], FILTER, 4000, { cache: 'fresh' });
    await flush();
    expect(relay.reqLog).toHaveLength(3);
    relay.eose();
    await fresh;
  });
});
