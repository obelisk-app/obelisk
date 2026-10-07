/**
 * The encrypted DM store's lifecycle: logout deletes the account's key and
 * messages; Settings > Data on this device removes the store (and the DMs
 * come back from the relays, decrypted again); two accounts on one browser
 * never see or open each other's store; and the seen-wrap ledger works
 * after a page reload, which it did not before the store existed.
 */
import { describe, expect, it, vi } from 'vitest';
import { installBridgeHarness, makeKeypair } from '@tests/services/nostr-bridge/support/bridge-harness';
import { installVaultPage, reload } from '@tests/services/nostr-bridge/support/vault-page';
import {
  dmStoreEntries,
  dmStoreExists,
  giftWrapFrom,
  installExtension,
  keysFrom,
  threadTexts,
  watchDms,
} from '@tests/services/nostr-bridge/support/dm-store-page';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

installBridgeHarness(fake);
installVaultPage();

const TEXT = 'lifecycle secret: the spare key is under the mat';

async function storedFor(pubkey: string) {
  return (await dmStoreEntries()).filter(([k]) => k.endsWith(pubkey) || k.startsWith(`dm:${pubkey}:`));
}

async function waitStored(pubkey: string, records: number) {
  await vi.waitFor(async () => {
    const n = (await storedFor(pubkey)).filter(([k]) => k.startsWith('dm:')).length;
    if (n < records) throw new Error(`${n} of ${records}`);
  }, { timeout: 5000, interval: 10 });
}

/** `me` logs in with nsec, opens DMs and reads the message `from` sent. */
async function readAsNsec(me: ReturnType<typeof keysFrom>, from: ReturnType<typeof keysFrom>, text = TEXT) {
  const { getBridge } = await import('@/services/nostr-bridge/facade/client');
  const bridge = await getBridge();
  await bridge.loginWithNsec(me.skHex, me.pkHex);
  const read = await watchDms(bridge);
  await bridge.unlockDirectMessages();
  expect(await threadTexts(read, from.pkHex, 1)).toContain(text);
  await waitStored(me.pkHex, 1);
  return { bridge, read };
}

describe('encrypted DM store: logout and removal', () => {
  it('logout deletes the account\'s DM key and every stored message', async () => {
    const alice = keysFrom(makeKeypair());
    const bob = keysFrom(makeKeypair());
    fake.state.published.push(await giftWrapFrom(alice, bob.pkHex, TEXT));
    const { bridge } = await readAsNsec(bob, alice);
    expect((await storedFor(bob.pkHex)).some(([k]) => k === `key:${bob.pkHex}`)).toBe(true);

    await bridge.logout();

    expect(await storedFor(bob.pkHex)).toEqual([]);
    expect(bridge.dmLock.get()).toEqual({ status: 'locked', unopened: [] });
    expect(bridge.dmsByPeer.get()).toEqual({});
  });

  it('Remove in Data on this device deletes the store; the DMs come back from the relays, decrypted again', async () => {
    const alice = keysFrom(makeKeypair());
    const bob = keysFrom(makeKeypair());
    fake.state.published.push(await giftWrapFrom(alice, bob.pkHex, TEXT));
    installExtension(bob);
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const bridge = await getBridge();
    await bridge.loginWithNip07(bob.pkHex);
    const read = await watchDms(bridge);
    await bridge.unlockDirectMessages();
    await threadTexts(read, alice.pkHex, 1);
    await waitStored(bob.pkHex, 1);

    const { removeLocalDataCategory } = await import('@/services/local-data');
    const reloadPage = vi.fn();
    await removeLocalDataCategory('dmMessages', {
      logout: vi.fn(),
      forgetDirectMessages: () => bridge.forgetDirectMessages(),
      reload: reloadPage,
      relocate: vi.fn(),
      indexedDB: globalThis.indexedDB,
    });
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(await dmStoreExists()).toBe(false);
    // Still logged in: the login lives elsewhere.
    expect(window.localStorage.getItem('obelisk-dex/session')).not.toBeNull();

    const again = await reload();
    const ext = installExtension(bob);
    const after = await watchDms(again.bridge);
    await again.bridge.unlockDirectMessages();
    expect(await threadTexts(after, alice.pkHex, 1)).toEqual([TEXT]);
    // A new key (one encrypt, no unwrap) and the wrap opened through the signer again.
    expect(ext.nip44.encrypt).toHaveBeenCalledTimes(1);
    expect(ext.nip44.decrypt).toHaveBeenCalledTimes(2);
    await waitStored(bob.pkHex, 1);
  });
});

