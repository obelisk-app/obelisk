/**
 * Connecting, keeping and forgetting a Nostr Wallet Connect wallet, end to
 * end: the real page hub on fake relays, a fake wallet service on the
 * wallet relay (`@tests/support/fake-nwc-wallet`), and the real session
 * vault over a fake IndexedDB. Nothing reaches the network.
 */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { FakeRelayFactory, getRelayHub, resetRelayHubForTests } from '@/lib/relay-hub';
import {
  connectNwcWallet,
  disconnectNwcWallet,
  ensureNwcWalletLoaded,
  hasNwcWallet,
  nwcPayerFor,
} from '@/services/wallet/nwc-wallet';
import { NWC_RECORD_PREFIX, NWC_VAULT_KEY_ID, nwcRecordKey } from '@/services/wallet/nwc-storage';
import { resetAllClientState } from '@/services/common/reset';
import { useNwcWalletStore } from '@/store/wallet/nwc-wallet';
import { VAULT_DB, VAULT_STORE, isSealedBox } from '@/lib/crypto/session-vault';
import { getRecord, openStore } from '@/lib/crypto/vault-idb';
import { FakeNwcWallet } from '@tests/support/fake-nwc-wallet';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

let idb: IDBFactory;
let factory: FakeRelayFactory;
let wallet: FakeNwcWallet;

function storedStrings(): string[] {
  const out: string[] = [];
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)!;
      out.push(key, storage.getItem(key) ?? '');
    }
  }
  return out.map((s) => s.toLowerCase());
}

/** The URI, its secret (hex and nsec spelling) and the client key appear in no storage key or value. */
function expectSecretNowhereOnDisk(w: FakeNwcWallet): void {
  const needles = [w.uri, w.clientSecretHex, nip19.nsecEncode(w.clientSecret)].map((s) => s.toLowerCase());
  const stored = storedStrings();
  for (const needle of needles) expect(stored.filter((s) => s.includes(needle)), needle.slice(0, 12)).toEqual([]);
}

async function walletKey(): Promise<unknown> {
  const db = await openStore(idb, VAULT_DB, VAULT_STORE);
  try {
    return await getRecord(db, VAULT_STORE, NWC_VAULT_KEY_ID);
  } finally {
    db.close();
  }
}

/** A page reload, as far as the wallet module is concerned: memory gone, storage kept. */
async function reloadFor(account: string): Promise<void> {
  await ensureNwcWalletLoaded(null);
  await ensureNwcWalletLoaded(account);
}

beforeEach(async () => {
  idb = new IDBFactory();
  vi.stubGlobal('indexedDB', idb);
  window.localStorage.clear();
  resetRelayHubForTests();
  factory = new FakeRelayFactory();
  wallet = new FakeNwcWallet({ lud16: 'ana@wallet.example' });
  getRelayHub({ relayFactory: wallet.attach(factory) });
  await ensureNwcWalletLoaded(null);
});

afterEach(async () => {
  await ensureNwcWalletLoaded(null);
  resetRelayHubForTests();
  vi.unstubAllGlobals();
});

