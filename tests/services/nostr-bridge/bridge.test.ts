/**
 * The bridge end to end on the pool-level fake: login, the connection and its retries, the relay rail, DMs over NIP-04, and logout.
 *
 * Mocks `SimplePool` from `nostr-tools` (`./support/bridge-fake-pool.ts`)
 * to capture published events and deliver them back to subscribers, a relay
 * round trip without the network. Real crypto runs end to end. Split out of
 * the one 4,900-line suite along the bridge's module seams (round 16); the
 * shared lifecycle and helpers are `./support/bridge-harness.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { generateSecretKey, finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import {
  deliver,
  fakeRelayMessage,
  flush,
  installBridgeHarness,
  isActiveRelayUrl,
  makeKeypair,
  onWire,
  setOnline,
  setVisibility,
} from '@tests/services/nostr-bridge/support/bridge-harness';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

// Import bridge AFTER the mock is registered.
import { isImportableRelayUrl } from '@/services/nostr-bridge/client';

installBridgeHarness(fake);

describe('nostr-bridge', () => {
  it('rejects local and private relay URLs from imported relay lists', () => {
    expect(isImportableRelayUrl('ws://localhost:4869/')).toBe(false);
    expect(isImportableRelayUrl('wss://localhost:4869/')).toBe(false);
    expect(isImportableRelayUrl('wss://host.docker.internal:3334/')).toBe(false);
    expect(isImportableRelayUrl('wss://vvearoljdsmlkhnvms673x3ra6szhcftz66powh6bbmgodk3rs63wdid.onion/')).toBe(false);
    expect(isImportableRelayUrl('wss://lacrypta-relay.obelisk.ar/')).toBe(true);
  });


  it('logs in with nsec and exposes the public key', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    expect(bridge.getPublicKey()).toBe(pkHex);
  });


  it('NIP-04 DM round-trip: alice → bob, decrypts on bob side', async () => {
    const { getBridge: getBridgeAlice } = await import('@/services/nostr-bridge/client');
    const alice = makeKeypair();
    const bob = makeKeypair();

    const bridgeA = await getBridgeAlice();
    await bridgeA.loginWithNsec(alice.skHex, alice.pkHex);
    const { setPreference } = await import('@/services/preferences');
    setPreference('directMessagesEnabled', true);
    bridgeA.subscribeDirectMessages(() => {});

    // NIP-17 is the default protocol now; this thread explicitly opts into
    // NIP-04 via the per-thread override to verify the legacy path still
    // behaves exactly as before the SDK adoption.
    const { useDMStore } = await import('@/store/dm');
    useDMStore.getState().setProtocolOverride(bob.pkHex, 'nip04');

    await bridgeA.sendDirectMessage(bob.pkHex, 'meet me at the obelisk');
    await flush(20);

    const dms = fake.state.published.filter((e) => e.kind === 4);
    expect(dms).toHaveLength(1);
    expect(dms[0].pubkey).toBe(alice.pkHex);
    expect(dms[0].tags).toContainEqual(['p', bob.pkHex]);
    // Content is encrypted: should not contain plaintext.
    expect(dms[0].content).not.toContain('meet me');

    // Bob decrypts using nip04 directly.
    const { nip04 } = await import('nostr-tools');
    const plaintext = await nip04.decrypt(bob.skHex, alice.pkHex, dms[0].content);
    expect(plaintext).toBe('meet me at the obelisk');
  });


  it('drops plaintext and late decrypts when the active identity changes', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const alice = makeKeypair();
    const bob = makeKeypair();
    const peer = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(alice.skHex, alice.pkHex);
    const impl = getBridgeImpl()!;
    impl.dmsByPeer.set({
      [peer.pkHex]: [{
        id: 'alice-message',
        counterparty: peer.pkHex,
        outgoing: false,
        content: 'alice plaintext',
        createdAt: 1,
      }],
    });
    const { useDMStore } = await import("@/store/dm");
    useDMStore.setState({
      isDMMode: true,
      activeDMPubkey: peer.pkHex,
      threads: [{ pubkey: peer.pkHex, displayName: "Peer", lastMessage: "alice preview" }],
      messages: [{
        id: "alice-store-message",
        senderPubkey: peer.pkHex,
        recipientPubkey: alice.pkHex,
        content: "alice store plaintext",
        createdAt: 1,
        protocol: "nip04",
      }],
    });

    let finishDecrypt!: (plaintext: string) => void;
    const decrypting = new Promise<string>((resolve) => { finishDecrypt = resolve; });
    const dmInternals = impl as unknown as {
      decryptNip04: (pubkey: string, ciphertext: string) => Promise<string>;
      ingestIncomingDM: (event: NostrEvent) => Promise<void>;
    };
    dmInternals.decryptNip04 = vi.fn().mockReturnValue(decrypting);
    const lateIngest = dmInternals.ingestIncomingDM({
      id: 'late-message',
      pubkey: peer.pkHex,
      kind: 4,
      content: 'ciphertext',
      tags: [['p', alice.pkHex]],
      created_at: 2,
      sig: 'unused',
    } as NostrEvent);

    await bridge.loginWithNsec(bob.skHex, bob.pkHex);
    expect(impl.dmsByPeer.get()).toEqual({});
    expect(useDMStore.getState().messages).toEqual([]);
    expect(useDMStore.getState().threads).toEqual([]);
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
    expect(useDMStore.getState().isDMMode).toBe(false);
    finishDecrypt('late alice plaintext');
    await lateIngest;
    expect(impl.dmsByPeer.get()).toEqual({});
  });


  it('does not open DM relay subscriptions until local DM opt-in is enabled', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { setPreference } = await import('@/services/preferences');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const countDmSubs = () => fake.state.subscriptions.filter((sub) =>
      Array.isArray((sub.filter as any).kinds) && (sub.filter as any).kinds.includes(4),
    ).length;

    expect(countDmSubs()).toBe(0);
    const unsubDisabled = bridge.subscribeDirectMessages((byPeer) => {
      expect(byPeer).toEqual({});
    });
    expect(countDmSubs()).toBe(0);
    unsubDisabled();

    setPreference('directMessagesEnabled', true);
    const unsubEnabled = bridge.subscribeDirectMessages(() => {});
    expect(countDmSubs()).toBe(2);
    unsubEnabled();
  });


  it('does not run connect fan-out or flip login before a delayed relay handshake completes', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();

    let resolveRelay: (relay: { connected: boolean; onclose?: () => void }) => void = () => {
      throw new Error('delayed relay resolver was not installed');
    };
    // Only the active relay's handshake is held back. The session fan-out
    // is queued in the hub's registry during it, and the contact-list REQ
    // names the profile and social relays too, so those handshake alongside;
    // they must not capture the resolver meant for the active relay.
    fake.state.ensureRelayImpl = (url) => {
      if (!isActiveRelayUrl(url)) return Promise.resolve({ connected: true });
      return new Promise((resolve) => {
        resolveRelay = resolve;
      });
    };

    const loginPromise = bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    expect(fake.state.ensureRelayCalls.filter(isActiveRelayUrl)).toHaveLength(1);
    // The REQs are pending in the registry: nothing is on the wire and the
    // login gate is closed until the active relay's handshake completes.
    expect(fake.state.subscriptions.filter((s) => s.relays?.some(isActiveRelayUrl))).toHaveLength(0);
    expect(impl.isLoggedIn.get()).toBe(false);

    resolveRelay({ connected: true });
    await loginPromise;
    await flush();

    expect(impl.isLoggedIn.get()).toBe(true);
    expect(fake.state.subscriptions.some((s) => {
      const kinds = s.filter.kinds as number[] | undefined;
      return kinds?.includes(39000);
    })).toBe(true);
  });


  it('gives a resumed mobile PWA enough time to open its relay WebSocket', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    let connectionTimeout = 0;
    fake.state.ensureRelayImpl = (_url, options) => {
      connectionTimeout = options?.connectionTimeout ?? 0;
      return Promise.resolve({ connected: true });
    };

    await (await getBridge()).loginWithNsec(skHex, pkHex);

    expect(connectionTimeout).toBe(10_000);
  });


  it("enables native ping on every bridge pool", async () => {
    const { getBridge } = await import("@/services/nostr-bridge/client");
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    // Exactly one pool now: the hub's, for the session identity. The second
    // one this used to see was the rebuild on login that step 2 removed.
    expect(fake.state.poolOptions).toHaveLength(1);
    expect(fake.state.poolOptions.every((opts) => opts.enablePing === true)).toBe(true);
  });


  it("closes the previous active relay socket once the switch grace window lapses", async () => {
    const { getBridge } = await import("@/services/nostr-bridge/client");
    const { setPreference } = await import("@/services/preferences");
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    // The default relay is also a profile-lookup relay, so its socket stays
    // in use after a switch; leave from a relay nothing else needs. And a
    // relay the user just left is watched by default (step 6), which holds
    // its socket on purpose; this test is about the grace, so watch off.
    setPreference("backgroundRelayWatch", false);
    await bridge.switchRelay("wss://other.example");
    await flush();
    fake.state.closeCalls = []; fake.state.closeOpenSubscriptionCounts = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await bridge.switchRelay("wss://third.example");

    // The relay being left keeps its socket (and its AUTH) for 60 s so that
    // switching A -> B -> A costs no handshake and no signer prompt. It used
    // to be closed on the next microtask, together with a pool rebuild.
    expect(fake.state.closeCalls).toEqual([]);
    await vi.advanceTimersByTimeAsync(60_000);
    // One pool for the session, so its id is 1; the hub normalizes the URL.
    expect(fake.state.closeCalls).toContainEqual({
      poolId: 1,
      relays: ["wss://other.example/"],
    });
    // Every REQ the bridge had on the relay being left was closed before its
    // socket; the session pool's live REQs all belong to the relay now
    // browsed. (This used to count the old pool's open subs, meaningless with
    // one pool.)
    const sessionSubs = fake.state.subscriptions.filter((sub) => sub.poolId === 1);
    expect(sessionSubs.some((sub) => sub.relays?.includes(onWire("wss://other.example")))).toBe(false);
    expect(sessionSubs.length).toBeGreaterThan(0);
  });


  it("keeps mounted channel subscriptions alive across relay switches", async () => {
    const { getBridge } = await import("@/services/nostr-bridge/client");
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const groupId = "general";
    const seen: string[][] = [];
    bridge.setActiveGroup(groupId);
    bridge.subscribeMessages(groupId, (messages) => seen.push(messages.map((message) => message.content)));
    await flush();

    await bridge.switchRelay("wss://other.example");
    await flush();
    deliver(await fakeRelayMessage({ groupId, content: "loaded without refresh" }));
    await flush();

    expect(seen.at(-1)).toContain("loaded without refresh");
    expect(fake.state.subscriptions.some((sub) => {
      const filter = sub.filter as { kinds?: number[]; "#h"?: string[] };
      return sub.relays?.includes(onWire("wss://other.example"))
        && filter.kinds?.includes(9)
        && filter["#h"]?.includes(groupId);
    })).toBe(true);
  });


  it("announces a relay switch immediately but defers mounted REQs until the handshake", async () => {
    const { getBridge } = await import("@/services/nostr-bridge/client");
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const relay = "wss://slow-switch.example";
    let resolveRelay!: (relay: { connected: boolean; onclose?: () => void }) => void;
    fake.state.ensureRelayImpl = () => new Promise((resolve) => { resolveRelay = resolve; });

    const seenRelays: string[] = [];
    bridge.subscribeCurrentRelayUrl((url) => {
      seenRelays.push(url);
      if (url === relay) bridge.subscribeFilterWatched({ kinds: [30078] }, () => {});
    });
    const switchPromise = bridge.switchRelay(relay);
    await flush();

    expect(seenRelays.at(-1)).toBe(relay);
    expect(fake.state.subscriptions.filter((sub) => sub.relays?.includes(onWire(relay)))).toHaveLength(0);

    resolveRelay({ connected: true });
    await switchPromise;
    await flush();

    expect(seenRelays.at(-1)).toBe(relay);
    expect(fake.state.subscriptions.some((sub) => {
      const kinds = sub.filter.kinds as number[] | undefined;
      return sub.relays?.includes(onWire(relay)) && kinds?.includes(39000);
    })).toBe(true);
    expect(fake.state.subscriptions.some((sub) => {
      const kinds = sub.filter.kinds as number[] | undefined;
      return sub.relays?.includes(onWire(relay)) && kinds?.includes(30078);
    })).toBe(true);
  });


  it("pauses while offline and reconnects immediately when the browser returns online", async () => {
    const { getBridge, getBridgeImpl } = await import("@/services/nostr-bridge/client");
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const impl = getBridgeImpl()!;
    const callsBefore = fake.state.ensureRelayCalls.length;

    setOnline(false);
    window.dispatchEvent(new Event("offline"));
    expect(impl.connectionState.get()).toBe("Offline");
    expect(fake.state.ensureRelayCalls).toHaveLength(callsBefore);
    const reqsBefore = fake.state.subscriptionLog.length;

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await flush(12);

    // The socket never dropped (the fake stays connected), so the hub keeps
    // it and its REQs stay open: no new handshake, no new AUTH, no second
    // copy of any REQ. The bridge only reconciles the state label. A drop
    // would have reached the bridge through the hub's status report, and the
    // re-issue follows the hub's `connected`, not the browser event (step 3).
    expect(fake.state.ensureRelayCalls).toHaveLength(callsBefore);
    expect(fake.state.subscriptionLog).toHaveLength(reqsBefore);
    expect(fake.state.subscriptions.some((s) => (s.filter.kinds as number[] | undefined)?.includes(39000))).toBe(true);
    expect(impl.connectionState.get()).toBe("Connected");
  });


  it("wakes a disconnected connection when its tab becomes visible", async () => {
    const { getBridge, getBridgeImpl } = await import("@/services/nostr-bridge/client");
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const impl = getBridgeImpl()!;
    const callsBefore = fake.state.ensureRelayCalls.length;
    const reqsBefore = fake.state.subscriptionLog.length;
    impl.connectionState.set("Disconnected");

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush(12);

    // Same as the online case: the live socket and its REQs are kept, and
    // the state reports connected. No rebuild, no prompt, no re-issue.
    expect(fake.state.ensureRelayCalls).toHaveLength(callsBefore);
    expect(fake.state.subscriptionLog).toHaveLength(reqsBefore);
    expect(fake.state.subscriptions.some((s) => (s.filter.kinds as number[] | undefined)?.includes(39000))).toBe(true);
    expect(impl.connectionState.get()).toBe("Connected");
  });


  it('rehydrated cache-free sessions stay logged out until background reconnect succeeds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { skHex, pkHex } = makeKeypair();
    window.localStorage.setItem('obelisk-dex/session', JSON.stringify({
      privKeyHex: skHex,
      pubKeyHex: pkHex,
      loginMethod: 'nsec',
      relayUrl: 'wss://public.obelisk.ar',
    }));

    let attempts = 0;
    let resolveReconnect: (relay: { connected: boolean; onclose?: () => void }) => void = () => {
      throw new Error('reconnect resolver was not installed');
    };
    // The active relay's attempts are the ones counted. The fan-out queued
    // in the registry also names the profile and social relays (contact
    // list), whose handshakes run alongside and succeed at once.
    fake.state.ensureRelayImpl = (url) => {
      if (!isActiveRelayUrl(url)) return Promise.resolve({ connected: true });
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error('first connection failed'));
      return new Promise((resolve) => {
        resolveReconnect = resolve;
      });
    };

    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    await getBridge();
    await flush();

    // The first handshake failed. The hub holds the socket and owns the
    // retry: nothing fires until its ~1 s jittered backoff elapses (the
    // bridge used to run an immediate second attempt of its own, which was
    // the second reconnect loop step 3 removed).
    const impl = getBridgeImpl()!;
    const activeRelaySubs = () => fake.state.subscriptions.filter((s) => s.relays?.some(isActiveRelayUrl));
    expect(attempts).toBe(1);
    expect(impl.isLoggedIn.get()).toBe(false);
    expect(activeRelaySubs()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1300);
    await flush();
    expect(attempts).toBe(2);
    expect(impl.isLoggedIn.get()).toBe(false);
    expect(activeRelaySubs()).toHaveLength(0);

    resolveReconnect({ connected: true });
    await flush(8);

    // The hub reports `connected`; the bridge opens the REQs and flips the gate.
    expect(impl.isLoggedIn.get()).toBe(true);
    expect(impl.myPubkey.get()).toBe(pkHex);
    expect(fake.state.subscriptions.some((s) => {
      const kinds = s.filter.kinds as number[] | undefined;
      return kinds?.includes(39000);
    })).toBe(true);
  });


  it('waits for switchRelay handshake failure instead of resolving on the old hard ceiling', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { getBridge } = await import('@/services/nostr-bridge/client');
      const { skHex, pkHex } = makeKeypair();
      const bridge = await getBridge();
      await bridge.loginWithNsec(skHex, pkHex);
      await flush();

      const relay = 'wss://slow-fail.example';
      // The hub normalizes once at its boundary (nostr-tools' normalizeURL
      // adds the trailing slash), so that is the spelling the pool sees.
      const isRelay = (url: string) => url === relay || url === relay + '/';
      fake.state.ensureRelayImpl = (url) => new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error(`cannot connect ${url}`)), 3000);
      });

      let settled = false;
      const switchPromise = bridge.switchRelay(relay).then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(1500);
      await flush();
      expect(settled).toBe(false);
      expect(fake.state.ensureRelayCalls.filter(isRelay)).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1500);
      await switchPromise;
      await flush(8);
      expect(settled).toBe(true);
      // switchRelay resolved on the failure itself, and the retry that
      // follows is the hub supervisor's (~1 s jittered backoff), not an
      // immediate second attempt by the bridge.
      expect(fake.state.ensureRelayCalls.filter(isRelay)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1300);
      await flush(8);
      expect(fake.state.ensureRelayCalls.filter(isRelay).length).toBeGreaterThan(1);
    } finally {
      fake.state.ensureRelayImpl = null;
      vi.useRealTimers();
    }
  });


  it('addRelay registers a relay in the rail without subscribing to it (no multi-relay bleed)', async () => {
    // Reproduces the second leak path: addRelay used to push the new URL
    // into `this.relays`, the bridge's active subscription set. A subsequent
    // background reconnect (`reconnectInBackground` → `connect()`) would
    // then issue kind 39000 against every relay the user had ever added,
    // mixing channels from multiple servers into one `this.groups` store.
    // The rail UX has only one active relay at a time (the green pill), so
    // `addRelay` should only register in `configuredRelays`: `switchRelay`
    // is the single path that activates a relay.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const activeBefore = (impl as unknown as { relays: string[] }).relays.slice();
    expect(activeBefore).toEqual(['wss://public.obelisk.ar']);

    const NEW_RELAY = 'wss://added-but-not-active.example';
    await bridge.addRelay(NEW_RELAY);

    // Active subscription set unchanged: only `switchRelay` should mutate it.
    const activeAfter = (impl as unknown as { relays: string[] }).relays.slice();
    expect(activeAfter).toEqual(activeBefore);
    expect(activeAfter).not.toContain(NEW_RELAY);

    // But the rail (configuredRelays) does include the new relay.
    expect(impl.configuredRelays.get()).toContain(NEW_RELAY);
  });


  it('addRelay persists a custom relay without preflight handshaking it', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();
    fake.state.ensureRelayCalls = [];

    const CUSTOM_RELAY = 'wss://custom-relay.example';
    await bridge.addRelay(CUSTOM_RELAY);

    const impl = getBridgeImpl()!;
    expect(impl.configuredRelays.get()).toContain(CUSTOM_RELAY);
    expect(fake.state.ensureRelayCalls).toEqual([]);
  });


  it('addRelay deduplicates equivalent relay URLs with and without a trailing slash', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    await bridge.addRelay('wss://lacrypta-relay.obelisk.ar/');
    await bridge.addRelay('wss://lacrypta-relay.obelisk.ar');

    const impl = getBridgeImpl()!;
    expect(impl.configuredRelays.get().filter((url) => url === 'wss://lacrypta-relay.obelisk.ar')).toHaveLength(1);
    expect(impl.configuredRelays.get()).not.toContain('wss://lacrypta-relay.obelisk.ar/');
  });


  it('migrates a persisted retired relay to La Crypta', async () => {
    window.localStorage.setItem('obelisk-dex/relays', JSON.stringify(['wss://relay.obelisk.ar', 'wss://public.obelisk.ar']));

    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    await getBridge();

    const impl = getBridgeImpl()!;
    expect(impl.configuredRelays.get()).toEqual([
      'wss://lacrypta-relay.obelisk.ar',
      'wss://public.obelisk.ar',
    ]);
    expect(JSON.parse(window.localStorage.getItem('obelisk-dex/relays')!)).toEqual([
      'wss://lacrypta-relay.obelisk.ar',
      'wss://public.obelisk.ar',
    ]);
  });
});

describe('searchMessages', () => {
  /**
   * Publish `n` kind-9 messages the fake relay will replay for any matching
   * REQ. The fake ignores `search`/`limit`, which is exactly what a relay
   * without NIP-50 does, so these tests exercise the client-side half.
   */
  function seedMessages(contents: string[], groupId = 'g1') {
    const sk = generateSecretKey();
    for (const [i, content] of contents.entries()) {
      fake.state.published.push(finalizeEvent({
        kind: 9,
        created_at: 1000 + i,
        content,
        tags: [['h', groupId]],
      }, sk));
    }
  }

  /** The filter the bridge actually put on the wire for the search REQ. */
  function lastSearchFilter(): Record<string, unknown> {
    const call = fake.state.querySyncCalls.filter(
      (c) => (c.filter.kinds as number[] | undefined)?.includes(9),
    ).at(-1);
    return call!.filter;
  }

  it('sends only the most selective term to the relay and ANDs the rest locally', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    seedMessages(['hola mundo cruel', 'hola solamente', 'mundo solo']);
    fake.state.querySyncCalls = [];

    const res = await bridge.searchMessages({
      terms: [{ text: 'hola', phrase: false }, { text: 'mundo', phrase: false }],
    });

    // A relay matches `search` as a literal substring of the whole value, so
    // sending "hola mundo" would return nothing. One term goes out...
    expect(lastSearchFilter().search).toBe('mundo');
    // ...and the AND is completed here.
    expect(res.hits.map((h) => h.content)).toEqual(['hola mundo cruel']);
  });

  it('omits search entirely when the relay has no NIP-50, still filtering locally', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    seedMessages(['keep this one', 'drop that one']);
    fake.state.querySyncCalls = [];

    const res = await bridge.searchMessages({
      terms: [{ text: 'keep', phrase: false }],
      relaySupportsSearch: false,
    });

    expect(lastSearchFilter().search).toBeUndefined();
    expect(res.relayFiltered).toBe(false);
    expect(res.hits.map((h) => h.content)).toEqual(['keep this one']);
  });

  it('over-fetches before applying has:, instead of filtering an already-trimmed page', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    // One image among many plain messages: with limit-then-filter it would
    // fall outside the window and the search would look empty.
    seedMessages([
      ...Array.from({ length: 20 }, (_, i) => `plain ${i}`),
      'look https://cdn.example/cat.png',
    ]);
    fake.state.querySyncCalls = [];

    const res = await bridge.searchMessages({ has: ['image'], limit: 5 });

    expect(lastSearchFilter().limit).toBeGreaterThan(5);
    expect(res.hits.map((h) => h.content)).toEqual(['look https://cdn.example/cat.png']);
  });

  it('trims to limit and flags the result as partial', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    seedMessages(Array.from({ length: 10 }, (_, i) => `hit ${i}`));
    fake.state.querySyncCalls = [];

    const res = await bridge.searchMessages({ terms: [{ text: 'hit', phrase: false }], limit: 3 });

    expect(res.hits).toHaveLength(3);
    expect(res.partial).toBe(true);
    // Newest first.
    expect(res.hits[0].createdAt).toBeGreaterThan(res.hits[1].createdAt);
  });

  it('matches a quoted phrase only when contiguous', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    seedMessages(['deployment failed badly', 'deployment then it failed']);
    fake.state.querySyncCalls = [];

    const res = await bridge.searchMessages({
      terms: [{ text: 'deployment failed', phrase: true }],
    });

    expect(res.hits.map((h) => h.content)).toEqual(['deployment failed badly']);
  });
});
