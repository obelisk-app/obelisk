'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { useDeveloperSignatureTest } from '@/hooks/settings/account/useDeveloperSignatureTest';

export default function DeveloperSignatureTest({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const vm = useDeveloperSignatureTest();

  return (
    <details className={mobile ? 'settings-section' : 'rounded-lg border border-lc-border bg-lc-dark/30 p-3'} data-testid="developer-signature-test">
      <summary className={mobile ? 'settings-section-title cursor-pointer' : 'cursor-pointer text-xs font-semibold uppercase tracking-wider text-lc-muted'}>
        {t('settings.developer.title')}
      </summary>
      {mobile && (
        <Button
          variant="mobileRow"
          type="button"
          onClick={vm.toggleRelayDebug}
        >
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block' }}>{t('settings.developer.relayLogs')}</span>
            <span className="settings-row-meta muted" style={{ display: 'block', maxWidth: '100%', marginTop: 3 }}>{t('settings.developer.console')}</span>
          </span>
          <span
            className={`toggle ${vm.relayDebug ? 'on' : ''}`}
            role="switch"
            aria-checked={vm.relayDebug}
            data-testid="mobile-developer-relay-debug-toggle"
          />
        </Button>
      )}
      <div className={mobile ? 'settings-row !block' : 'mt-3 space-y-3'}>
        <div className={mobile ? 'settings-row-meta muted' : 'text-xs text-lc-muted'}>
          {t('settings.developer.signatureHelp')}
        </div>
        <Button
          variant="bare"
          type="button"
          disabled={!vm.signerReady || vm.running}
          onClick={vm.run}
          className={mobile ? 'settings-btn-secondary mt-3 w-full' : 'rounded-md border border-lc-green/50 bg-lc-green/10 px-3 py-2 text-sm font-semibold text-lc-green hover:bg-lc-green/20 disabled:opacity-50'}
          data-testid="request-mock-signatures"
        >
          {vm.running
            ? t('settings.developer.waiting', { done: vm.accepted + vm.rejected, total: vm.total })
            : t('settings.developer.requestAll', { count: vm.total })}
        </Button>
        {vm.requested > 0 && !vm.running && (
          <div className={mobile ? 'settings-row-meta muted mt-2' : 'text-xs text-lc-muted'} role="status">
            {t('settings.developer.results', { accepted: vm.accepted, rejected: vm.rejected })}
          </div>
        )}
      </div>
    </details>
  );
}
