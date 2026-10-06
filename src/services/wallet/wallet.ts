import { isWebLNAvailable } from '@nostr-wot/wallet';

/**
 * The one way the app reaches a Lightning wallet: the WebLN provider a
 * browser extension (Alby and similar) puts on `window.webln`. Zaps and
 * invoice payments both go through here, so there is no second wallet path.
 *
 * Why only WebLN: the app has no screen to connect a Nostr Wallet Connect
 * (NIP-47) URI and nowhere to keep one, so the SDK's `NwcClient` has no
 * caller. An extension like Alby can itself be linked to an NWC wallet, which
 * is the route the "no wallet" message points people to. If the app ever
 * stores an NWC connection, it plugs in behind `connectWallet` and every
 * caller gets it for free.
 *
 * WebLN's `sendPayment` takes only the invoice, so an invoice that sets no
 * amount cannot be paid through this path.
 */

export interface WalletConnection {
  /** Pays a BOLT11 invoice. Resolves once the wallet reports it paid; rejects when it did not. */
  pay(invoice: string): Promise<{ preimage: string | null }>;
}

/** Whether a wallet is there to ask, without asking it anything. */
export function isWalletAvailable(): boolean {
  return isWebLNAvailable();
}

/**
 * Asks the wallet for permission (`enable`) and hands back a connection, or
 * `null` when no wallet is installed. A refused `enable` rejects with the
 * wallet's own error.
 */
export async function connectWallet(): Promise<WalletConnection | null> {
  const webln = typeof window === 'undefined' ? undefined : window.webln;
  if (!webln) return null;
  await webln.enable();
  return {
    pay: async (invoice) => {
      const res = await webln.sendPayment(invoice);
      return { preimage: res?.preimage || null };
    },
  };
}
