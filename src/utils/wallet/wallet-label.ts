import { shortNpubLabel } from '@/utils/identity/short-npub';

/** The part of a connected wallet a label is made from. */
export interface WalletLabelSource {
  readonly walletPubkey: string;
  readonly alias: string | null;
  readonly lud16: string | null;
}

/** How a connected wallet is named on screen: its own alias, else its Lightning address, else its key as a short npub. */
export function nwcWalletLabel(wallet: WalletLabelSource): string {
  return wallet.alias || wallet.lud16 || shortNpubLabel(wallet.walletPubkey);
}

/** A relay URL as a reader recognises it: the host, without the scheme. */
export function relayHostLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

export const RENEWAL_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RenewalPeriod = (typeof RENEWAL_PERIODS)[number];

/** A NIP-47 `renewal_period` this app can name, or null (`never`, unknown words). */
export function renewalPeriod(value: string | null): RenewalPeriod | null {
  return (RENEWAL_PERIODS as readonly string[]).includes(value ?? '') ? (value as RenewalPeriod) : null;
}

/** Millisats as whole sats, rounded down, as wallets show a budget. */
export function msatsToSats(msats: number): number {
  return Math.floor(msats / 1000);
}
