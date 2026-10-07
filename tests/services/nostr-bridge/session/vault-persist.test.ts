/**
 * The session record on disk after an nsec login, a reload, a relay switch,
 * an account switch and a logout: the private key is never in localStorage,
 * and the sealed copy opens again on the next load.
 *
 * Runs on the pool-level fake (`../support/bridge-fake-pool.ts`) with a
 * fresh fake IndexedDB per test (`../support/vault-page.ts`).
 */
import { describe, expect, it, vi } from 'vitest';
import { verifyEvent } from 'nostr-tools';
import { openSessionVault, type SealedBox } from '@/lib/crypto/session-vault';
import { installBridgeHarness, makeKeypair } from '@tests/services/nostr-bridge/support/bridge-harness';
import {
  SDK_NIP46_KEY,
  SDK_NSEC_KEY,
  expectNowhereOnDisk,
  installVaultPage,
  reload,
  removeIndexedDb,
  storedRecord,
  vaultKey,
} from '@tests/services/nostr-bridge/support/vault-page';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

installBridgeHarness(fake);
installVaultPage();

async function loginNsec(keys = makeKeypair()) {
  const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
  const bridge = await getBridge();
  await bridge.loginWithNsec(keys.skHex, keys.pkHex);
  return { bridge, impl: getBridgeImpl()!, ...keys };
}

describe('session vault: nsec login', () => {
  it('leaves no private key anywhere in storage, only a sealed v2 record', async () => {
    const { skHex, pkHex } = await loginNsec();

    expectNowhereOnDisk(skHex);
    const record = storedRecord()!;
    expect(record).toMatchObject({ v: 2, pubKeyHex: pkHex, loginMethod: 'nsec', relayUrl: expect.any(String) });
    expect(record).not.toHaveProperty('privKeyHex');
    expect(Object.keys(record.sealed as SealedBox).sort()).toEqual(['ct', 'iv', 'v']);
    expect(await vaultKey()).toMatchObject({ extractable: false, type: 'secret' });
  });

  it('restores after a reload and signs with the key that came back', async () => {
    const { pkHex } = await loginNsec();

    const { bridge } = await reload();

    expect(bridge.isLoggedIn.get()).toBe(true);
    expect(bridge.myPubkey.get()).toBe(pkHex);
    const signed = await bridge.signEventTemplate({ kind: 1, content: 'hello', tags: [], created_at: 1 });
    expect(signed.pubkey).toBe(pkHex);
    expect(verifyEvent(signed)).toBe(true);
  });

  it('a relay switch rewrites the record with the same box and seals nothing new', async () => {
    const { bridge, skHex } = await loginNsec();
    const before = storedRecord()!.sealed;
    const encrypt = vi.spyOn(crypto.subtle, 'encrypt');

    await bridge.switchRelay('wss://relay.example.com');

    expect(encrypt).not.toHaveBeenCalled();
    expect(storedRecord()!.sealed).toEqual(before);
    expect(storedRecord()!.relayUrl).toBe('wss://relay.example.com');
    expectNowhereOnDisk(skHex);
  });

  it('logout deletes the record, the vault key and any SDK leftovers', async () => {
    const { bridge, skHex } = await loginNsec();
    localStorage.setItem(SDK_NSEC_KEY, 'nsec1leftover');
    localStorage.setItem(SDK_NIP46_KEY, '{"clientNsec":"nsec1leftover"}');

    await bridge.logout();

    expect(storedRecord()).toBeNull();
    expect(await vaultKey()).toBeUndefined();
    expect(localStorage.getItem(SDK_NSEC_KEY)).toBeNull();
    expect(localStorage.getItem(SDK_NIP46_KEY)).toBeNull();
    expect(bridge.sessionNotice.get()).toBeNull();
    expectNowhereOnDisk(skHex);
  });

  it('an account switch rotates the key: the old box no longer opens, the new one does', async () => {
    const a = makeKeypair();
    const b = makeKeypair();
    const { bridge } = await loginNsec(a);
    const boxA = storedRecord()!.sealed as SealedBox;

    await bridge.loginWithNsec(b.skHex, b.pkHex);

    const record = storedRecord()!;
    expect(record.pubKeyHex).toBe(b.pkHex);
    const vault = await openSessionVault();
    await expect(vault.open(boxA, a.pkHex)).rejects.toMatchObject({ code: 'unlock-failed' });
    const opened = JSON.parse(new TextDecoder().decode(await vault.open(record.sealed as SealedBox, b.pkHex)));
    expect(opened).toEqual({ privKeyHex: b.skHex });
    expectNowhereOnDisk(a.skHex, b.skHex);

    const after = await reload();
    expect(after.bridge.myPubkey.get()).toBe(b.pkHex);
  });

  it('without IndexedDB the login works for this visit only, writes no record and says so', async () => {
    removeIndexedDb();
    const { bridge, skHex, pkHex } = await loginNsec();

    expect(bridge.isLoggedIn.get()).toBe(true);
    expect(bridge.myPubkey.get()).toBe(pkHex);
    expect(storedRecord()).toBeNull();
    expect(bridge.sessionNotice.get()).toBe('not-remembered');
    expectNowhereOnDisk(skHex);

    const after = await reload();
    expect(after.bridge.isLoggedIn.get()).toBe(false);
  });

  it('switching to an account the browser cannot remember drops the previous account\'s record', async () => {
    const a = makeKeypair();
    const { bridge } = await loginNsec(a);
    expect(storedRecord()!.pubKeyHex).toBe(a.pkHex);
    removeIndexedDb();
    const b = makeKeypair();

    await bridge.loginWithNsec(b.skHex, b.pkHex);

    expect(storedRecord()).toBeNull();
    expect(bridge.sessionNotice.get()).toBe('not-remembered');
  });

  it('a new login clears the previous notice', async () => {
    removeIndexedDb();
    const { bridge } = await loginNsec();
    expect(bridge.sessionNotice.get()).toBe('not-remembered');
    const { IDBFactory } = await import('fake-indexeddb');
    vi.stubGlobal('indexedDB', new IDBFactory());
    const b = makeKeypair();

    await bridge.loginWithNsec(b.skHex, b.pkHex);

    expect(bridge.sessionNotice.get()).toBeNull();
    expect(storedRecord()!.pubKeyHex).toBe(b.pkHex);
  });
});
