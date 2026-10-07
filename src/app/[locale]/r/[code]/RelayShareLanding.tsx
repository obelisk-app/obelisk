'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { useRelayShareLanding } from '@/hooks/relay/useRelayShareLanding';

const RELAY_BRANDING: Record<string, { logo: string; alt: string }> = {
  'wss://lacrypta-relay.obelisk.ar': { logo: '/lacrypta-logo.png', alt: 'La Crypta' }, // i18n-exempt: the relay's brand name
};

/** Adds the shared relay and opens it in the app; the page around it (`page.tsx`) carries the link's card. */
export default function RelayShareLanding({ code }: { code: string }) {
  const t = useTranslations();
  const { relayUrl, error, goToApp } = useRelayShareLanding(code);

  return (
    <main className="flex min-h-screen items-center justify-center bg-lc-black p-6">
      <div className="lc-card w-full max-w-md rounded-2xl border border-lc-border bg-lc-dark p-6 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-bold text-lc-white">{t('common.relayLanding.failed')}</h1>
            <p className="mt-2 text-sm text-lc-muted">{error}</p>
            <Button onClick={goToApp} className="mt-4">
              {t('common.relayLanding.goToApp')}
            </Button>
          </>
        ) : (
          <>
            {relayUrl && RELAY_BRANDING[relayUrl] && (
              <Image
                src={RELAY_BRANDING[relayUrl].logo}
                alt={RELAY_BRANDING[relayUrl].alt}
                width={96}
                height={96}
                className="mx-auto mb-4 h-24 w-24 rounded-xl object-contain"
                priority
              />
            )}
            <h1 className="text-lg font-bold text-lc-white">{t('common.relayLanding.connecting')}</h1>
            {relayUrl && (
              <p className="mt-2 break-all font-mono text-xs text-lc-muted">{relayUrl}</p>
            )}
            <div className="lc-spinner mx-auto mt-4" />
          </>
        )}
      </div>
    </main>
  );
}
