/**
 * Loading a stored session: migrating a pre-vault plaintext record, and the
 * three ways a sealed record can fail to open (no IndexedDB, key gone,
 * tampered box). Every path ends logged in with the secret in memory only,
 * or logged out with the record erased and the reason in `sessionNotice`.
 * Also the NIP-46 record, whose client secret and connect secret are sealed
 * like an nsec.
 */
import { describe, expect, it, vi } from 'vitest';
import { installBridgeHarness, makeKeypair } from '@tests/services/nostr-bridge/support/bridge-harness';
import {
  SDK_NIP46_KEY,
  SDK_NSEC_KEY,
  SESSION_KEY,
  deleteVaultKey,
  expectNowhereOnDisk,
  installVaultPage,
  reload,
  removeIndexedDb,
  storedRecord,
} from '@tests/services/nostr-bridge/support/vault-page';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());
const bunker = vi.hoisted(() => ({ fromBunkerSecrets: [] as Array<string | null> }));

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

vi.mock('nostr-tools/nip46', () => {
  class BunkerSigner {
    constructor(readonly bp: { pubkey: string; relays: string[]; secret: string | null }) {}
    static fromBunker(_sk: Uint8Array, bp: { pubkey: string; relays: string[]; secret: string | null }) {
      bunker.fromBunkerSecrets.push(bp.secret);
      return new BunkerSigner(bp);
    }
    async connect(): Promise<void> {}
    async getPublicKey(): Promise<string> { return 'c'.repeat(64); }
    close(): void {}
  }
  return {
    BunkerSigner,
    parseBunkerInput: async (url: string) => ({
      pubkey: 'b'.repeat(64),
      relays: ['wss://relay.nsec.app'],
      secret: new URL(url.replace('bunker://', 'https://')).searchParams.get('secret'),
    }),
    createNostrConnectURI: () => 'nostrconnect://test',
  };
});

installBridgeHarness(fake);
installVaultPage();

function seedPlaintext(skHex: string, pkHex: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ privKeyHex: skHex, pubKeyHex: pkHex, loginMethod: 'nsec', relayUrl: 'wss://relay.example.com' }));
  localStorage.setItem(SDK_NSEC_KEY, `nsec-from-sdk-${skHex}`);
  localStorage.setItem(SDK_NIP46_KEY, JSON.stringify({ kind: 'bunker', clientNsec: `client-${skHex}` }));
}

async function loadPage() {
  const { getBridge } = await import('@/services/nostr-bridge/client');
  return getBridge();
}

async function loginThenReloadWith(mutate: () => Promise<void> | void) {
  const { skHex, pkHex } = makeKeypair();
  const bridge = await loadPage();
  await bridge.loginWithNsec(skHex, pkHex);
  await mutate();
  return { ...(await reload()), skHex };
}

describe('session vault: migrating a plaintext record', () => {
  it('seals it on the next load, keeps the person logged in, and erases the plaintext and the SDK copies', async () => {
    const { skHex, pkHex } = makeKeypair();
    seedPlaintext(skHex, pkHex);

    const bridge = await loadPage();

    expect(bridge.isLoggedIn.get()).toBe(true);
    expect(bridge.myPubkey.get()).toBe(pkHex);
    expect(storedRecord()).toMatchObject({ v: 2, pubKeyHex: pkHex, loginMethod: 'nsec' });
    expect(storedRecord()).not.toHaveProperty('privKeyHex');
    expect(localStorage.getItem(SDK_NSEC_KEY)).toBeNull();
    expect(localStorage.getItem(SDK_NIP46_KEY)).toBeNull();
    expectNowhereOnDisk(skHex);
    const signed = await bridge.signEventTemplate({ kind: 1, content: 'x', tags: [], created_at: 1 });
    expect(signed.pubkey).toBe(pkHex);

    const after = await reload();
    expect(after.bridge.myPubkey.get()).toBe(pkHex);
  });

  it('without IndexedDB erases the plaintext and keeps the session for this visit only', async () => {
    removeIndexedDb();
    const { skHex, pkHex } = makeKeypair();
    seedPlaintext(skHex, pkHex);

    const bridge = await loadPage();

    expect(bridge.isLoggedIn.get()).toBe(true);
    expect(storedRecord()).toBeNull();
    expect(bridge.sessionNotice.get()).toBe('not-remembered');
    expect(localStorage.getItem(SDK_NSEC_KEY)).toBeNull();
    expectNowhereOnDisk(skHex);
  });
});

describe('session vault: a sealed record that will not open', () => {
  it('logs out with key-missing when the vault key is gone', async () => {
    const { bridge } = await loginThenReloadWith(() => deleteVaultKey());

    expect(bridge.isLoggedIn.get()).toBe(false);
    expect(bridge.sessionNotice.get()).toBe('key-missing');
    expect(storedRecord()).toBeNull();
  });

  it('logs out with unlock-failed when the box was tampered with', async () => {
    const { bridge } = await loginThenReloadWith(() => {
      const record = storedRecord()!;
      const sealed = record.sealed as { ct: string };
      sealed.ct = (sealed.ct[0] === 'A' ? 'B' : 'A') + sealed.ct.slice(1);
      localStorage.setItem(SESSION_KEY, JSON.stringify(record));
    });

    expect(bridge.isLoggedIn.get()).toBe(false);
    expect(bridge.sessionNotice.get()).toBe('unlock-failed');
    expect(storedRecord()).toBeNull();
  });

  it('logs out with vault-unavailable when IndexedDB is gone on the next visit', async () => {
    const { bridge } = await loginThenReloadWith(() => removeIndexedDb());

    expect(bridge.isLoggedIn.get()).toBe(false);
    expect(bridge.sessionNotice.get()).toBe('vault-unavailable');
    expect(storedRecord()).toBeNull();
  });

  it('erases a record whose secrets were stripped out instead of opening it', async () => {
    const { bridge } = await loginThenReloadWith(() => {
      const record = storedRecord()!;
      delete record.sealed;
      localStorage.setItem(SESSION_KEY, JSON.stringify(record));
    });

    expect(bridge.isLoggedIn.get()).toBe(false);
    expect(storedRecord()).toBeNull();
  });
});

describe('session vault: NIP-46', () => {
  const bunkerUrl = `bunker://${'b'.repeat(64)}?relay=wss%3A%2F%2Frelay.nsec.app&secret=connect-secret-1234`;

  it('seals the client secret and the bunker URL; a reload hands both back to the signer', async () => {
    const bridge = await loadPage();
    const clientSecretHex = makeKeypair().skHex;
    const pairedSigner = { getPublicKey: async () => 'c'.repeat(64), close: () => undefined };
    await bridge.loginWithBunker(bunkerUrl, { clientSecretHex, signer: pairedSigner as never });
    const record = storedRecord()!;

    expect(bridge.isLoggedIn.get()).toBe(true);
    expect(record).toMatchObject({ v: 2, loginMethod: 'bunker', pubKeyHex: 'c'.repeat(64) });
    expect(record).not.toHaveProperty('bunkerUrl');
    expect(record).not.toHaveProperty('bunkerLocalSecretHex');
    expectNowhereOnDisk(clientSecretHex, 'connect-secret-1234', 'bunker://');

    bunker.fromBunkerSecrets.length = 0;
    const after = await reload();
    await vi.waitFor(() => expect(bunker.fromBunkerSecrets).toContain('connect-secret-1234'));
    expect(after.bridge.myLoginMethod.get()).toBe('bunker');
  });
});
