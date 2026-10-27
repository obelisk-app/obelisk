/**
 * Saving the own profile while a profile lookup relay is down (flow review
 * 2026-10-26: wss://purplepag.es answered HTTP 502 to every handshake).
 *
 * The real bridge, hub and nostr-tools pool run over `FakeRelaySocket`; a
 * URL in `deadUrls` errors and closes without opening, as a 502 does, and
 * the hub keeps retrying it. Two things used to go wrong:
 *
 *   1. a brand-new account (no kind 0 anywhere) could not save at all: the
 *      read-before-write lookup was never `complete`, so the edit threw
 *      `profile-load-failed`;
 *   2. once past that, the publish waited out the dead relay's whole ack
 *      window after the live relays had said OK.
 */
import { describe, expect, it } from 'vitest';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';
import { FakeRelaySocket, installFakeRelayPage, loginWithNip07Spy, settle } from '@tests/services/nostr-bridge/support/fake-relay-page';
import { PROFILE_LOOKUP_MAX_WAIT_MS } from '@/constants/nostr-bridge/profile';

const DEAD = 'wss://purplepag.es/';
const LIVE = ['wss://public.obelisk.ar/', 'wss://lacrypta-relay.obelisk.ar/'];

warmBridgeModules();
installFakeRelayPage();

/** Run the edit on the fake clock; the outcome and the fake time it took. */
async function saveProfile(name: string) {
  const { bridge } = await loginWithNip07Spy();
  let outcome: { ok: true } | { ok: false; code: unknown } | null = null;
  const started = Date.now();
  let finishedAt = 0;
  bridge.editUserMetadata({ name }).then(
    () => { outcome = { ok: true }; finishedAt = Date.now(); },
    (error: { code?: unknown }) => { outcome = { ok: false, code: error.code }; finishedAt = Date.now(); },
  );
  for (let i = 0; i < 200 && outcome === null; i++) await settle(100, 1);
  return { outcome: outcome as typeof outcome, elapsed: finishedAt - started };
}

function publishedKind0(url: string): number {
  return FakeRelaySocket.forUrl(url).flatMap((s) => s.frames('EVENT')).filter((f) => (f[1] as { kind: number }).kind === 0).length;
}

describe('saving the own profile while a lookup relay is down', () => {
  it('lets a new account save its first profile and publishes it to the live relays', async () => {
    FakeRelaySocket.deadUrls.add(DEAD);
    const { outcome } = await saveProfile('First name');
    expect(outcome).toEqual({ ok: true });
    for (const url of LIVE) expect(publishedKind0(url)).toBe(1);
    expect(FakeRelaySocket.forUrl(DEAD).length).toBeGreaterThan(0);
  });

  it('resolves once the live relays said OK, without waiting out the dead relay', async () => {
    FakeRelaySocket.deadUrls.add(DEAD);
    const { outcome, elapsed } = await saveProfile('Quick');
    expect(outcome).toEqual({ ok: true });
    // The lookup still waits its own bound for the dead relay; the publish
    // after it no longer adds the hub's 4 s ack window on top.
    expect(elapsed).toBeLessThan(PROFILE_LOOKUP_MAX_WAIT_MS + 1000);
  });

  it('still refuses to overwrite when a lookup relay is up but never answers', async () => {
    FakeRelaySocket.silentUrls.add(DEAD);
    const { outcome } = await saveProfile('Careful');
    expect(outcome).toEqual({ ok: false, code: 'profile-load-failed' });
    for (const url of LIVE) expect(publishedKind0(url)).toBe(0);
  });
});
