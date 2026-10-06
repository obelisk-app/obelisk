/**
 * The background watch on the RelayHub (step 6), counted on the wire: the
 * acceptance test the round 2 design names for it.
 *
 *   A -> B -> A with A watched costs zero prompts.
 *
 * Before step 6 the watcher opened its own SimplePool: leaving A closed the
 * session's socket to A and the watcher opened a second one (one prompt),
 * and coming back to A opened a third (another prompt). Now the watch's two
 * kind-9 REQs ride the session's one socket to A under a `'watch'` lease,
 * so A keeps the socket it authenticated on login and the return costs no
 * handshake and no signature. B, a relay the session never authenticated
 * to, costs the one prompt a new relay is allowed to.
 *
 * Same harness as `relay-hub-bridge.test.ts` and `voice-auth.test.ts`: the
 * real pool and relay over `FakeRelaySocket`, prompts counted on a NIP-07
 * signer spy.
 */
import { describe, expect, it } from 'vitest';
import type { Filter } from 'nostr-tools';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';
import { FakeRelaySocket, authPrompts, loginWithNip07Spy, settle, installFakeRelayPage } from '@/services/nostr-bridge/test-support';

const A = 'wss://public.obelisk.ar';
const B = 'wss://other.example';
/** nostr-tools keeps the trailing slash on a bare host; that is the socket's URL. */
const onWire = (url: string) => `${url}/`;
const kind9Reqs = (socket: FakeRelaySocket) =>
  socket.frames('REQ').filter((f) => (f[2] as Filter).kinds?.length === 1 && (f[2] as Filter).kinds?.[0] === 9);

warmBridgeModules();
installFakeRelayPage();

describe('the background watch on the hub', () => {
  it('A -> B -> A with A watched costs zero prompts: A keeps its socket and its AUTH while watched', async () => {
    const { signEvent, impl, hub } = await loginWithNip07Spy();
    expect(authPrompts(signEvent)).toBe(1);
    expect(impl.getBackgroundWatchedRelays()).toEqual([]);
    const [aSocket] = FakeRelaySocket.forUrl(onWire(A));
    expect(aSocket.authed).toBe(true);

    // A -> B. B is a relay the session never authenticated to: one prompt,
    // on its one socket. That is the only prompt this whole journey costs.
    const toB = impl.switchRelay(B);
    await settle();
    await toB;
    await settle();
    expect(authPrompts(signEvent)).toBe(2);
    expect(FakeRelaySocket.forUrl(onWire(B))).toHaveLength(1);
    expect(hub.status(B)).toMatchObject({ connection: 'connected', auth: 'authenticated', promptCount: 1 });
    expect(impl.connectionState.get()).toBe('Connected');

    // A is now watched: the socket it authenticated on login is still its
    // one and only, open, with the watch's two kind-9 REQs served on it
    // (no CLOSED auth-required round: the AUTH was already answered) under
    // a 'watch' lease, and no new AUTH frame went out.
    expect(impl.getBackgroundWatchedRelays()).toEqual([A]);
    expect(FakeRelaySocket.forUrl(onWire(A))).toHaveLength(1);
    expect(aSocket.readyState).toBe(FakeRelaySocket.OPEN);
    expect(aSocket.frames('AUTH')).toHaveLength(1);
    expect(hub.leaseCount(A)).toBe(1);
    // (A is also a profile relay, so the session's kind-3 and media REQs
    // fan out onto it as well; B below, which is not, shows exactly two.)
    expect(hub.status(A)).toMatchObject({ connection: 'connected', socketGeneration: 1 });
    expect(hub.status(A).openSubs).toBeGreaterThanOrEqual(2);
    const watchReqs = kind9Reqs(aSocket).slice(-2).map((f) => f[2] as Filter);
    expect(watchReqs.some((f) => Array.isArray(f['#p']))).toBe(true);  // the `#p:[me]` catch-up
    expect(watchReqs.some((f) => !f['#p'] && typeof f.since === 'number')).toBe(true); // live from now

    // B -> A. No handshake (same socket generation), no prompt: the hub's
    // count and the spy agree, and the session is up on A at once.
    const toA = impl.switchRelay(A);
    await settle();
    await toA;
    await settle();
    expect(authPrompts(signEvent)).toBe(2);
    expect(hub.promptCount()).toBe(2);
    expect(FakeRelaySocket.forUrl(onWire(A))).toHaveLength(1);
    expect(aSocket.frames('AUTH')).toHaveLength(1);
    expect(hub.status(A)).toMatchObject({ connection: 'connected', socketGeneration: 1 });
    expect(impl.connectionState.get()).toBe('Connected');
    expect(impl.isLoggedIn.get()).toBe(true);
    // The session's REQs are back on A (the watch's two were replaced by
    // the full fan-out), and B, now the watched one, kept its socket too.
    expect(hub.status(A).openSubs).toBeGreaterThan(2);
    expect(hub.leaseCount(A)).toBe(1); // 'active' took over from 'watch'
    expect(impl.getBackgroundWatchedRelays()).toEqual([B]);
    expect(FakeRelaySocket.forUrl(onWire(B))).toHaveLength(1);
    expect(hub.leaseCount(B)).toBe(1); // 'watch'
    expect(hub.status(B)).toMatchObject({ connection: 'connected', openSubs: 2 });
  });
});
