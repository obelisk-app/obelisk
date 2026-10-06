'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { nostrActions } from '@/services/nostr-bridge';
import { decodeRelayShareCode } from '@/utils/relay-url/relay-share-link';
import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';

const RELAY_BRANDING: Record<string, { logo: string; alt: string }> = {
  'wss://lacrypta-relay.obelisk.ar': { logo: '/lacrypta-logo.png', alt: 'La Crypta' },
};

export default function RelayShareLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { t } = useTranslation();
  const { code } = use(params);
  const router = useRouter();
  // The relay is a pure function of the code; only the add/switch outcome
  // is state.
  const relayUrl = useMemo(() => decodeRelayShareCode(code), [code]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const error = relayUrl ? joinError : 'Invalid relay share link.';

  useEffect(() => {
    const url = relayUrl;
    if (!url) return;
    let cancelled = false;
    (async () => {
      try {
        try {
          await nostrActions.addRelay(url);
        } catch (e) {
          // addRelay throws if already added or unreachable - only surface
          // the unreachable case. We probe by checking the message.
          const msg = (e as Error).message || '';
          if (!/already/i.test(msg)) throw e;
        }
        if (cancelled) return;
        await nostrActions.switchRelay(url);
        if (cancelled) return;
        // Encode the relay in the URL so AppShell's deep-link effect re-applies
        // it on mount. Without this, a logged-out visitor whose switchRelay()
        // can't persist (no session yet) loses the choice on the next reload,
        // and `initialize()` restores the prior session's relay.
        const host = (() => {
          try { return new URL(url).host; } catch { return url.replace(/^wss?:\/\//, '').replace(/\/+$/, ''); }
        })();
        router.replace(`/app?relay=${encodeURIComponent(host)}`);
      } catch (e) {
        if (!cancelled) setJoinError((e as Error).message || 'Failed to add relay.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relayUrl, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-lc-black p-6">
      <div className="lc-card w-full max-w-md rounded-2xl border border-lc-border bg-lc-dark p-6 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-bold text-lc-white">{t('relayLanding.failed')}</h1>
            <p className="mt-2 text-sm text-lc-muted">{error}</p>
            <Button onClick={() => router.replace('/app')} className="mt-4">
              {t('relayLanding.goToApp')}
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
            <h1 className="text-lg font-bold text-lc-white">{t('relayLanding.connecting')}</h1>
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
