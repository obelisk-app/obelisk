/** Which wallet pays: a connected Nostr Wallet Connect wallet, or a WebLN browser extension. */
export type WalletKind = 'nwc' | 'webln';

export interface WalletConnection {
  readonly kind: WalletKind;
  /** Pays a BOLT11 invoice. Resolves once the wallet reports it paid; rejects when it did not. */
  pay(invoice: string): Promise<{ preimage: string | null }>;
}
