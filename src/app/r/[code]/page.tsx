'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { nostrActions } from '@/lib/nostr-bridge';
import { decodeRelayShareCode } from '@/lib/relay-share-link';

const RELAY_BRANDING: Record<string, { logo: string; alt: string }> = {
  'wss://lacrypta-relay.obelisk.ar': { logo: '/lacrypta-logo.png', alt: 'La Crypta' },
};

export default function RelayShareLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [relayUrl, setRelayUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = decodeRelayShareCode(code);
    if (!url) {
      setError('Invalid relay share link.');
      return;
    }
    setRelayUrl(url);
    let cancelled = false;
    (async () => {
      try {
        try {
          await nostrActions.addRelay(url);
        } catch (e) {
          // addRelay throws if already added or unreachable — only surface
          // the unreachable case. We probe by checking the message.
          const msg = (e as Error).message || '';
          if (!/already/i.test(msg)) throw e;
        }
        if (cancelled) return;
        await nostrActions.switchRelay(url);
        if (cancelled) return;
        router.replace('/app');
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to add relay.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-lc-black p-6">
      <div className="lc-card w-full max-w-md rounded-2xl border border-lc-border bg-lc-dark p-6 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-bold text-lc-white">Could not open relay</h1>
            <p className="mt-2 text-sm text-lc-muted">{error}</p>
            <button
              onClick={() => router.replace('/app')}
              className="mt-4 rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black"
            >
              Go to app
            </button>
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
            <h1 className="text-lg font-bold text-lc-white">Connecting to relay…</h1>
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
