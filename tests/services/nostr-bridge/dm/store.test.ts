/**
 * The encrypted DM store end to end, on the fake relay pool with a fresh
 * fake IndexedDB per test and a real-crypto NIP-07 extension whose every
 * call is counted (`../support/dm-store-page.ts`):
 *
 * - after DMs are received, read and sent, no message text is anywhere on
 *   disk, and the store holds one sealed box per message;
 * - a reload shows nothing until the DMs are opened, then everything, with
 *   exactly one signer decrypt (the key) and no wrap sent to the signer again;
 * - the bell has no text before the unlock and the text after;
 * - an nsec session opens them without the extension;
 * - a tampered box is dropped and its message is fetched and decrypted again;
 * - with no IndexedDB, DMs work for the visit and nothing is written.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { installBridgeHarness, makeKeypair } from '@tests/services/nostr-bridge/support/bridge-harness';
import { installVaultPage, reload, removeIndexedDb } from '@tests/services/nostr-bridge/support/vault-page';
import {
  dmStoreEntries,
  everythingOnDisk,
  expectNoPlaintextOnDisk,
  giftWrapFrom,
  installExtension,
  keysFrom,
  kind4From,
  threadTexts,
  watchDms,
  type TestKeys,
} from '@tests/services/nostr-bridge/support/dm-store-page';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

installBridgeHarness(fake);
installVaultPage();

const FIRST = 'the first secret: meet at the old mill at nine';
const SECOND = 'the second secret: bring the blue folder along';
const OLD_STYLE = 'a nip-04 secret: the code word is marmalade';

/** Put an event on the fake relay, and hand it to every open matching REQ. */
function deliver(ev: NostrEvent): void {
  fake.state.published.push(ev);
  for (const sub of fake.state.subscriptions) if (fake.matchesInternal(sub.filter, ev)) sub.sink(ev);
}

async function dmBoxes(): Promise<Array<[string, unknown]>> {
  return (await dmStoreEntries()).filter(([k]) => k.startsWith('dm:'));
}

async function waitForBoxes(n: number): Promise<void> {
  await vi.waitFor(async () => {
    const count = (await dmBoxes()).length;
    if (count < n) throw new Error(`${count} of ${n} records stored`);
  }, { timeout: 5000, interval: 10 });
}

async function notifications() {
  return (await import('@/store/notifications')).useNotificationsStore.getState();
}

/** Bob logs in with his extension; Alice has already sent him two NIP-17 messages and a NIP-04 one. */
async function firstVisit() {
  const alice = keysFrom(makeKeypair());
  const bob = keysFrom(makeKeypair());
  fake.state.published.push(await giftWrapFrom(alice, bob.pkHex, FIRST));
  fake.state.published.push(await giftWrapFrom(alice, bob.pkHex, SECOND));
  fake.state.published.push(kind4From(alice, bob.pkHex, OLD_STYLE));
  const ext = installExtension(bob);
  const { getBridge } = await import('@/services/nostr-bridge/facade/client');
  const bridge = await getBridge();
  await bridge.loginWithNip07(bob.pkHex);
  const read = await watchDms(bridge);
  return { alice, bob, ext, bridge, read };
}

async function unlockAndRead(bridge: Awaited<ReturnType<typeof firstVisit>>['bridge'], read: () => ReturnType<Awaited<ReturnType<typeof watchDms>>>, alice: TestKeys) {
  await bridge.unlockDirectMessages();
  return threadTexts(read, alice.pkHex, 3);
}