describe('connecting a wallet', () => {
  it('checks the wallet, names it, reads its budget and seals the link', async () => {
    await ensureNwcWalletLoaded(ALICE);
    const view = await connectNwcWallet(ALICE, wallet.uri);

    expect(view).toMatchObject({
      walletPubkey: wallet.walletPubkey,
      relays: [wallet.relayUrl],
      alias: 'Test Wallet',
      lud16: 'ana@wallet.example',
      remembered: true,
      budget: { usedMsats: 21_000, totalMsats: 100_000, renewalPeriod: 'monthly' },
    });
    expect(useNwcWalletStore.getState()).toMatchObject({ account: ALICE, status: 'connected' });
    expect(hasNwcWallet(ALICE)).toBe(true);

    const record = JSON.parse(window.localStorage.getItem(nwcRecordKey(ALICE))!);
    expect(isSealedBox(record.sealed)).toBe(true);
    expectSecretNowhereOnDisk(wallet);
  });

  it('comes back after a reload from the sealed record alone', async () => {
    await connectNwcWallet(ALICE, wallet.uri);
    await reloadFor(ALICE);

    expect(useNwcWalletStore.getState().wallet).toMatchObject({ walletPubkey: wallet.walletPubkey, alias: 'Test Wallet', remembered: true });
    await nwcPayerFor(ALICE)!.pay('lnbc1after-reload');
    expect(wallet.calls('pay_invoice').map((r) => r.params.invoice)).toEqual(['lnbc1after-reload']);
  });

  it('refuses a connection that may not pay, and keeps nothing', async () => {
    const readOnly = new FakeNwcWallet({ methods: 'get_info get_balance' });
    resetRelayHubForTests();
    getRelayHub({ relayFactory: readOnly.attach(new FakeRelayFactory()) });
    await expect(connectNwcWallet(ALICE, readOnly.uri)).rejects.toMatchObject({ code: 'nwc-cannot-pay' });
    expect(hasNwcWallet(ALICE)).toBe(false);
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith(NWC_RECORD_PREFIX))).toEqual([]);
  });

  it('refuses a malformed link before opening any socket', async () => {
    await expect(connectNwcWallet(ALICE, 'nostr+walletconnect://nope')).rejects.toMatchObject({ code: 'nwc-invalid-uri' });
    expect(factory.calls).toEqual([]);
  });

  it('without IndexedDB, connects for this visit only and writes nothing', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const view = await connectNwcWallet(ALICE, wallet.uri);

    expect(view.remembered).toBe(false);
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith(NWC_RECORD_PREFIX))).toEqual([]);
    expectSecretNowhereOnDisk(wallet);
    await nwcPayerFor(ALICE)!.pay('lnbc1memory');
    expect(wallet.calls('pay_invoice')).toHaveLength(1);

    await reloadFor(ALICE);
    expect(hasNwcWallet(ALICE)).toBe(false);
  });
});

describe('forgetting a wallet', () => {
  it('disconnect erases the record, the wallet key and the hub identity', async () => {
    await connectNwcWallet(ALICE, wallet.uri);
    expect(await walletKey()).toBeTruthy();
    const hub = getRelayHub();
    expect(hub.getIdentity(`nwc:${wallet.clientPubkey}`)).toBeDefined();

    await disconnectNwcWallet();

    expect(window.localStorage.getItem(nwcRecordKey(ALICE))).toBeNull();
    expect(await walletKey()).toBeUndefined();
    expect(hub.getIdentity(`nwc:${wallet.clientPubkey}`)).toBeUndefined();
    expect(useNwcWalletStore.getState()).toMatchObject({ status: 'none', wallet: null });
    expect(nwcPayerFor(ALICE)).toBeNull();
  });

  it('logout erases it too, record and memory', async () => {
    await connectNwcWallet(ALICE, wallet.uri);
    resetAllClientState();
    await Promise.resolve();

    expect(window.localStorage.getItem(nwcRecordKey(ALICE))).toBeNull();
    expect(nwcPayerFor(ALICE)).toBeNull();
    await reloadFor(ALICE);
    expect(hasNwcWallet(ALICE)).toBe(false);
  });
});

describe('one account never pays from another account\'s wallet', () => {
  it('a switch to another account finds no wallet, pays nothing from the first, and erases its record', async () => {
    await connectNwcWallet(ALICE, wallet.uri);
    await ensureNwcWalletLoaded(BOB);

    expect(hasNwcWallet(BOB)).toBe(false);
    expect(nwcPayerFor(BOB)).toBeNull();
    // Even asked by the first account's key, nothing answers while the second is loaded.
    expect(nwcPayerFor(ALICE)).toBeNull();
    expect(useNwcWalletStore.getState()).toMatchObject({ account: BOB, status: 'none', wallet: null });
    expect(window.localStorage.getItem(nwcRecordKey(ALICE))).toBeNull();
    expect(wallet.requests.filter((r) => r.method === 'pay_invoice')).toEqual([]);
  });

  it('a sealed record copied under another account does not open', async () => {
    await connectNwcWallet(ALICE, wallet.uri);
    const box = window.localStorage.getItem(nwcRecordKey(ALICE))!;
    await ensureNwcWalletLoaded(null);
    window.localStorage.setItem(nwcRecordKey(BOB), box);

    await ensureNwcWalletLoaded(BOB);

    expect(hasNwcWallet(BOB)).toBe(false);
    expect(window.localStorage.getItem(nwcRecordKey(BOB))).toBeNull();
  });
});
