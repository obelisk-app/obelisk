/**
 * The account's Nostr Wallet Connect wallet: connect (check it, seal it,
 * keep it), load it back for the account that owns it, pay through it, and
 * forget it on disconnect or logout.
 *
 * The connection (and its client secret) lives only in this module's
 * memory and, sealed, in `./nwc-storage`. The UI sees `useNwcWalletStore`:
 * relay, wallet, alias and budget, never the secret.
 *
 * Per account: the wallet belongs to the account that connected it. Every
 * entry point takes the account, and a wallet is used only when its owner is
 * the account asking (`nwcPayerFor`), so a change of account can never pay
 * from the previous account's wallet, even before the next load finishes.
 */
import { NwcClient, canPay, NwcError, parseNwcUri, type NwcConnection } from '@nostr-wot/wallet/nwc';
import { pageRelayHub } from '@/services/nostr-bridge';
import { registerClientResetHook } from '@/services/common/reset';
import { useNwcWalletStore, type NwcWalletView } from '@/store/wallet/nwc-wallet';
import { createHubNwcTransport, type HubNwcTransport } from './nwc-transport';
import { deleteNwcWallet, destroyNwcVaultKey, forgetNwcRecords, hasNwcRecord, openNwcWallet, sealNwcWallet } from './nwc-storage';
import type { WalletConnection } from './wallet-types';

interface ActiveWallet {
  readonly account: string;
  readonly connection: NwcConnection;
  transport: HubNwcTransport | null;
  client: NwcClient | null;
}

let active: ActiveWallet | null = null;
let loading: { account: string; promise: Promise<void> } | null = null;
/** Bumped whenever the account or its wallet changes, so a slow connect or load that lost the race does nothing. */
let generation = 0;

function clientOf(wallet: ActiveWallet): NwcClient {
  if (!wallet.client) {
    wallet.transport = createHubNwcTransport(pageRelayHub(), wallet.connection);
    wallet.client = new NwcClient(wallet.connection, wallet.transport);
  }
  return wallet.client;
}

function dropMemory(): void {
  active?.transport?.destroy();
  active = null;
  loading = null;
  generation += 1;
}

function viewOf(connection: NwcConnection, alias: string | null, remembered: boolean): NwcWalletView {
  return { walletPubkey: connection.walletPubkey, relays: connection.relays, alias, lud16: connection.lud16, budget: null, remembered };
}

/** What a pasted URI points at, without contacting anything. Throws `NwcError('nwc-invalid-uri')`. */
export function previewNwcUri(uri: string): Pick<NwcWalletView, 'walletPubkey' | 'relays' | 'lud16'> {
  const { walletPubkey, relays, lud16 } = parseNwcUri(uri);
  return { walletPubkey, relays, lud16 };
}

/**
 * Point the wallet state at `account`: its own sealed wallet if it has one,
 * nothing otherwise. Records of any other account are erased (only one
 * account is logged in per browser). Idempotent per account.
 */
export function ensureNwcWalletLoaded(account: string | null): Promise<void> {
  const state = useNwcWalletStore.getState();
  if (account === null) {
    if (state.account !== null || active) {
      dropMemory();
      useNwcWalletStore.setState({ account: null, status: 'none', wallet: null });
    }
    return Promise.resolve();
  }
  if (loading?.account === account) return loading.promise;
  if (state.account === account) return Promise.resolve();
  dropMemory();
  forgetNwcRecords(account);
  if (!hasNwcRecord(account)) {
    // Nothing sealed: answered now, with no vault round trip and no "loading" flash.
    useNwcWalletStore.setState({ account, status: 'none', wallet: null });
    return Promise.resolve();
  }
  const mine = generation;
  useNwcWalletStore.setState({ account, status: 'loading', wallet: null });
  const promise = openNwcWallet(account).then((stored) => {
    if (generation !== mine) return;
    loading = null;
    let connection: NwcConnection | null = null;
    try {
      connection = stored ? parseNwcUri(stored.uri) : null;
    } catch { /* a sealed URI that no longer parses: treat as none */ }
    if (!stored || !connection) {
      useNwcWalletStore.setState({ status: 'none', wallet: null });
      return;
    }
    active = { account, connection, transport: null, client: null };
    useNwcWalletStore.setState({ status: 'connected', wallet: viewOf(connection, stored.alias, true) });
  });
  loading = { account, promise };
  return promise;
}

