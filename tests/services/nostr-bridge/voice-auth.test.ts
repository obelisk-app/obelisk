/**
 * NIP-42 for a mesh call, counted on the wire (RelayHub step 5).
 *
 * What this pins, in the user's terms:
 *   1. joining a call on the relay being browsed costs zero extra signer
 *      prompts and opens no second socket: the roster and signal REQs ride
 *      the session's one socket and the AUTH it already answered. Before
 *      step 5 the voice pool opened a second socket to the same relay, and
 *      every call join was a second NIP-42 prompt on a relay the session
 *      already held authenticated;
 *   2. a call pinned to a relay the user is not browsing answers that
 *      relay's challenge only while a call REQ holds the `'voice'` lease,
 *      once per socket generation, and never repaints the browsed relay's
 *      access banner. When the last call REQ closes the lease goes, the
 *      relay's AUTH record goes, and the socket is let go on the switch
 *      grace rather than kept open for nothing.
 *
 * No `SimplePool` is faked: the real pool and relay run over
 * `FakeRelaySocket` (`test-support.ts`), prompts are the kind 22242
 * signatures a NIP-07 spy was asked for. The publish-side retry this file
 * used to hold (`authRetryOnRestricted`) is in `publish-auth-retry.test.ts`,
 * on the pool-level fake it needs.
 */
import { describe, expect, it } from 'vitest';
import type { Filter } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';
import { FakeRelaySocket, authPrompts, loginWithNip07Spy, settle, installFakeRelayPage } from '@tests/services/nostr-bridge/support/fake-relay-page';

const ACTIVE_RELAY = 'wss://public.obelisk.ar/';
const VOICE_RELAY = 'wss://voice.example';
/** nostr-tools keeps the trailing slash on a bare host; that is the socket's URL. */
const VOICE_RELAY_WIRE = normalizeURL(VOICE_RELAY);
const RELAY_SWITCH_GRACE_MS = 60_000;

const roster: Filter = { kinds: [20078], '#e': ['ch'] };
const signalsFor = (me: string): Filter => ({ kinds: [25050], '#p': [me] });
const reqKinds = (socket: FakeRelaySocket, from = 0): number[] =>
  socket.frames('REQ').slice(from).map((f) => (f[2] as Filter).kinds?.[0] ?? -1);

warmBridgeModules();
installFakeRelayPage();

describe('a mesh call on the relay being browsed', () => {
  it('costs zero extra signer prompts and no second socket: the REQs ride the session socket and its AUTH', async () => {
    const { pk, signEvent, impl, hub } = await loginWithNip07Spy();
    expect(authPrompts(signEvent)).toBe(1);
    const [socket] = FakeRelaySocket.forUrl(ACTIVE_RELAY);
    const reqsBefore = socket.frames('REQ').length;
    const openBefore = hub.status(ACTIVE_RELAY).openSubs;
    expect(hub.leaseCount(ACTIVE_RELAY)).toBe(1); // the 'active' lease

    const opts = { relays: [ACTIVE_RELAY], relayMode: 'replace' as const, answerAuth: true };
    const stopRoster = impl.subscribeVoiceFilterWatched(roster, () => undefined, opts);
    const stopSignals = impl.subscribeVoiceFilterWatched(signalsFor(pk), () => undefined, opts);
    await settle();

    // Zero prompts added, on the spy and in the hub's own count.
    expect(authPrompts(signEvent)).toBe(1);
    expect(hub.promptCount()).toBe(1);
    // One socket to the relay, the same one: no second pool, no second
    // AUTH frame, and the hub's table has one session entry for the URL.
    expect(FakeRelaySocket.forUrl(ACTIVE_RELAY)).toHaveLength(1);
    expect(socket.frames('AUTH')).toHaveLength(1);
    expect(hub.statuses().filter((s) => s.identityId === 'session' && s.url === ACTIVE_RELAY)).toHaveLength(1);
    // Both call REQs went out on it, and the relay served them at once (the
    // socket was already authenticated, so no CLOSED auth-required round).
    const issued = reqKinds(socket, reqsBefore);
    expect(issued).toContain(20078);
    expect(issued).toContain(25050);
    expect(hub.status(ACTIVE_RELAY).openSubs).toBe(openBefore + 2);
    expect(hub.leaseCount(ACTIVE_RELAY)).toBe(3); // 'active' plus one 'voice' per call REQ

    stopRoster();
    stopSignals();
    await settle();
    // The call is gone; the browsed relay keeps its socket, its AUTH and its
    // own lease, and the user was never asked again.
    expect(hub.status(ACTIVE_RELAY)).toMatchObject({ connection: 'connected', auth: 'authenticated', openSubs: openBefore });
    expect(hub.leaseCount(ACTIVE_RELAY)).toBe(1);
    expect(FakeRelaySocket.forUrl(ACTIVE_RELAY)).toHaveLength(1);
    expect(authPrompts(signEvent)).toBe(1);
  });
});

