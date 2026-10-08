'use client';

import Card from '@/components/ui/layout/Card';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { useRelayShareLanding } from '@/hooks/relay/deep-link/useRelayShareLanding';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

const RELAY_BRANDING: Record<string, { logo: string; alt: string }> = {
  'wss://lacrypta-relay.obelisk.ar': { logo: '/lacrypta-logo.png', alt: 'La Crypta' }, // i18n-exempt: the relay's brand name
};

/** Adds the shared relay and opens it in the app; the page around it (`page.tsx`) carries the link's card. */
export default function RelayShareLanding({ code }: { code: string }) {
  const t = useTranslations();
  const { relayUrl, error, goToApp } = useRelayShareLanding(code);

  return (
    <main className="flex min-h-screen items-center justify-center bg-lc-black p-6">
      <Card variant="interactive" padding="2xl" className="w-full max-w-md rounded-2xl border border-lc-border bg-lc-dark text-center">
        {error ? (
          <>
            <Heading as="h1" variant="card">{t('common.relayLanding.failed')}</Heading>
            <Text as="p" variant="muted" className="mt-2">{error}</Text>
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
            <Heading as="h1" variant="card">{t('common.relayLanding.connecting')}</Heading>
            {relayUrl && (
              <Text as="p" variant="caption" className="mt-2 break-all font-mono">{relayUrl}</Text>
            )}
            <div className="lc-spinner mx-auto mt-4" />
          </>
        )}
      </Card>
    </main>
  );
}
