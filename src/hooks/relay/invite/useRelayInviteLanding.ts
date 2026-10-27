'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from '@/i18n/navigation';
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
  const code = useMemo(() => cleanInviteCode(rawCode), [rawCode]);

  useEffect(() => {
    if (!code) return;
    storeInvite(code, relay);
    router.replace(`/app?relay=${encodeURIComponent(relayHostLabel(relay))}`);
  }, [code, relay, router]);

  return { valid: code !== null, goToApp: () => router.replace('/app') };
}
