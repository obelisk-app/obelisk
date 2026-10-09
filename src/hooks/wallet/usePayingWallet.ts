'use client';

import { useEffect } from 'react';
import { isWebLNAvailable } from '@nostr-wot/wallet';
import { useMyPubkey, useMyLoginMethod, useSessionSelector } from '@/hooks/session/useSession';
import { ensureNwcWalletLoaded } from '@/services/wallet/nwc-wallet';
import type { WalletKind } from '@/types/wallet/wallet';
import { selectWalletKind } from '@/utils/wallet/provider';
import { useNwcWalletStore, type NwcWalletView } from '@/store/wallet/nwc-wallet';

export interface PayingWallet {
  /**
   * Which wallet a payment would use now: the connected NWC wallet first,
   * then WebLN for a NIP-07 session. Null when there is none, and while the account's sealed
   * wallet is still being opened (the answer is not known yet).
   */
  readonly kind: WalletKind | null;
  /** The account's connected NWC wallet, when there is one. */
  readonly nwc: NwcWalletView | null;
  /** Whether a WebLN extension is present (it pays only when no NWC wallet is connected). */
  readonly webln: boolean;
  /** True while the account's sealed wallet is still being opened. */
  readonly loading: boolean;
}

/**
 * Which wallet would pay for the logged-in account, the same rule
 * `src/services/wallet/wallet.ts` applies at payment time. Loads the
 * account's sealed wallet on first use, so the answer (and the payment
 * checks that read it) is right by the time anyone presses Pay.
 */
export function usePayingWallet(): PayingWallet {
  const account = useMyPubkey();
  const loginMethod = useMyLoginMethod();
  const active = useSessionSelector((s) => s.isLoggedIn && !!s.pubkey && !!s.loginMethod && !s.extensionIdentityPending);
  const nwc = useNwcWalletStore((s) => (s.account === account && s.status === 'connected' ? s.wallet : null));
  const loading = useNwcWalletStore((s) => s.account !== account || s.status === 'loading');

  useEffect(() => {
    void ensureNwcWalletLoaded(account);
  }, [account]);

  const webln = active && loginMethod === 'nip07' && isWebLNAvailable();
  const pending = !!account && loading;
  return { kind: selectWalletKind({ active: active && !pending, loginMethod, nwc: !!nwc, webln }), nwc, webln, loading: pending };
}
