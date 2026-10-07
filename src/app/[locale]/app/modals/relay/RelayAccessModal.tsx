'use client';

import { useState } from 'react';
import { useIsLoggedIn, useCurrentRelayUrl, useRelayAccess, useMyLoginMethod } from '@/services/nostr-bridge';
import { shortHost } from '@/utils/relay-url/url-host';
import Modal from '@/components/ui/overlays/Modal';
import { useTranslations } from 'next-intl';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import { LockIcon, ServerIcon, ShieldIcon } from '@/assets/icons';

export function RelayAccessModal() {
  const t = useTranslations();
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
    ? t('shell.status.authRequired.title', { host })
    : isUnreachable
      ? t('shell.status.cannotReach', { host })
      : t('shell.status.restricted.title', { host });
  const body = isAuth
    ? loginMethod === 'bunker'
      ? t('shell.status.modal.authBunker')
      : loginMethod === 'nip07'
        ? t('shell.status.modal.authNip07')
        : t('shell.status.modal.authFailed')
    : isUnreachable
      ? t('shell.status.modal.unreachable')
      : t('shell.status.modal.restricted');

  const tone = isAuth ? 'warning' : 'danger';
  const icon = isAuth ? <LockIcon size={22} /> : isUnreachable ? <ServerIcon size={22} /> : <ShieldIcon size={22} />;

  return (
    <Modal
      onClose={() => setDismissed(key)}
      panelClassName={
        'max-w-md mx-4 rounded-xl border bg-lc-card p-6 shadow-2xl ' +
        (tone === 'warning' ? 'border-yellow-500/50' : 'border-red-500/50')
      }
    >
      <ModalHeader variant="alert" tone={tone} icon={icon} title={title} subtitle={body} />
      <ModalFooter variant="alert" actions={[{ label: t('shell.desktop.gotIt'), onClick: () => setDismissed(key) }]} />
    </Modal>
  );
}
