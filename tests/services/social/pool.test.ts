/**
 * The SDK pool is the RelayHub's facade (RelayHub step 4), and the read-side
 * rule in `relays.ts` holds through it: a lookup rides the socket the session
 * already holds a lease on, and never opens one to a configured relay nobody
 * is using. The hub runs on `FakeRelay`; the SDK's own `fetchRelayList` is
 * the caller, exactly as `read-state/root.tsx` uses it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools';

const ACTIVE = 'wss://relay-active.example';
const IDLE = 'wss://relay-idle.example';
const LOOKUP = ['wss://lookup-a.example', 'wss://lookup-b.example'];

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(async () => {
  const { resetRelayHubForTests } = await import('@/lib/relay-hub');
  resetRelayHubForTests();
  vi.useRealTimers();
});

describe('the SDK pool on the RelayHub', () => {
  it('a kind-10002 lookup rides the leased relay\'s socket and opens none to an unleased configured relay', async () => {
    // The page hub, on a fake transport, created before `pool.ts` loads so
    // `pageRelayHub()` finds it (options bind on the first call).
    const hubMod = await import('@/lib/relay-hub');
    const factory = new hubMod.FakeRelayFactory();
    const hub = hubMod.getRelayHub({ relayFactory: factory.create });
    const sk = generateSecretKey();
    const me = getPublicKey(sk);
    hub.setIdentity({ id: 'session', pubkey: me, signer: async (t) => finalizeEvent(t, sk), authPolicy: 'auth-when-challenged' });
    // What the bridge does for the relay being browsed: a lease, then the socket.
    const lease = hub.acquireAuthLease(ACTIVE, 'active');
    await hub.connect(ACTIVE);
    const activeRelay = factory.get(ACTIVE)!;
    expect(activeRelay.connected).toBe(true);
    expect(activeRelay.onauth).toBeDefined();
    const socketsBefore = factory.calls.length;

    const { leasedRelays } = await import('@/services/social/pool');
    const { fetchRelayList } = await import('@nostr-wot/data');

    // The rail holds a relay the user is not using; the rule keeps it out.
    const configured = [ACTIVE, IDLE];
    const targets = Array.from(new Set([...leasedRelays(configured), ...LOOKUP]));
    expect(targets).toEqual([ACTIVE, ...LOOKUP]);

    const lookup = fetchRelayList(me, targets);
    await flush();
    await flush();

    const asksForMyRelayList = (f: Filter) => f.kinds?.includes(10002) === true && f.authors?.includes(me) === true;
    // The REQ to the active relay is on the socket the bridge holds: the same
    // relay object, no second socket, and the one that can answer AUTH.
    expect(factory.allFor(ACTIVE)).toHaveLength(1);
    expect(activeRelay.openSubs().some((s) => s.filters.some(asksForMyRelayList))).toBe(true);
    // The public lookup relays got their own sockets, with no signer: no
    // lease, so the hub never offers to identify on them.
    for (const url of LOOKUP) {
      const relay = factory.get(url);
      expect(relay).toBeDefined();
      expect(relay!.onauth).toBeUndefined();
      expect(relay!.openSubs().some((s) => s.filters.some(asksForMyRelayList))).toBe(true);
    }
    // And nothing at all was opened to the configured relay nobody is using.
    expect(factory.get(IDLE)).toBeUndefined();
    expect(factory.calls.length - socketsBefore).toBe(LOOKUP.length);

    // Every relay answers empty: the lookup settles and lets the REQs go.
    for (const relay of factory.relays) relay.eose();
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await lookup).toBeNull();
    expect(activeRelay.openSubs()).toHaveLength(0);
    expect(factory.get(IDLE)).toBeUndefined();
    lease.release();
  });
});
