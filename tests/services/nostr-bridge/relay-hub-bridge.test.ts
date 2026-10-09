/**
 * The properties the RelayHub migration exists to deliver, proven through
 * the bridge rather than inside the hub:
 *
 *   1. exactly one signer prompt per socket generation, across a socket drop
 *      and across the retries (online, visibility) that used to rebuild the
 *      pool and re-AUTH a healthy socket (step 2);
 *   2. one socket per relay URL, however many callers subscribe or publish
 *      concurrently (step 2);
 *   3. after a drop, every live REQ comes back on the new socket generation
 *      from the hub's registry, the channel in view first (steps 3 and 7:
 *      disabling `SubscriptionRegistry.onSocketOpen` turns this red);
 *   4. two callers asking for the same filter on the same relay share one
 *      REQ, which closes only when the last of them lets go (step 7).
 *
 * No `SimplePool` is faked here. The real nostr-tools pool and relay run over
 * a fake WebSocket that behaves like a NIP-42 relay (`FakeRelaySocket` in
 * `test-support.ts`): it challenges on open, refuses every REQ that beats
 * the AUTH with `CLOSED auth-required:`, and accepts REQs and EVENTs after a
 * valid kind 22242. Prompts are counted on a NIP-07 signer spy, so a
 * signature is a prompt the user would have seen.
 *
 * This file and the SDK relay package's `test/hub/auth.test.ts` are not redundant and
 * neither covers the other (round 6 ruling, `RULING-hub-pool-seam.md`).
 * nostr-tools' per-socket `authPromise` collapses concurrent AUTH calls
 * before the hub's memo is consulted, so a memo re-keyed on the challenge
 * plus `created_at` (the original bug shape) is invisible from here; only
 * the hub test catches it. Conversely, a bridge-level regression such as
 * rebuilding the pool or tearing the socket down on every background
 * reconnect is invisible to the hub test; only this file catches it. Do
 * not delete either on the grounds that the other covers it.
 */
import { describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { EventTemplate, Filter, VerifiedEvent } from 'nostr-tools';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';
import { FakeRelaySocket, authPrompts, bytesToHex, settle, installFakeRelayPage } from '@tests/services/nostr-bridge/support/fake-relay-page';

const ACTIVE_RELAY = 'wss://public.obelisk.ar/';

warmBridgeModules();
installFakeRelayPage();

describe('the bridge on the RelayHub', () => {
  it('authenticates the restored account on a fresh relay socket after reload', async () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const signEvent = vi.fn(async (template: EventTemplate): Promise<VerifiedEvent> => finalizeEvent(template, sk));
    Object.defineProperty(window, 'nostr', { configurable: true, value: { signEvent, getPublicKey: async () => pk } });
    localStorage.setItem('obelisk-dex/session', JSON.stringify({
      v: 2, pubKeyHex: pk, loginMethod: 'nip07', relayUrl: ACTIVE_RELAY,
    }));
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const restoring = getBridge();
    await settle();
    const bridge = await restoring;
    await settle();
    expect(bridge.isLoggedIn.get()).toBe(true);
    expect(authPrompts(signEvent)).toBe(1);
    expect(FakeRelaySocket.forUrl(ACTIVE_RELAY).at(-1)?.authed).toBe(true);
  });

  it('asks the signer exactly once per socket generation, across a drop and across the retries that used to rebuild the pool', async () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const signEvent = vi.fn(async (template: EventTemplate): Promise<VerifiedEvent> => finalizeEvent(template, sk));
    Object.defineProperty(window, 'nostr', { configurable: true, value: { signEvent, getPublicKey: async () => pk } });

    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { getRelayHub } = await import('@nostr-wot/relay/hub');
    const bridge = await getBridge();
    const login = bridge.loginWithNip07(pk);
    await settle();
    await login;
    await settle();
    const impl = getBridgeImpl()!;
    const hub = getRelayHub();

    // Generation 1: one socket, challenged on open, REQs raced the AUTH and
    // were refused, then re-issued on the authenticated socket. All of that
    // cost one prompt.
    expect(authPrompts(signEvent)).toBe(1);
    const gen1 = FakeRelaySocket.forUrl(ACTIVE_RELAY);
    expect(gen1).toHaveLength(1);
    expect(gen1[0].authed).toBe(true);
    expect(gen1[0].frames('REQ').length).toBeGreaterThan(2);
    expect(gen1[0].frames('AUTH')).toHaveLength(1);
    expect(hub.status(ACTIVE_RELAY)).toMatchObject({ socketGeneration: 1, auth: 'authenticated', promptCount: 1 });
    expect(impl.connectionState.get()).toBe('Connected');

    // Retries that used to tear the pool down and rebuild it: coming back
    // online, and a tab becoming visible while the bridge believed it was
    // disconnected. The socket is healthy, so nothing re-handshakes and
    // nothing re-AUTHs.
    window.dispatchEvent(new Event('online'));
    await settle();
    impl.connectionState.set('Disconnected');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(authPrompts(signEvent)).toBe(1);
    expect(FakeRelaySocket.forUrl(ACTIVE_RELAY)).toHaveLength(1);
    expect(impl.connectionState.get()).toBe('Connected');

    // The transport drops. The hub reconnects the same relay object on a new
    // socket, the relay issues a new challenge, and that is the one prompt a
    // new generation is allowed to cost. Every re-issued REQ rides it.
    gen1[0].drop();
    await settle(100, 20);
    expect(authPrompts(signEvent)).toBe(2);
    const gen2 = FakeRelaySocket.forUrl(ACTIVE_RELAY);
    expect(gen2).toHaveLength(2);
    expect(gen2[1].authed).toBe(true);
    expect(gen2[1].frames('REQ').length).toBeGreaterThan(2);
    expect(gen2[1].frames('AUTH')).toHaveLength(1);
    expect(hub.status(ACTIVE_RELAY)).toMatchObject({ socketGeneration: 2, auth: 'authenticated', promptCount: 2 });
    expect(impl.connectionState.get()).toBe('Connected');

    // And the retries again, on generation 2: still no third prompt.
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(authPrompts(signEvent)).toBe(2);
    expect(FakeRelaySocket.forUrl(ACTIVE_RELAY)).toHaveLength(2);
    expect(hub.promptCount()).toBe(2);
  });

  it('opens one socket per relay URL under concurrent subscribes and publishes', async () => {
    const sk = generateSecretKey();
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { getRelayHub } = await import('@nostr-wot/relay/hub');
    const bridge = await getBridge();
    const login = bridge.loginWithNsec(bytesToHex(sk), getPublicKey(sk));
    await settle();
    await login;
    await settle();
    const impl = getBridgeImpl()!;

    // Fan out concurrently, the way mounted components do: watched REQs on
    // the active relay, a plain REQ, a publish, and REQs that name the active
    // relay with a different spelling.
    const stops = [
      impl.subscribeFilterWatched({ kinds: [1] }, () => undefined),
      impl.subscribeFilterWatched({ kinds: [7] }, () => undefined),
      impl.subscribeFilterWatched({ kinds: [1] }, () => undefined),
      impl.subscribeFilter({ kinds: [30078] }, () => undefined),
      impl.subscribeFilterWatched({ kinds: [9] }, () => undefined, { relays: ['wss://public.obelisk.ar'], relayMode: 'merge' }),
    ];
    const published = impl.publishEvent({ kind: 1, content: 'one socket', tags: [] }, { quiet: true });
    await settle();
    await published;
    await settle();

    const byUrl = new Map<string, number>();
    for (const socket of FakeRelaySocket.sockets) byUrl.set(socket.url, (byUrl.get(socket.url) ?? 0) + 1);
    expect(byUrl.get(ACTIVE_RELAY)).toBe(1);
    for (const [url, count] of byUrl) expect({ url, count }).toEqual({ url, count: 1 });
    // The hub's socket table agrees: one entry per URL for the session.
    const urls = getRelayHub().statuses().filter((s) => s.identityId === 'session').map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(ACTIVE_RELAY);
    // And every REQ reached the wire on that one socket.
    const [socket] = FakeRelaySocket.forUrl(ACTIVE_RELAY);
    const reqKinds = socket.frames('REQ').map((f) => (f[2] as { kinds?: number[] }).kinds?.[0]);
    for (const kind of [1, 7, 30078, 9]) expect(reqKinds).toContain(kind);
    expect(socket.frames('EVENT')).toHaveLength(1);

    for (const stop of stops) stop();
  });

  it('re-issues every pre-drop REQ on the new socket generation from the hub\'s connected report, the active channel first', async () => {
    const sk = generateSecretKey();
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { getRelayHub } = await import('@nostr-wot/relay/hub');
    const bridge = await getBridge();
    const login = bridge.loginWithNsec(bytesToHex(sk), getPublicKey(sk));
    await settle();
    await login;
    await settle();
    const impl = getBridgeImpl()!;

    // Two channels with their own message streams, one of them in view.
    const stops = [
      bridge.subscribeMessages('g-background', () => undefined),
      bridge.subscribeMessages('g-active', () => undefined),
    ];
    impl.setActiveGroup('g-active');
    await settle();

    const reqFilters = (socket: FakeRelaySocket): Filter[] => socket.frames('REQ').map((f) => f[2] as Filter);
    const kindsOf = (filters: Filter[]): Set<number> => new Set(filters.flatMap((f) => f.kinds ?? []));
    const groupsOf = (filters: Filter[]): string[] =>
      filters.filter((f) => f.kinds?.includes(9) && f['#h']).map((f) => (f['#h'] as string[])[0]);
    const [gen1] = FakeRelaySocket.forUrl(ACTIVE_RELAY);
    const before = reqFilters(gen1);
    expect(kindsOf(before)).toContain(39000);
    expect(kindsOf(before)).toContain(9);
    expect(new Set(groupsOf(before))).toEqual(new Set(['g-background', 'g-active']));

    // The transport drops. The bridge closes its REQs on the dead socket at
    // once and reports Disconnected; it schedules nothing. The hub's
    // supervisor reconnects (~1 s jittered backoff) and its `connected`
    // report is what re-issues the REQs on the new generation.
    gen1.drop();
    expect(impl.connectionState.get()).toBe('Disconnected');
    expect(FakeRelaySocket.forUrl(ACTIVE_RELAY)).toHaveLength(1);
    await settle(100, 20);

    const sockets = FakeRelaySocket.forUrl(ACTIVE_RELAY);
    expect(sockets).toHaveLength(2);
    const after = reqFilters(sockets[1]);
    // Every kind the first generation asked for is asked for again...
    for (const kind of kindsOf(before)) expect(kindsOf(after)).toContain(kind);
    // ...every per-channel stream comes back, the channel in view first...
    expect(new Set(groupsOf(after))).toEqual(new Set(groupsOf(before)));
    expect(groupsOf(after)[0]).toBe('g-active');
    // ...on the hub's second generation, and the bridge reports it.
    expect(getRelayHub().status(ACTIVE_RELAY)).toMatchObject({ socketGeneration: 2, connection: 'connected' });
    expect(impl.connectionState.get()).toBe('Connected');
    expect(impl.isLoggedIn.get()).toBe(true);

    for (const stop of stops) stop();
  });

  it('collapses two identical kind-1059 REQs into one on the wire, which closes only when the last holder releases', async () => {
    const sk = generateSecretKey();
    const me = getPublicKey(sk);
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { getRelayHub } = await import('@nostr-wot/relay/hub');
    const bridge = await getBridge();
    const login = bridge.loginWithNsec(bytesToHex(sk), me);
    await settle();
    await login;
    await settle();
    const impl = getBridgeImpl()!;
    const hub = getRelayHub();

    // The read-state relay-sync REQ for gift wraps addressed to us, exactly
    // as `relay-sync.ts` issues it. The round 1 audit found it duplicated
    // against the DM inbox REQ; the hub keys REQs by filter, so two callers
    // asking for it cost one REQ.
    const filter: Filter = { kinds: [1059], '#p': [me] };
    const [socket] = FakeRelaySocket.forUrl(ACTIVE_RELAY);
    const wrapReqs = () => socket.frames('REQ').filter((f) => {
      const req = f[2] as Filter;
      return req.kinds?.length === 1 && req.kinds[0] === 1059 && (req['#p'] as string[] | undefined)?.[0] === me && req.limit === undefined;
    });
    const reqsBefore = wrapReqs().length;
    const openBefore = hub.status(ACTIVE_RELAY).openSubs;

    const stopA = impl.subscribeFilterWatched(filter, () => undefined);
    const stopB = impl.subscribeFilterWatched(filter, () => undefined);
    await settle();

    // One REQ on the wire for the two holders, one open sub in the hub.
    const issued = wrapReqs();
    expect(issued.length - reqsBefore).toBe(1);
    expect(hub.status(ACTIVE_RELAY).openSubs).toBe(openBefore + 1);
    const subId = issued[issued.length - 1][1];
    const closedOnWire = () => socket.frames('CLOSE').some((f) => f[1] === subId);

    // The first holder lets go: the REQ stays up for the second.
    stopA();
    await settle();
    expect(closedOnWire()).toBe(false);
    expect(hub.status(ACTIVE_RELAY).openSubs).toBe(openBefore + 1);

    // The last holder lets go: the hub CLOSEs it.
    stopB();
    await settle();
    expect(closedOnWire()).toBe(true);
    expect(hub.status(ACTIVE_RELAY).openSubs).toBe(openBefore);
    expect(wrapReqs().length - reqsBefore).toBe(1);
  });
});
