'use client';

import { useState } from 'react';
import { nostrActions, useSignerReady } from '@/services/nostr-bridge';
import { OBELISK_SIGNING_KINDS } from '@/utils/nostr-signing-kinds';
import { setPreference } from '@/services/preferences';
import { usePreferences } from '@/hooks/usePreferences';
import { useTranslations } from 'next-intl';

type Result = 'pending' | 'accepted' | 'rejected';

export default function DeveloperSignatureTest({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const signerReady = useSignerReady();
  const prefs = usePreferences();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<number, Result>>({});

  const run = async () => {
    setRunning(true);
    setResults(Object.fromEntries(OBELISK_SIGNING_KINDS.map((kind) => [kind, 'pending'])));
    await Promise.all(OBELISK_SIGNING_KINDS.map(async (kind) => {
      try {
        await nostrActions.signEventTemplate({
          kind,
          content: kind === 22242 ? '' : t('settings.developer.mockContent', { kind: String(kind) }),
          tags: kind === 22242
            ? [['relay', 'wss://public.obelisk.ar'], ['challenge', 'obelisk-developer-signature-test'], ['client', 'Obelisk']]
            : [['client', 'Obelisk'], ['alt', t('settings.developer.mockAlt')]],
        });
        setResults((current) => ({ ...current, [kind]: 'accepted' }));
      } catch {
        setResults((current) => ({ ...current, [kind]: 'rejected' }));
      }
    }));
    setRunning(false);
  };

  const accepted = Object.values(results).filter((result) => result === 'accepted').length;
  const rejected = Object.values(results).filter((result) => result === 'rejected').length;
  const requested = Object.keys(results).length;

  return (
    <details className={mobile ? 'settings-section' : 'rounded-lg border border-lc-border bg-lc-dark/30 p-3'} data-testid="developer-signature-test">
      <summary className={mobile ? 'settings-section-title cursor-pointer' : 'cursor-pointer text-xs font-semibold uppercase tracking-wider text-lc-muted'}>
        {t('settings.developer.title')}
      </summary>
      {mobile && (
        <button
          type="button"
          className="settings-row action"
          onClick={() => setPreference('developerRelayDebug', !prefs.developerRelayDebug)}
        >
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block' }}>{t('settings.developer.relayLogs')}</span>
            <span className="settings-row-meta muted" style={{ display: 'block', maxWidth: '100%', marginTop: 3 }}>{t('settings.developer.console')}</span>
          </span>
          <span
            className={`toggle ${prefs.developerRelayDebug ? 'on' : ''}`}
            role="switch"
            aria-checked={prefs.developerRelayDebug}
            data-testid="mobile-developer-relay-debug-toggle"
          />
        </button>
      )}
      <div className={mobile ? 'settings-row !block' : 'mt-3 space-y-3'}>
        <div className={mobile ? 'settings-row-meta muted' : 'text-xs text-lc-muted'}>
          {t('settings.developer.signatureHelp')}
        </div>
        <button
          type="button"
          disabled={!signerReady || running}
          onClick={() => void run()}
          className={mobile ? 'settings-btn-secondary mt-3 w-full' : 'rounded-md border border-lc-green/50 bg-lc-green/10 px-3 py-2 text-sm font-semibold text-lc-green hover:bg-lc-green/20 disabled:opacity-50'}
          data-testid="request-mock-signatures"
        >
          {running
            ? t('settings.developer.waiting', { done: accepted + rejected, total: OBELISK_SIGNING_KINDS.length })
            : t('settings.developer.requestAll', { count: OBELISK_SIGNING_KINDS.length })}
        </button>
        {requested > 0 && !running && (
          <div className={mobile ? 'settings-row-meta muted mt-2' : 'text-xs text-lc-muted'} role="status">
            {t('settings.developer.results', { accepted, rejected })}
          </div>
        )}
      </div>
    </details>
  );
}
