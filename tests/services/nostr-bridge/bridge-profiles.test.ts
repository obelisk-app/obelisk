/**
 * Profiles (kind 0) on the pool-level fake: the batched lookups, the lookup relays, and editing the user's own profile.
 *
 * Mocks `SimplePool` from `nostr-tools` (`./support/bridge-fake-pool.ts`)
 * to capture published events and deliver them back to subscribers, a relay
 * round trip without the network. Real crypto runs end to end. Split out of
 * the one 4,900-line suite along the bridge's module seams (round 16); the
 * shared lifecycle and helpers are `./support/bridge-harness.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { finalizeEvent } from 'nostr-tools';
import {
  deliver,
  fakeRelayList,
  flush,
  hexToBytesForTest,
  installBridgeHarness,
  kind0Requested,
  kind0SubsIn,
  makeKeypair,
  onWire,
  settleKind0Batch,
} from '@tests/services/nostr-bridge/support/bridge-harness';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

installBridgeHarness(fake);

describe('nostr-bridge', () => {

  it('opens kind:0 on the active relay as a bounded one-shot and bounds external lookup', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const other = makeKeypair().pkHex;
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    // Let the login-time lookup for our own pubkey drain before measuring.
    await settleKind0Batch();
    fake.state.subscriptions = [];
    fake.state.subscriptionLog = [];
    fake.state.querySyncCalls = [];

    bridge.ensureUserMetadata(other);
    // Batched: the REQ waits for the batch window rather than going out
    // one-per-pubkey as the calls arrive.
    expect(kind0SubsIn(fake.state.subscriptionLog)).toHaveLength(0);
    await settleKind0Batch();

    const initialKind0Subs = kind0SubsIn(fake.state.subscriptionLog);
    expect(initialKind0Subs).toHaveLength(1);
    expect(initialKind0Subs[0].filter.authors).toEqual([other]);
    expect(initialKind0Subs[0].relays).toEqual([onWire('wss://public.obelisk.ar')]);

    await flush(8);

    const kind0Subs = fake.state.subscriptions.filter((s) => (s.filter.kinds as number[] | undefined)?.includes(0));
    expect(kind0Subs).toHaveLength(0);
    const contactMuteSubs = fake.state.subscriptions.filter((s) => {
      const kinds = s.filter.kinds as number[] | undefined;
      return kinds?.includes(3) || kinds?.includes(10000);
    });
    expect(contactMuteSubs.every((s) => s.relays?.every((r) => r === 'wss://public.obelisk.ar'))).toBe(true);
    expect(initialKind0Subs[0].relays).not.toContain('wss://nos.lol');
    expect(initialKind0Subs[0].relays).not.toContain('wss://relay.primal.net');
    expect(initialKind0Subs[0].relays).not.toContain('wss://relay.nostr.band');
    const externalLookups = fake.state.querySyncCalls.filter((c) => (c.filter.authors as string[] | undefined)?.includes(other));
    expect(externalLookups.flatMap((call) => call.relays)).toEqual([
      'wss://lacrypta-relay.obelisk.ar',
      'wss://public.obelisk.ar',
      'wss://purplepag.es',
    ].map(onWire));
  });


  it('folds a burst of profile lookups into one multi-author kind:0 REQ', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const crowd = Array.from({ length: 12 }, () => makeKeypair().pkHex);
    // Drain the login-time lookup for our own pubkey first so it can't
    // ride along in the batch under test.
    await settleKind0Batch();
    fake.state.subscriptionLog = [];
    fake.state.querySyncCalls = [];

    crowd.forEach((pk) => bridge.ensureUserMetadata(pk));
    await settleKind0Batch();

    const kind0 = kind0SubsIn(fake.state.subscriptionLog);
    expect(kind0).toHaveLength(1);
    expect(kind0[0].filter.authors).toEqual(crowd);

    // The external fan-out is one query per lookup relay: each covering
    // the whole batch, not one per pubkey per relay.
    // The hub's author batching sorts the merged list (its canonical form),
    // so compare as sets; the revision budget is 5 per author.
    const lookups = fake.state.querySyncCalls.filter((c) => (c.filter.kinds as number[] | undefined)?.includes(0));
    expect(lookups).toHaveLength(3);
    for (const lookup of lookups) {
      expect([...(lookup.filter.authors as string[])].sort()).toEqual([...crowd].sort());
      expect(lookup.filter.limit).toBe(crowd.length * 5);
    }
  });


  it('does not prefetch member profiles for channels the user has not opened', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const strangers = Array.from({ length: 3 }, () => makeKeypair().pkHex);
    const neighbours = Array.from({ length: 3 }, () => makeKeypair().pkHex);
    await settleKind0Batch();
    fake.state.subscriptionLog = [];

    // The relay-wide 39001/39002 REQ delivers a membership list for every
    // group on the relay. On a public directory relay that is thousands of
    // pubkeys the user will never see: warming them all is what made
    // opening someone else's relay flood the socket and kill the tab.
    deliver(await fakeRelayList({ groupId: 'channel-nobody-opened', kind: 39002, pubkeys: strangers }));
    await flush();
    await settleKind0Batch();
    for (const stranger of strangers) {
      expect(kind0Requested(fake.state.subscriptionLog, stranger)).toBe(false);
    }

    // The channel actually in view still warms its members up front.
    bridge.setActiveGroup('channel-in-view');
    deliver(await fakeRelayList({ groupId: 'channel-in-view', kind: 39002, pubkeys: neighbours }));
    await flush();
    await settleKind0Batch();
    for (const neighbour of neighbours) {
      expect(kind0Requested(fake.state.subscriptionLog, neighbour)).toBe(true);
    }
  });


  it('editUserMetadata publishes kind:0 to the active relay plus quiet lookup relays', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    fake.state.published = [];

    await bridge.editUserMetadata({ name: 'Alice' });

    const meta = fake.state.published.find((e) => e.kind === 0 && e.pubkey === pkHex);
    expect(meta?.relays).toContain('wss://public.obelisk.ar');
    expect(meta?.relays).toContain('wss://lacrypta-relay.obelisk.ar');
    expect(meta?.relays).toContain('wss://purplepag.es');
    expect(meta?.relays).not.toContain('wss://nos.lol');
  });


  it('does not overwrite profile metadata when the preservation read times out', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    // Login fires the same own-profile lookup (same relays, same filter) in
    // the background; while it is in flight the hub hands an identical query
    // its promise instead of a second REQ. Let it settle so the read below
    // is the one that opens the REQ whose EOSE is suppressed.
    await flush(12);
    fake.state.published = [];
    fake.state.suppressNextEose = true;

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = expect(bridge.editUserMetadata({ name: 'Alice' }))
        .rejects.toThrow('Could not load your current profile');
      await vi.advanceTimersByTimeAsync(3500);
      await pending;
    } finally {
      vi.useRealTimers();
    }
    expect(fake.state.published.some((event) => event.kind === 0)).toBe(false);
  });


  it('creates a new profile without waiting for an absent profile read', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    fake.state.published = [];
    fake.state.suppressNextEose = true;

    await bridge.editUserMetadata({ name: 'Alice' }, { create: true });

    expect(fake.state.published.some((event) => event.kind === 0 && event.pubkey === pkHex)).toBe(true);
  });


  it('edits from the signed profile cache when the preservation read would time out', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await bridge.editUserMetadata({ name: 'Alice', about: 'keep me' });
    fake.state.published = [];
    fake.state.suppressNextEose = true;

    await bridge.editUserMetadata({ name: 'Bob' });

    const event = fake.state.published.find((candidate) => candidate.kind === 0);
    expect(JSON.parse(event!.content)).toMatchObject({ name: 'Bob', about: 'keep me' });
  });


  it('cached kind:0 keeps the newest event', async () => {
    const { getCachedKind0, setCachedKind0 } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const older = finalizeEvent({ kind: 0, content: '{"name":"old"}', tags: [], created_at: 10 }, hexToBytesForTest(skHex));
    const newer = finalizeEvent({ kind: 0, content: '{"name":"new"}', tags: [], created_at: 20 }, hexToBytesForTest(skHex));
    expect(older.pubkey).toBe(pkHex);

    expect(setCachedKind0(newer)).toBe(true);
    expect(setCachedKind0(older)).toBe(false);

    expect(getCachedKind0(pkHex)?.content).toBe('{"name":"new"}');
  });


  it('redirects the retired relay and republishes cached kind:0 without a wide profile lookup', async () => {
    const { getBridge, getBridgeImpl, setCachedKind0 } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const cached = finalizeEvent({ kind: 0, content: '{"name":"Cached"}', tags: [], created_at: 30 }, hexToBytesForTest(skHex));
    setCachedKind0(cached);
    window.localStorage.setItem('obelisk/profile-sync-state/v1', JSON.stringify({ ownProfileLookupAt: { [pkHex]: Date.now() }, ownProfileSyncedToRelay: {} }));
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush(8);
    fake.state.querySyncCalls = [];
    fake.state.published = [];

    await bridge.switchRelay('wss://relay.obelisk.ar');
    await flush(8);

    expect(getBridgeImpl()?.currentRelayUrl.get()).toBe('wss://lacrypta-relay.obelisk.ar');
    expect(fake.state.querySyncCalls.filter((c) => (c.filter.kinds as number[] | undefined)?.includes(0))).toHaveLength(0);
    const meta = fake.state.published.find((e) => e.kind === 0 && e.pubkey === pkHex);
    expect(meta?.content).toBe('{"name":"Cached"}');
    expect(meta?.relays).toEqual(['wss://lacrypta-relay.obelisk.ar']);
  });


  it('editUserMetadata publishes kind 0 to the active relay plus quiet profile lookup relays', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    await bridge.switchRelay('wss://lacrypta-relay.obelisk.ar');
    fake.state.published = [];

    await bridge.editUserMetadata({ name: 'Alice', displayName: 'Alice' });

    const metadataEvent = fake.state.published.find((event) => event.kind === 0);
    expect(metadataEvent).toBeTruthy();
    expect(metadataEvent?.relays).not.toContain('wss://relay.obelisk.ar');
    expect(metadataEvent?.relays).toContain('wss://public.obelisk.ar');
    expect(metadataEvent?.relays).toContain('wss://purplepag.es');
    expect(metadataEvent?.relays).toContain('wss://lacrypta-relay.obelisk.ar');
    expect(metadataEvent?.relays).not.toContain('wss://relay.damus.io');
  });
});