describe('encrypted DM store: nothing in the clear on disk', () => {
  it.each(['nip04', 'nip17'] as const)('retries a failed %s decrypt without reloading or refetching', async (protocol) => {
    const { alice, ext, bridge, read } = await firstVisit();
    if (protocol === 'nip04') ext.nip04.decrypt.mockRejectedValueOnce(new Error('signer unavailable'));
    else ext.nip44.decrypt.mockRejectedValueOnce(new Error('signer unavailable'));
    await bridge.unlockDirectMessages();
    await vi.waitFor(() => expect(bridge.dmLock.get().failedDecryptions).toBe(1));
    await vi.waitFor(() => expect(bridge.dmLock.get().pendingDecryptions ?? 0).toBe(0));
    expect(read()[alice.pkHex]).toHaveLength(2);
    await bridge.unlockDirectMessages();
    expect(await threadTexts(read, alice.pkHex, 3)).toEqual(expect.arrayContaining([FIRST, SECOND, OLD_STYLE]));
    expect(bridge.dmLock.get().failedDecryptions ?? 0).toBe(0);
  });

  it('keeps received, read and sent DMs only as sealed boxes', async () => {
    const { alice, bridge, read } = await firstVisit();
    expect(await unlockAndRead(bridge, read, alice)).toEqual(expect.arrayContaining([FIRST, SECOND, OLD_STYLE]));
    // Read them, and answer: our own message is kept too.
    const REPLY = 'my reply: I will be there with the folder';
    await bridge.sendDirectMessage(alice.pkHex, REPLY);
    await threadTexts(read, alice.pkHex, 4);
    await waitForBoxes(4);

    // The bell had the text in memory while it was open...
    expect((await notifications()).dmNotifications.some((d) => d.preview?.includes('secret'))).toBe(true);
    // ...and nothing on disk has any of it.
    await expectNoPlaintextOnDisk(FIRST, SECOND, OLD_STYLE, REPLY);
    for (const [, box] of await dmBoxes()) expect(Object.keys(box as object).sort()).toEqual(['ct', 'iv', 'v']);
    const keyRecord = (await dmStoreEntries()).find(([k]) => k.startsWith('key:'))?.[1] as Record<string, unknown>;
    expect(keyRecord).toMatchObject({ kind: 30078, tags: [['d', 'obelisk:dm-key:v1']] });
    expect(keyRecord).not.toHaveProperty('sig');
    // The wrapped key was never published.
    expect(fake.state.published.some((e) => e.kind === 30078)).toBe(false);
  });
});

describe('encrypted DM store: a reload', () => {
  it('shows nothing until the DMs are opened, then everything with exactly one signer decrypt', async () => {
    const first = await firstVisit();
    await unlockAndRead(first.bridge, first.read, first.alice);
    await waitForBoxes(3);
    // The first visit made the key: one encrypt, and the wraps cost decrypts.
    expect(first.ext.nip44.encrypt).toHaveBeenCalledTimes(1);

    const { bridge } = await reload();
    const ext = installExtension(first.bob);
    const read = await watchDms(bridge);
    // The relay replays every wrap and the kind 4; none is opened.
    await vi.waitFor(() => { if (bridge.dmLock.get().status !== 'locked') throw new Error('not locked'); });
    await new Promise((r) => setTimeout(r, 50));
    expect(read()).toEqual({});
    expect(ext.nip44.decrypt).not.toHaveBeenCalled();
    expect(ext.nip04.decrypt).not.toHaveBeenCalled();

    expect(await unlockAndRead(bridge, read, first.alice)).toEqual(expect.arrayContaining([FIRST, SECOND, OLD_STYLE]));
    await new Promise((r) => setTimeout(r, 50));
    // One decrypt: the key. No wrap and no kind 4 went to the signer again.
    expect(ext.nip44.decrypt).toHaveBeenCalledTimes(1);
    expect(ext.nip04.decrypt).not.toHaveBeenCalled();
    expect(ext.nip44.encrypt).not.toHaveBeenCalled();
    expect(bridge.dmLock.get().status).toBe('unlocked');

    // A wrap that arrives again from another relay is still not re-opened.
    deliver(fake.state.published.find((e) => e.kind === 1059) as NostrEvent);
    await new Promise((r) => setTimeout(r, 20));
    expect(ext.nip44.decrypt).toHaveBeenCalledTimes(1);
  });

  it('a new message after the reload is opened once, and kept', async () => {
    const first = await firstVisit();
    await unlockAndRead(first.bridge, first.read, first.alice);
    await waitForBoxes(3);
    const { bridge } = await reload();
    const ext = installExtension(first.bob);
    const read = await watchDms(bridge);
    await bridge.unlockDirectMessages();
    const NEW = 'a new one: the meeting moved to ten';
    deliver(await giftWrapFrom(first.alice, first.bob.pkHex, NEW));
    expect(await threadTexts(read, first.alice.pkHex, 4)).toContain(NEW);
    // The key, then the wrap and its seal.
    expect(ext.nip44.decrypt).toHaveBeenCalledTimes(3);
    await waitForBoxes(4);
    await expectNoPlaintextOnDisk(NEW);
  });
});

