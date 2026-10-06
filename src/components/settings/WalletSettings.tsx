'use client';

/**
 * Settings > Wallet: connect a Nostr Wallet Connect (NIP-47) wallet, see it,
 * disconnect it, and which wallet pays right now. The state and actions are
 * `useWalletSettings`; the rule for which wallet pays is
 * `src/services/wallet/wallet.ts`. See docs/bitcoin-zaps-nwc.md.
 */
import { useTranslations } from 'next-intl';
import Text from '@/components/ui/Text';
import { useWalletSettings } from '@/hooks/settings/useWalletSettings';
import type { MessageKey } from '@/i18n/keys';
import NwcConnectForm from './wallet/NwcConnectForm';
import NwcConnectedCard from './wallet/NwcConnectedCard';

const PAYER_KEY = {
  nwc: 'settings.wallet.current.nwc',
  webln: 'settings.wallet.current.webln',
  none: 'settings.wallet.current.none',
} as const satisfies Record<string, MessageKey>;

export default function WalletSettings({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const w = useWalletSettings();
  const { paying } = w;

  const body = (
    <>
      <Text as="p" size="xs" tone="muted">{t('settings.wallet.intro')}</Text>
      {paying.loading ? (
        <div className="h-16 animate-pulse rounded-lg bg-lc-border/40" data-testid="nwc-loading" />
      ) : paying.nwc ? (
        <NwcConnectedCard wallet={paying.nwc} busy={w.busy} onDisconnect={() => void w.disconnect()} />
      ) : (
        <NwcConnectForm
          draft={w.draft}
          onDraft={w.changeDraft}
          preview={w.preview}
          busy={w.busy}
          error={w.error}
          onConnect={() => void w.connect()}
        />
      )}
      {w.disconnected && !paying.nwc && (
        <Text as="p" size="xs" tone="accent" role="status">{t('settings.wallet.disconnected')}</Text>
      )}
      {!paying.loading && (
        <Text as="p" size="xs" tone="default" data-testid="wallet-current-payer">
          {t('settings.wallet.current.label', { wallet: t(PAYER_KEY[paying.kind ?? 'none']) })}
        </Text>
      )}
      <Text as="p" size="xs" tone="muted">{t('settings.wallet.precedence')}</Text>
    </>
  );

  return mobile ? (
    <div className="settings-section" data-testid="wallet-settings">
      <div className="settings-section-title">{t('settings.wallet.title')}</div>
      <div className="settings-row !block space-y-3">{body}</div>
    </div>
  ) : (
    <div className="space-y-3" data-testid="wallet-settings">
      <Text as="div" variant="label" size="xs" weight="semibold" tone="muted">{t('settings.wallet.title')}</Text>
      {body}
    </div>
  );
}
