'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Text from '@/components/ui/Text';
import type { NwcPreview } from '@/hooks/settings/useWalletSettings';
import { nwcWalletLabel, relayHostLabel } from '@/utils/wallet/wallet-label';

interface Props {
  draft: string;
  onDraft: (value: string) => void;
  preview: { ok: true; value: NwcPreview } | { ok: false; error: string } | null;
  busy: boolean;
  error: string | null;
  onConnect: () => void;
}

/** Paste a `nostr+walletconnect://` link, see where it points, connect. */
export default function NwcConnectForm({ draft, onDraft, preview, busy, error, onConnect }: Props) {
  const t = useTranslations();
  const fieldId = useId();
  const target = preview?.ok ? preview.value : null;

  return (
    <div className="space-y-3" data-testid="nwc-connect-form">
      <p className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-200" data-testid="nwc-warning">
        {t('settings.wallet.warning')}
      </p>
      <Input
        id={fieldId}
        label={t('settings.wallet.uriLabel')}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        placeholder={t('settings.wallet.uriPlaceholder')}
        secret={{ kind: 'nsec', showLabel: t('settings.wallet.show'), hideLabel: t('settings.wallet.hide') }}
        invalid={preview?.ok === false}
        fontSize="xs"
        data-testid="nwc-uri-input"
      />
      {preview && !preview.ok && (
        <Text as="p" size="xs" tone="danger" role="alert" data-testid="nwc-uri-invalid">{preview.error}</Text>
      )}
      {target && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" data-testid="nwc-preview">
          <dt className="text-lc-muted">{t('settings.wallet.walletLabel')}</dt>
          <dd className="truncate text-lc-white">{nwcWalletLabel({ ...target, alias: null })}</dd>
          <dt className="text-lc-muted">{t('settings.wallet.relayLabel')}</dt>
          <dd className="truncate text-lc-white">{target.relays.map(relayHostLabel).join(', ')}</dd>
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="pill"
          size="xs"
          onClick={onConnect}
          disabled={!target || busy}
          loading={busy}
          data-testid="nwc-connect"
        >
          {t(busy ? 'settings.wallet.connecting' : 'settings.wallet.connect')}
        </Button>
      </div>
      {error && (
        <Text as="p" size="xs" tone="danger" role="alert" data-testid="nwc-connect-error">{error}</Text>
      )}
    </div>
  );
}
