'use client';

import { useTranslations } from 'next-intl';
import { usePayingWallet } from '@/hooks/wallet/usePayingWallet';
import { nwcWalletLabel } from '@/utils/wallet/wallet-label';

/**
 * One line under a zap or an invoice confirm: which wallet will pay. The
 * same rule the payment follows (`src/services/wallet/wallet.ts`): the
 * connected Nostr Wallet Connect wallet, else the WebLN extension. Nothing
 * when there is neither; the caller's own "no wallet" message covers that.
 */
export default function PayingWalletNote({ className = '' }: { className?: string }) {
  const t = useTranslations();
  const { kind, nwc } = usePayingWallet();
  if (!kind) return null;
  return (
    <span className={`block text-[11px] text-lc-muted ${className}`} data-testid="paying-wallet" data-wallet={kind}>
      {nwc ? t('chat.wallet.paysWithNwc', { wallet: nwcWalletLabel(nwc) }) : t('chat.wallet.paysWithWebln')}
    </span>
  );
}