/**
 * Connect `account` to the wallet `uri` names: check it answers on its relay
 * and allows `pay_invoice`, read its name and budget when it shares them,
 * seal it, and make it the account's wallet (replacing any other). Rejects
 * with an `NwcError` and changes nothing when the check fails.
 */
export async function connectNwcWallet(account: string, uri: string): Promise<NwcWalletView> {
  const connection = parseNwcUri(uri);
  const candidate: ActiveWallet = { account, connection, transport: null, client: null };
  const client = clientOf(candidate);
  const mine = generation;
  const stale = () => generation !== mine || (useNwcWalletStore.getState().account ?? account) !== account;
  try {
    const info = await client.fetchInfo();
    if (!canPay(info)) throw new NwcError('nwc-cannot-pay', 'not-paid');
    const alias = await client.walletAlias().catch(() => null);
    const budget = await client.budget().catch(() => null);
    if (stale()) throw new NwcError('wallet-failed', 'not-paid');
    const remembered = await sealNwcWallet(account, { uri: uri.trim(), alias });
    if (stale()) {
      if (remembered) await deleteNwcWallet(account);
      throw new NwcError('wallet-failed', 'not-paid');
    }
    dropMemory();
    active = candidate;
    const view = { ...viewOf(connection, alias, remembered), budget };
    useNwcWalletStore.setState({ account, status: 'connected', wallet: view });
    return view;
  } catch (err) {
    if (active !== candidate) candidate.transport?.destroy();
    throw err;
  }
}

/** Forget the account's wallet: memory, the sealed record and the wallet key. */
export async function disconnectNwcWallet(): Promise<void> {
  const account = active?.account ?? useNwcWalletStore.getState().account;
  dropMemory();
  useNwcWalletStore.setState({ status: 'none', wallet: null });
  if (account) await deleteNwcWallet(account);
}

/** Ask the wallet for its budget again (the settings panel, after a reload). Best effort. */
export async function refreshNwcBudget(account: string): Promise<void> {
  const wallet = active;
  if (!wallet || wallet.account !== account) return;
  const budget = await clientOf(wallet).budget().catch(() => null);
  const state = useNwcWalletStore.getState();
  if (active !== wallet || !state.wallet || !budget) return;
  useNwcWalletStore.setState({ wallet: { ...state.wallet, budget } });
}

/**
 * Whether `account` has a wallet connected: loaded in memory, or sealed on
 * disk and not yet opened by this page (`connectWallet` opens it before
 * paying). Synchronous, for the checks that run before a payment starts.
 */
export function hasNwcWallet(account: string | null): boolean {
  if (!account) return false;
  if (active?.account === account) return true;
  const state = useNwcWalletStore.getState();
  if (state.account === account && state.status !== 'loading') return false;
  return hasNwcRecord(account);
}

/** A payer for `account`'s own wallet, or null. Never another account's. */
export function nwcPayerFor(account: string | null): WalletConnection | null {
  const wallet = active;
  if (!account || !wallet || wallet.account !== account) return null;
  return {
    kind: 'nwc',
    pay: async (invoice) => {
      const { preimage } = await clientOf(wallet).payInvoice(invoice);
      return { preimage };
    },
  };
}

// Logout (or another account logging in over this one): drop the wallet from
// memory and destroy its key. `src/services/common/reset.ts` erases the records
// itself, so they go even on a page that never loaded this module.
registerClientResetHook(() => {
  dropMemory();
  useNwcWalletStore.setState({ account: null, status: 'none', wallet: null });
  void destroyNwcVaultKey();
});
