'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { nostrActions } from '@/services/nostr-bridge';
import { decodeRelayShareCode } from '@/utils/relay-url/relay-share-link';
import { relayHostLabel } from '@/utils/relay-url/relay-host';
import { errorText } from '@/utils/errors/error-text';

/**
 * Add the relay a shared link names (`addRelay` failing because it is
 * already in the rail is fine; anything else is not), switch to it, and open
 * the app on it.
 */
async function joinSharedRelay(url: string, cancelled: () => boolean): Promise<string | null> {
  try {
    await nostrActions.addRelay(url);
  } catch (e) {
    // addRelay throws if already added or unreachable - only surface
    // the unreachable case. We probe by checking the message.
    const msg = (e as Error).message || '';
    if (!/already/i.test(msg)) throw e;
  }
  if (cancelled()) return null;
  await nostrActions.switchRelay(url);
  if (cancelled()) return null;
  // Encode the relay in the URL so AppShell's deep-link effect re-applies
  // it on mount. Without this, a logged-out visitor whose switchRelay()
  // can't persist (no session yet) loses the choice on the next reload,
  // and `initialize()` restores the prior session's relay.
  return `/app?relay=${encodeURIComponent(relayHostLabel(url))}`;
}

/**
 * The `/r/<code>` landing (`src/app/[locale]/r/[code]/RelayShareLanding.tsx`):
 * the relay the code names, joining it on arrival, and the sentence to show
 * when the code is not a relay or the relay cannot be added.
 */
export function useRelayShareLanding(code: string) {
  const t = useTranslations();
  const router = useRouter();
  // The relay is a pure function of the code; only the add/switch outcome
  // is state.
  const relayUrl = useMemo(() => decodeRelayShareCode(code), [code]);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const url = relayUrl;
    if (!url) return;
    let cancelled = false;
    joinSharedRelay(url, () => cancelled)
      .then((next) => {
        if (next) router.replace(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setJoinError(errorText(t, e, 'settings.relayShare.failed'));
      });
    return () => {
      cancelled = true;
    };
  }, [relayUrl, router, t]);

  return {
    relayUrl,
    error: relayUrl ? joinError : t('settings.relayShare.invalid'),
    goToApp: () => router.replace('/app'),
  };
}
