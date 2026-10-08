'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import { useFormat } from '@/i18n/useFormat';
import type { NwcWalletView } from '@/store/wallet/nwc-wallet';
import { msatsToSats, nwcWalletLabel, relayHostLabel, renewalPeriod } from '@/utils/wallet/wallet-label';

interface Props {
  wallet: NwcWalletView;
  busy: boolean;
  onDisconnect: () => void;
}

/** The connected wallet: where it is, its budget when it shares one, whether it is kept, and Disconnect. */
export default function NwcConnectedCard({ wallet, busy, onDisconnect }: Props) {
  const t = useTranslations();
  const { formatNumber } = useFormat();
  const { budget } = wallet;
  const period = budget ? renewalPeriod(budget.renewalPeriod) : null;
  const amounts = budget
    ? { used: formatNumber(msatsToSats(budget.usedMsats)), total: formatNumber(msatsToSats(budget.totalMsats)) }
    : null;

  return (
    <Card surface="subtle" radius="lg" className="space-y-2" data-testid="nwc-connected">
      <Text as="p" size="xs" weight="semibold" tone="accent">{t('settings.wallet.connected')}</Text>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-lc-muted">{t('settings.wallet.walletLabel')}</dt>
        <dd className="truncate text-lc-white" data-testid="nwc-wallet-name">{nwcWalletLabel(wallet)}</dd>
        <dt className="text-lc-muted">{t('settings.wallet.relayLabel')}</dt>
        <dd className="truncate text-lc-white" data-testid="nwc-wallet-relay">{wallet.relays.map(relayHostLabel).join(', ')}</dd>
        {wallet.lud16 && (
          <>
            <dt className="text-lc-muted">{t('settings.wallet.addressLabel')}</dt>
            <dd className="truncate text-lc-white">{wallet.lud16}</dd>
          </>
        )}
      </dl>
      <Text as="p" size="xs" tone="muted" data-testid="nwc-budget">
        {amounts && period
          ? t('settings.wallet.budgetRenews', { used: amounts.used, total: amounts.total, period: t(`settings.wallet.renewal.${period}`) })
          : amounts
            ? t('settings.wallet.budget', { used: amounts.used, total: amounts.total })
            : t('settings.wallet.noBudget')}
      </Text>
      <Text as="p" size="xs" tone={wallet.remembered ? 'muted' : 'danger'} data-testid="nwc-storage-note">
        {t(wallet.remembered ? 'settings.wallet.remembered' : 'settings.wallet.notRemembered')}
      </Text>
      <Button variant="outlinePill" tone="danger" size="xs" onClick={onDisconnect} disabled={busy} data-testid="nwc-disconnect">
        {t('settings.wallet.disconnect')}
      </Button>
    </Card>
  );
}
