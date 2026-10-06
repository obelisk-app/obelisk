/**
 * The wallet relay is reached only through the page's RelayHub, under the
 * connection's own client-key identity: never a socket of its own, never
 * the session's socket, never an AUTH as the user.
 */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { FakeRelayFactory, SESSION_IDENTITY_ID, getRelayHub, resetRelayHubForTests } from '@/lib/relay-hub';
import { connectNwcWallet, ensureNwcWalletLoaded, nwcPayerFor } from '@/services/wallet/nwc-wallet';
import { FakeNwcWallet, type FakeWalletOptions } from '@tests/support/fake-nwc-wallet';

const userSecret = generateSecretKey();
const USER = getPublicKey(userSecret);

let factory: FakeRelayFactory;
let wallet: FakeNwcWallet;
let userSigner: ReturnType<typeof vi.fn<(t: EventTemplate) => Promise<VerifiedEvent>>>;
let sockets: number;

function install(opts: FakeWalletOptions = {}): void {
  resetRelayHubForTests();
  factory = new FakeRelayFactory();
  wallet = new FakeNwcWallet(opts);
  const hub = getRelayHub({ relayFactory: wallet.attach(factory) });
  // The logged-in user, with a signer that would answer any AUTH it was asked for.
  userSigner = vi.fn<(t: EventTemplate) => Promise<VerifiedEvent>>(async (t) => finalizeEvent(t, userSecret));
  hub.setIdentity({ id: SESSION_IDENTITY_ID, pubkey: USER, signer: userSigner, authPolicy: 'auth-when-challenged', localSigner: true });
}

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  sockets = 0;
  vi.stubGlobal('WebSocket', class {
    constructor() {
      sockets += 1;
      throw new Error('no sockets in this suite');
    }
  });
  window.localStorage.clear();
  await ensureNwcWalletLoaded(null);
});

afterEach(async () => {
  await ensureNwcWalletLoaded(null);
  resetRelayHubForTests();
  vi.unstubAllGlobals();
});

async function connectAndPay(): Promise<void> {
  await ensureNwcWalletLoaded(USER);
  await connectNwcWallet(USER, wallet.uri);
  await nwcPayerFor(USER)!.pay('lnbc1invoice');
}

describe('the wallet relay connection', () => {
  it('is owned by the hub, under the client key\'s own identity, with no stray WebSocket', async () => {
    install();
    await connectAndPay();

    const onWalletRelay = factory.calls.filter((c) => c.url === wallet.relayUrl);
    expect(onWalletRelay.length).toBeGreaterThan(0);
    expect(new Set(onWalletRelay.map((c) => c.identityId))).toEqual(new Set([`nwc:${wallet.clientPubkey}`]));
    expect(factory.get(wallet.relayUrl, SESSION_IDENTITY_ID)).toBeUndefined();
    expect(sockets).toBe(0);
    // Every request on the wire is signed by the client key.
    expect(new Set(wallet.requests.map((r) => r.event.pubkey))).toEqual(new Set([wallet.clientPubkey]));
  });

  it('does not answer a challenge the relay does not insist on', async () => {
    install({ challenge: true });
    await connectAndPay();

    expect(wallet.relays.flatMap((r) => r.sentAuth)).toEqual([]);
    expect(userSigner).not.toHaveBeenCalled();
    expect(getRelayHub().leaseCount(wallet.relayUrl, `nwc:${wallet.clientPubkey}`)).toBe(0);
  });

  it('authenticates as the client key when the relay demands it, never as the user', async () => {
    install({ requireAuth: true });
    await connectAndPay();

    const auths = wallet.relays.flatMap((r) => r.sentAuth);
    expect(auths.length).toBeGreaterThan(0);
    expect(new Set(auths.map((a) => a.pubkey))).toEqual(new Set([wallet.clientPubkey]));
    expect(auths.some((a) => a.pubkey === USER)).toBe(false);
    expect(userSigner).not.toHaveBeenCalled();
    expect(wallet.calls('pay_invoice')).toHaveLength(1);
  });

  it('leaves nothing on the hub once disconnected or replaced by another account', async () => {
    install();
    await connectAndPay();
    const hub = getRelayHub();
    expect(hub.getIdentity(`nwc:${wallet.clientPubkey}`)).toBeDefined();

    await ensureNwcWalletLoaded('c'.repeat(64));

    expect(hub.getIdentity(`nwc:${wallet.clientPubkey}`)).toBeUndefined();
    expect(hub.statuses().filter((s) => s.identityId.startsWith('nwc:'))).toEqual([]);
  });
});
