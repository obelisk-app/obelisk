'use client';

import { AddRelayModal } from '../../rail/AddRelayModal';
import { useState } from 'react';
import { useCurrentRelayUrl, useRelayAccess } from '@/services/nostr-bridge';
import { useIsLoggedIn, useMyLoginMethod } from '@/hooks/session/useSession';
import { shortHost } from '@/utils/relay-url/url-host';
import Modal from '@/components/ui/overlays/Modal';
import { useTranslations } from 'next-intl';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import { LockIcon, ServerIcon } from '@/assets/icons';

export function RelayAccessModal() {
  const t = useTranslations();
  const relay = useCurrentRelayUrl();
  const access = useRelayAccess();
  const loginMethod = useMyLoginMethod();
  const isLoggedIn = useIsLoggedIn();
  // Track which (relay, state) tuple the user has dismissed so the modal
  // doesn't keep popping back. A real state change (e.g. ok -> unreachable
  // on a new relay, or auth-required after that) re-arms it.
  const [choosingRelay, setChoosingRelay] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Not `restricted`: a refused key already gets the activity stack's status
  // row and, in the main pane, the empty state that says how to get in (the
  // npub for the operator, another relay). A modal on top was a third copy
  // of the same sentence.
  const surfaceable = access === 'auth-required' || access === 'unreachable';
  const key = relay && surfaceable ? `${relay}|${access}` : null;
  if (!isLoggedIn) return null;
  if (choosingRelay) return <AddRelayModal onClose={() => setChoosingRelay(false)} />;
  if (!key) return null;
  if (dismissed === key) return null;

  const host = shortHost(relay);
  const isAuth = access === 'auth-required';
  const title = isAuth ? t('shell.status.authRequired.title', { host }) : t('shell.status.cannotReach', { host });
  const body = isAuth
    ? loginMethod === 'bunker'
      ? t('shell.status.modal.authBunker')
      : loginMethod === 'nip07'
        ? t('shell.status.modal.authNip07')
        : t('shell.status.modal.authFailed')
    : t('shell.status.modal.unreachable');

  const tone = isAuth ? 'warning' : 'danger';
  const icon = isAuth ? <LockIcon size={22} /> : <ServerIcon size={22} />;

  return (
    <Modal
      onClose={() => setDismissed(key)}
      panelClassName={
        'max-w-md mx-4 rounded-xl border bg-lc-card p-6 shadow-2xl ' +
        (tone === 'warning' ? 'border-yellow-500/50' : 'border-red-500/50')
      }
    >
      <ModalHeader variant="alert" tone={tone} icon={icon} title={title} subtitle={body} />
      <ModalFooter variant="alert" actions={[{ label: t('shell.loginRecovery.chooseRelay'), onClick: () => setChoosingRelay(true) }, { label: t('shell.desktop.gotIt'), onClick: () => setDismissed(key) }]} />
    </Modal>
  );
}
