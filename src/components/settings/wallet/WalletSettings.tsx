'use client';

/**
 * Settings > Wallet: connect a Nostr Wallet Connect (NIP-47) wallet, see it,
 * disconnect it, and which wallet pays right now. The state and actions are
 * `useWalletSettings`; the rule for which wallet pays is
 * `src/services/wallet/wallet.ts`. See docs/features/bitcoin-zaps-nwc.md.
 */
import Section from '@/components/ui/layout/Section';
import { useTranslations } from 'next-intl';
import Text from '@/components/ui/layout/Text';
import { useWalletSettings } from '@/hooks/settings/wallet/useWalletSettings';
import type { MessageKey } from '@/i18n/keys';
import NwcConnectForm from './NwcConnectForm';
import NwcConnectedCard from './NwcConnectedCard';
import Skeleton from '@/components/ui/animations/Skeleton';

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
        <Skeleton variant="pulse" className="h-16 rounded-lg bg-lc-border/40" data-testid="nwc-loading" />
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
    <Section variant="mobile" headingAs="h3" title={t('settings.wallet.title')} data-testid="wallet-settings">
      <div className="settings-row !block space-y-3">{body}</div>
    </Section>
  ) : (
    <div className="space-y-3" data-testid="wallet-settings">
      <Text as="div" variant="label" size="xs" weight="semibold" tone="muted">{t('settings.wallet.title')}</Text>
      {body}
    </div>
  );
}