describe('encrypted DM store: the bell', () => {
  it('has no text before the unlock and the text after', async () => {
    const first = await firstVisit();
    await unlockAndRead(first.bridge, first.read, first.alice);
    await waitForBoxes(3);
    expect((await notifications()).dmNotifications.length).toBe(3);

    const { bridge } = await reload();
    installExtension(first.bob);
    const read = await watchDms(bridge);
    await new Promise((r) => setTimeout(r, 30));
    // The cards came back from disk: sender and time, no text.
    const locked = (await notifications()).dmNotifications;
    expect(locked).toHaveLength(3);
    expect(locked.every((d) => d.senderPubkey === first.alice.pkHex && d.preview === undefined)).toBe(true);

    await unlockAndRead(bridge, read, first.alice);
    const open = (await notifications()).dmNotifications.map((d) => d.preview);
    expect(open).toEqual(expect.arrayContaining([FIRST, SECOND, OLD_STYLE]));
  });

  it('counts a gift wrap that arrives while locked without opening it, and alerts a kind 4 with its sender only', async () => {
    const first = await firstVisit();
    await unlockAndRead(first.bridge, first.read, first.alice);
    await waitForBoxes(3);
    const { bridge } = await reload();
    // The reload has already replayed the two stored wraps, most likely before
    // the store read its index. Every count published from here on is kept.
    const counts: number[] = [];
    const stop = bridge.dmLock.subscribe((s) => { counts.push(s.unopened.length); });
    const ext = installExtension(first.bob);
    await watchDms(bridge);
    const later = Math.floor(Date.now() / 1000) + 60;
    const wrap = await giftWrapFrom(first.alice, first.bob.pkHex, 'unopened text');
    deliver({ ...wrap });
    deliver(kind4From(first.alice, first.bob.pkHex, 'locked nip-04 text', later));
    const cardFor = async () => (await notifications()).dmNotifications.find((d) => d.createdAt === later * 1000);
    await vi.waitFor(async () => {
      expect(bridge.dmLock.get().unopened).toEqual([wrap.created_at * 1000]);
      expect(await cardFor()).toBeDefined();
    }, { timeout: 5000, interval: 10 });
    stop();

    // The new wrap is counted, and the stored ones never were, not even for
    // the moment before the index was read.
    expect(Math.max(...counts)).toBeLessThanOrEqual(1);
    const card = await cardFor();
    expect(card).toMatchObject({ senderPubkey: first.alice.pkHex });
    expect(card?.preview).toBeUndefined();
    expect(ext.nip44.decrypt).not.toHaveBeenCalled();
    expect(ext.nip04.decrypt).not.toHaveBeenCalled();
    expect((await everythingOnDisk()).some((s) => s.includes('unopened text') || s.includes('locked nip-04'))).toBe(false);
  });
});

