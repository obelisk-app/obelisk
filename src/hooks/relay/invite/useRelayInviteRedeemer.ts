'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { nostrActions, useConfiguredRelays, useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useIsLoggedIn, useMyPubkey, useSessionActions, useSessionReady, useSignerReady } from '@/hooks/session/useSession';
import { enterInviteRelay, loginWithFreshKey, redeemInvite, steerToInviteRelay } from '@/services/relay/relay-invite';
import { hasInviteWaitingForKey, pendingInviteFor, readStoredInvite } from '@/services/relay/relay-invite-storage';
import { confirmDialog } from '@/services/common/confirm-dialog';
import { relayHostLabel } from '@/utils/relay-url/relay-host';
import { useToastStore } from '@/store/feedback/toast';

/**
 * Redeem a stored relay invite for whichever key is in use (`RelayInviteRoot`).
 *
 * A fresh invite (no key let in yet) first takes a logged-out visitor to its
 * relay (`steerToInviteRelay`): silently for a relay in their list or a
 * built-in default, after a question for any other, and once per stored
 * invite. A logged-in person is not steered here: the chat shell reads the
 * link's `?relay=` through the deep-link gate, which asks the same question,
 * and two dialogs at once would cancel each other.
 *
 * Runs on every pubkey and relay change, so a generated, imported, extension
 * or bunker login, a restore, and a key made later all get let in by the same
 * code. With no account at all and a fresh invite, it makes a key first: the
 * person followed a link and should land in the app, not a key ceremony.
 * Once the code has let any key in, logging out leaves the login screen
 * alone, so the person can still choose their own key.
 */
export function useRelayInviteRedeemer(): void {
  const t = useTranslations();
  const ready = useSessionReady();
  const loggedIn = useIsLoggedIn();
  const signerReady = useSignerReady();
  const pubkey = useMyPubkey();
  const relay = useCurrentRelayUrl();
  const configured = useConfiguredRelays();
  const actions = useSessionActions();
  const making = useRef(false);
  const steering = useRef(false);
  const inFlight = useRef<string | null>(null);
  const configuredRef = useRef(configured);
  useEffect(() => { configuredRef.current = configured; }, [configured]);

  useEffect(() => {
    if (!ready || loggedIn || steering.current) return;
    const invite = readStoredInvite();
    if (!invite) return;
    steering.current = true;
    void steerToInviteRelay(invite, {
      current: relay,
      configured: configuredRef.current,
      confirm: (host) => confirmDialog({
        title: t('common.relayInvite.confirmTitle', { host }),
        message: t('common.relayInvite.confirmBody', { host }),
        confirmLabel: t('common.deeplink.relay.connect'),
        tone: 'default',
        icon: 'none',
      }),
      enter: enterInviteRelay,
    })
      .then((outcome) => {
        if (outcome !== 'failed') return;
        useToastStore.getState().pushToast({
          title: t('common.relayInvite.deadTitle'),
          body: t('common.relayInvite.switchFailed', { relay: relayHostLabel(invite.relay) }),
        });
      })
      .finally(() => {
        steering.current = false;
      });
  }, [ready, loggedIn, relay, t]);

  useEffect(() => {
    if (!ready || loggedIn || making.current || !hasInviteWaitingForKey(relay)) return;
    making.current = true;
    loginWithFreshKey(actions)
      .catch(() => {
        useToastStore.getState().pushToast({
          title: t('common.relayInvite.deadTitle'),
          body: t('common.relayInvite.keyFailed'),
        });
      })
      .finally(() => {
        making.current = false;
      });
  }, [ready, loggedIn, relay, actions, t]);

  useEffect(() => {
    if (!ready || !loggedIn || !signerReady || !pubkey) return;
    const invite = pendingInviteFor(relay, pubkey);
    const attempt = invite ? `${pubkey}:${invite.relay}:${invite.code}` : null;
    if (!invite || !attempt || inFlight.current === attempt) return;
    inFlight.current = attempt;
    const host = relayHostLabel(invite.relay);
    const notJoined = () => useToastStore.getState().pushToast({
      title: t('common.relayInvite.deadTitle'),
      body: t('common.relayInvite.redeemFailed', { relay: host }),
    });
    redeemInvite(invite, pubkey)
      .then((outcome) => {
        // Re-enter the relay: its access verdict and every REQ it refused
        // start over, now that this key is admitted.
        if (outcome.status === 'admitted') return nostrActions.switchRelay(invite.relay).catch(() => undefined);
        if (outcome.status === 'dead') {
          useToastStore.getState().pushToast({
            title: t('common.relayInvite.deadTitle'),
            body: t(`common.relayInvite.dead.${outcome.reason}`),
          });
        } else {
          notJoined();
        }
        return undefined;
      })
      .catch(notJoined)
      .finally(() => {
        // A retryable outcome is tried again on the next change, not in a loop.
        if (inFlight.current === attempt) inFlight.current = null;
      });
  }, [ready, loggedIn, signerReady, pubkey, relay, t]);
}
