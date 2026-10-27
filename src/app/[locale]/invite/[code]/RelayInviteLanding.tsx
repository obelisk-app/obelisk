'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { useRelayInviteLanding } from '@/hooks/relay/invite/useRelayInviteLanding';
import Heading from '@/components/ui/layout/Heading';

/** Keeps the invite and opens the app on its relay; the page around it (`page.tsx`) carries the card. */
export default function RelayInviteLanding({ code, relay }: { code: string; relay: string }) {
  const t = useTranslations();
  const { valid, goToApp } = useRelayInviteLanding(code, relay);

  return (
    <main className="flex min-h-screen items-center justify-center bg-lc-black p-6">
      <Card variant="interactive" padding="2xl" className="w-full max-w-md rounded-2xl border border-lc-border bg-lc-dark text-center">
        {valid ? (
          <>
            <Heading as="h1" variant="card">{t('common.relayInvite.joining')}</Heading>
            <div className="lc-spinner mx-auto mt-4" />
          </>
        ) : (
          <>
            <Heading as="h1" variant="card">{t('common.relayInvite.invalid')}</Heading>
            <Button onClick={goToApp} className="mt-4">{t('common.relayLanding.goToApp')}</Button>
          </>
        )}
      </Card>
    </main>
  );
}