describe('a mesh call pinned to a relay the user is not browsing', () => {
  it("answers that relay's AUTH only while a call REQ holds the lease, once per socket, and never touches the browsed relay's banner", async () => {
    const { pk, signEvent, impl, hub } = await loginWithNip07Spy();
    expect(hub.leaseCount(VOICE_RELAY)).toBe(0);
    expect(FakeRelaySocket.forUrl(VOICE_RELAY_WIRE)).toHaveLength(0);

    const opts = { relays: [VOICE_RELAY], relayMode: 'replace' as const, answerAuth: true };
    const stopRoster = impl.subscribeVoiceFilterWatched(roster, () => undefined, opts);
    await settle();

    // One socket to the voice relay, challenged on open and answered because
    // the call's lease was in place before the REQ: the one prompt a relay
    // the session has never authenticated to is allowed to cost.
    const sockets = FakeRelaySocket.forUrl(VOICE_RELAY_WIRE);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].authed).toBe(true);
    expect(sockets[0].frames('AUTH')).toHaveLength(1);
    expect(reqKinds(sockets[0])).toContain(20078);
    expect(authPrompts(signEvent)).toBe(2);
    expect(hub.status(VOICE_RELAY)).toMatchObject({ connection: 'connected', auth: 'authenticated', promptCount: 1 });
    expect(hub.leaseCount(VOICE_RELAY)).toBe(1);
    // Answering AUTH there must not repaint the browsed relay's indicator.
    expect(impl.relayAccess.get()[VOICE_RELAY]).toBeUndefined();
    expect(hub.status(ACTIVE_RELAY)).toMatchObject({ auth: 'authenticated', promptCount: 1 });

    // The call's second REQ on the same relay shares the socket and the AUTH.
    const stopSignals = impl.subscribeVoiceFilterWatched(signalsFor(pk), () => undefined, opts);
    await settle();
    expect(authPrompts(signEvent)).toBe(2);
    expect(FakeRelaySocket.forUrl(VOICE_RELAY_WIRE)).toHaveLength(1);
    expect(sockets[0].frames('AUTH')).toHaveLength(1);
    expect(reqKinds(sockets[0])).toContain(25050);
    expect(hub.leaseCount(VOICE_RELAY)).toBe(2);

    // The lease is held until the last call REQ closes.
    stopRoster();
    await settle();
    expect(hub.leaseCount(VOICE_RELAY)).toBe(1);
    expect(hub.status(VOICE_RELAY).auth).toBe('authenticated');
    stopSignals();
    await settle();
    expect(hub.leaseCount(VOICE_RELAY)).toBe(0);
    expect(hub.status(VOICE_RELAY).auth).toBe('none');

    // Nobody browses or pins the relay any more: the bridge hands its socket
    // to the switch grace, after which it is closed and forgotten, with the
    // browsed relay untouched and no further prompt.
    expect(sockets[0].readyState).toBe(FakeRelaySocket.OPEN);
    await settle(RELAY_SWITCH_GRACE_MS, 1);
    expect(sockets[0].readyState).toBe(FakeRelaySocket.CLOSED);
    expect(hub.status(VOICE_RELAY).connection).toBe('idle');
    expect(hub.status(ACTIVE_RELAY)).toMatchObject({ connection: 'connected', auth: 'authenticated' });
    expect(authPrompts(signEvent)).toBe(2);
  });
});