describe('encrypted DM store: two accounts on one browser', () => {
  it('keeps each account\'s store apart, and one account cannot open the other\'s boxes', async () => {
    const alice = keysFrom(makeKeypair());
    const bob = keysFrom(makeKeypair());
    const carol = keysFrom(makeKeypair());
    fake.state.published.push(await giftWrapFrom(alice, bob.pkHex, TEXT));
    fake.state.published.push(await giftWrapFrom(alice, carol.pkHex, 'only for carol'));
    const { bridge } = await readAsNsec(bob, alice);

    // Carol logs in on the same browser, without Bob logging out.
    await bridge.loginWithNsec(carol.skHex, carol.pkHex);
    expect(bridge.dmLock.get().status).toBe('locked');
    expect(bridge.dmsByPeer.get()).toEqual({});
    // Bob's box copied into Carol's slots: bound to Bob's account, it must not open.
    const bobBox = (await storedFor(bob.pkHex)).find(([k]) => k.startsWith('dm:'))!;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('obelisk-dms');
      open.onsuccess = () => {
        const tx = open.result.transaction('records', 'readwrite');
        tx.objectStore('records').put(bobBox[1], `dm:${carol.pkHex}:${bobBox[0].split(':')[2]}`);
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    const read = await watchDms(bridge);
    await bridge.unlockDirectMessages();
    expect(await threadTexts(read, alice.pkHex, 1)).toEqual(['only for carol']);
    await waitStored(carol.pkHex, 1);
    expect(Object.values(bridge.dmsByPeer.get()).flat().some((m) => m.content === TEXT)).toBe(false);
    // Two keys, one per account.
    const keys = (await dmStoreEntries()).filter(([k]) => k.startsWith('key:')).map(([k]) => k).sort();
    expect(keys).toEqual([`key:${bob.pkHex}`, `key:${carol.pkHex}`].sort());
    // The copied box was dropped, not shown.
    expect((await dmStoreEntries()).map(([k]) => k)).not.toContain(`dm:${carol.pkHex}:${bobBox[0].split(':')[2]}`);

    // Back to Bob: his messages are still there for him.
    await bridge.loginWithNsec(bob.skHex, bob.pkHex);
    const bobRead = await watchDms(bridge);
    await bridge.unlockDirectMessages();
    expect(await threadTexts(bobRead, alice.pkHex, 1)).toEqual([TEXT]);
  });
});

describe('the seen-wrap ledger across a reload', () => {
  it('remembers after a page reload what it recorded before it', async () => {
    const bob = keysFrom(makeKeypair());
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const bridge = await getBridge();
    await bridge.loginWithNsec(bob.skHex, bob.pkHex);
    const ledger = await import('@/services/nostr-bridge/cache/wrap-ledger');
    ledger.markWrapSeen('dm:inert', 'a'.repeat(64));
    ledger.__INTERNAL.flush();

    await reload();
    const after = await import('@/services/nostr-bridge/cache/wrap-ledger');
    expect(after.hasSeenWrap('dm:inert', 'a'.repeat(64))).toBe(true);
    after.markWrapSeen('dm:inert', 'b'.repeat(64));
    after.__INTERNAL.flush();
    expect(window.localStorage.getItem(`obelisk-wrap-ledger:${bob.pkHex}`)).toContain('b'.repeat(64));
  });
});
