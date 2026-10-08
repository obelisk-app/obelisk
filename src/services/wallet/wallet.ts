import { isWebLNAvailable } from '@nostr-wot/wallet';
import { ensureNwcWalletLoaded, hasNwcWallet, nwcPayerFor } from './nwc-wallet';
import type { WalletConnection, WalletKind } from '@/types/wallet/wallet';

export type { WalletConnection, WalletKind } from '@/types/wallet/wallet';

/**
 * The one way the app reaches a Lightning wallet. Zaps (`./send-zap`) and
 * invoice payments (`./pay-invoice`) both go through here, so there is no
 * second wallet path. Two backends, one rule:
 *
 * 1. a Nostr Wallet Connect (NIP-47) wallet the account connected in
 *    Settings (`./nwc-wallet`), when there is one;
 * 2. otherwise the WebLN provider a browser extension (Alby and similar)
 *    puts on `window.webln`;
 * 3. otherwise no wallet.
 *
 * The connected wallet wins because connecting one is an explicit choice
 * made in this app, while an extension is simply present. Settings, the zap
 * modal and the invoice confirm all say which one will pay.
 *
 * Both backends take only the invoice, so an invoice that sets no amount
 * cannot be paid through this path.
 */

/** Which wallet would pay for `account` right now, without asking it anything. */
export function walletKindFor(account: string | null): WalletKind | null {
  if (hasNwcWallet(account)) return 'nwc';
  return isWebLNAvailable() ? 'webln' : null;
}

/** Whether a wallet is there to ask for `account`, without asking it anything. */
export function isWalletAvailable(account: string | null): boolean {
  return walletKindFor(account) !== null;
}

/**
 * The wallet that pays for `account`: its connected NWC wallet (loaded from
 * its sealed record if this page has not yet), else WebLN after asking the
 * extension for permission (`enable`), else `null`. A refused `enable`
 * rejects with the extension's own error.
 */
export async function connectWallet(account: string | null): Promise<WalletConnection | null> {
  if (account) {
    await ensureNwcWalletLoaded(account);
    const nwc = nwcPayerFor(account);
    if (nwc) return nwc;
  }
  const webln = typeof window === 'undefined' ? undefined : window.webln;
  if (!webln) return null;
  await webln.enable();
  return {
    kind: 'webln',
    pay: async (invoice) => {
      const res = await webln.sendPayment(invoice);
      return { preimage: res?.preimage || null };
    },
  };
}
