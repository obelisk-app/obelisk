import { create } from 'zustand';
import type { NwcBudget } from '@/lib/nwc';

/**
 * What the UI may know about the connected Nostr Wallet Connect wallet:
 * where it is and what it is called, never the connection secret (that
 * stays inside `src/services/wallet/nwc-wallet.ts`).
 *
 * Memory only. The sealed record on disk is `nwc-storage.ts`'s; this store
 * is filled from it when an account loads, and emptied on logout.
 */
export interface NwcWalletView {
  readonly walletPubkey: string;
  readonly relays: readonly string[];
  readonly alias: string | null;
  readonly lud16: string | null;
  /** The wallet's spending limit for this app, when it reports one (`get_budget`). */
  readonly budget: NwcBudget | null;
  /** False when this browser cannot keep the connection: it lasts for this visit only. */
  readonly remembered: boolean;
}

export type NwcStatus = 'none' | 'loading' | 'connected';

interface NwcWalletState {
  /** The account the state below belongs to. */
  account: string | null;
  status: NwcStatus;
  wallet: NwcWalletView | null;
}

export const useNwcWalletStore = create<NwcWalletState>()(() => ({
  account: null,
  status: 'none',
  wallet: null,
}));
