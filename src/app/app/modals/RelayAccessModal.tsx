'use client';

import { useState } from 'react';
import { useIsLoggedIn, useCurrentRelayUrl, useRelayAccess, useMyLoginMethod } from '@/services/nostr-bridge';
import { shortHost } from '@/utils/relay-url/url-host';
import Modal from '@/components/ui/Modal';
import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';

export function RelayAccessModal() {
  const { t } = useTranslation();
  const relay = useCurrentRelayUrl();
  const access = useRelayAccess();
  const loginMethod = useMyLoginMethod();
  const isLoggedIn = useIsLoggedIn();
  // Track which (relay, state) tuple the user has dismissed so the modal
  // doesn't keep popping back. A real state change (e.g. ok -> restricted
  // again on a new relay, or auth-required after restricted) re-arms it.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const surfaceable =
    access === 'restricted' || access === 'auth-required' || access === 'unreachable';
  const key = relay && surfaceable ? `${relay}|${access}` : null;
  if (!isLoggedIn) return null;
  if (!key) return null;
  if (dismissed === key) return null;

  const host = shortHost(relay);
  const isAuth = access === 'auth-required';
  const isUnreachable = access === 'unreachable';
  const title = isAuth
    ? `Not authenticated to ${host}`
    : isUnreachable
      ? `Cannot reach ${host}`
      : `Not whitelisted on ${host}`;
  const body = isAuth
    ? loginMethod === 'bunker'
      ? 'Approve the signing request in your bunker app to complete NIP-42 AUTH.'
      : loginMethod === 'nip07'
        ? 'Approve the signing request in your Nostr extension to complete NIP-42 AUTH.'
        : 'NIP-42 AUTH did not complete. Try reloading or switching login methods.'
    : isUnreachable
      ? 'The relay isn’t responding. It may be offline, blocked by your network, or briefly unavailable. We’ll keep trying in the background. Switch relays if you need to keep working.'
      : 'This relay accepted your signature but won’t serve or accept events from your pubkey. Ask the operator to add you to its allowlist, or switch relays.';

  const tone = isAuth ? 'yellow' : 'red';

  return (
    <Modal
      onClose={() => setDismissed(key)}
      panelClassName={
        'max-w-md mx-4 rounded-xl border bg-lc-card p-6 shadow-2xl ' +
        (tone === 'yellow' ? 'border-yellow-500/50' : 'border-red-500/50')
      }
    >
        <div className={'text-xl font-bold ' + (tone === 'yellow' ? 'text-yellow-200' : 'text-red-300')}>
          {title}
        </div>
        <div className="mt-3 text-sm text-lc-white/90">{body}</div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setDismissed(key)}>
            {t('desktop.gotIt')}
          </Button>
        </div>
    </Modal>
  );
}