describe('encrypted DM store: login methods and storage', () => {
  it('an nsec session opens its DMs with no extension call, before and after a reload', async () => {
    const alice = keysFrom(makeKeypair());
    const bob = keysFrom(makeKeypair());
    fake.state.published.push(await giftWrapFrom(alice, bob.pkHex, FIRST));
    // An extension is present but must never be asked: the nsec signer is in the page.
    const ext = installExtension(bob);
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const bridge = await getBridge();
    await bridge.loginWithNsec(bob.skHex, bob.pkHex);
    let read = await watchDms(bridge);
    await bridge.unlockDirectMessages();
    expect(await threadTexts(read, alice.pkHex, 1)).toEqual([FIRST]);
    await waitForBoxes(1);

    const again = await reload();
    read = await watchDms(again.bridge);
    expect(again.bridge.dmLock.get().status).toBe('locked');
    await again.bridge.unlockDirectMessages();
    expect(await threadTexts(read, alice.pkHex, 1)).toEqual([FIRST]);
    for (const fn of [ext.signEvent, ext.nip44.decrypt, ext.nip44.encrypt, ext.nip04.decrypt]) expect(fn).not.toHaveBeenCalled();
    await expectNoPlaintextOnDisk(FIRST);
  });

  it('drops a tampered box and opens that message from the relay again', async () => {
    const first = await firstVisit();
    await unlockAndRead(first.bridge, first.read, first.alice);
    await waitForBoxes(3);
    // Flip one character of one box's ciphertext, as a disk edit would.
    const [slot, box] = (await dmBoxes())[0] as [string, { v: 1; iv: string; ct: string }];
    const tampered = { ...box, ct: (box.ct[0] === 'A' ? 'B' : 'A') + box.ct.slice(1) };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('obelisk-dms');
      open.onsuccess = () => {
        const tx = open.result.transaction('records', 'readwrite');
        tx.objectStore('records').put(tampered, slot);
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });

    const { bridge } = await reload();
    const ext = installExtension(first.bob);
    const read = await watchDms(bridge);
    expect(await unlockAndRead(bridge, read, first.alice)).toEqual(expect.arrayContaining([FIRST, SECOND, OLD_STYLE]));
    await new Promise((r) => setTimeout(r, 50));
    // The key, plus that one message opened from the relay again.
    const signerCalls = ext.nip44.decrypt.mock.calls.length + ext.nip04.decrypt.mock.calls.length;
    expect(signerCalls).toBeGreaterThan(1);
    expect(signerCalls).toBeLessThanOrEqual(3);
    // ...and stored again, sealed afresh.
    await vi.waitFor(async () => {
      const now = (await dmBoxes()).find(([k]) => k === slot)?.[1] as { ct: string } | undefined;
      if (!now || now.ct === tampered.ct) throw new Error('not replaced');
    }, { timeout: 5000, interval: 10 });
  });

  it('with no IndexedDB, DMs open for the visit with no key and nothing is written', async () => {
    removeIndexedDb();
    const first = await (async () => {
      const alice = keysFrom(makeKeypair());
      const bob = keysFrom(makeKeypair());
      fake.state.published.push(await giftWrapFrom(alice, bob.pkHex, FIRST));
      const ext = installExtension(bob);
      const { getBridge } = await import('@/services/nostr-bridge/facade/client');
      const bridge = await getBridge();
      await bridge.loginWithNip07(bob.pkHex);
      return { alice, ext, bridge, read: await watchDms(bridge) };
    })();
    expect(first.bridge.dmLock.get().status).toBe('locked');
    await first.bridge.unlockDirectMessages();
    expect(await threadTexts(first.read, first.alice.pkHex, 1)).toEqual([FIRST]);
    // No key to make or open: only the wrap and its seal went to the signer.
    expect(first.ext.nip44.encrypt).not.toHaveBeenCalled();
    expect(first.ext.nip44.decrypt).toHaveBeenCalledTimes(2);
    expect(globalThis.indexedDB).toBeUndefined();
    await expectNoPlaintextOnDisk(FIRST);
  });
});


describe('group read-state migration respects DM opt-in', () => {
  it('does not ask the signer to open real DMs received by its legacy subscription', async () => {
    const alice = keysFrom(makeKeypair());
    const bob = keysFrom(makeKeypair());
    const ext = installExtension(bob);
    const { setPreference } = await import('@/services/preferences/preferences');
    setPreference('directMessagesEnabled', false);
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const bridge = await getBridge();
    await bridge.loginWithNip07(bob.pkHex);
    const { startGroupsRelaySync } = await import('@/services/read-state/relay-sync');
    const stop = startGroupsRelaySync('wss://public.obelisk.ar', ['group']);
    try {
      deliver(await giftWrapFrom(alice, bob.pkHex, 'private DM, not a group cursor'));
      await bridge.unlockDirectMessages();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(ext.nip44.decrypt).not.toHaveBeenCalled();
      expect(ext.nip04.decrypt).not.toHaveBeenCalled();
      expect(bridge.dmLock.get().status).toBe('locked');
    } finally { stop(); }
  });
});
