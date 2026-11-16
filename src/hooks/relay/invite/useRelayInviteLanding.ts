'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, getPathname } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { storeInvite } from '@/services/relay/relay-invite-storage';
import { cleanInviteCode } from '@/utils/relay/relay-invite';
import { relayHostLabel } from '@/utils/relay-url/relay-host';

/**
 * The `/invite/<code>` landing: keep the code for `relay`, then open the app
 * with `?relay=`, so the app's deep-link gate decides the switch (silently for
 * a relay the person already has or the default, with a question for a new
 * one). The redeeming, and the key if there is none, happen in the app
 * (`useRelayInviteRedeemer`).
 */
export function useRelayInviteLanding(rawCode: string, relay: string) {
  const router = useRouter();
  const locale = useLocale();
  const code = useMemo(() => cleanInviteCode(rawCode), [rawCode]);
  const concord = rawCode.startsWith('naddr1');

  useEffect(() => {
    if (concord) {
      window.location.replace(`${getPathname({ locale, href: '/app' })}#concord-invite=${encodeURIComponent(window.location.href)}`);
      return;
    }
    if (!code) return;
    storeInvite(code, relay);
    router.replace(`/app?relay=${encodeURIComponent(relayHostLabel(relay))}`);
  }, [code, concord, relay, router, locale]);

  return { valid: concord || code !== null, goToApp: () => router.replace('/app') };
}
