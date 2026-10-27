'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { nostrActions, useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useIsLoggedIn, useMyPubkey, useSessionActions, useSessionReady, useSignerReady } from '@/hooks/session/useSession';
import { loginWithFreshKey, redeemInvite } from '@/services/relay/relay-invite';
import { hasInviteWaitingForKey, pendingInviteFor } from '@/services/relay/relay-invite-storage';
import { useToastStore } from '@/store/feedback/toast';

/**
 * Redeem a stored relay invite for whichever key is in use (`RelayInviteRoot`).
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
  const actions = useSessionActions();
  const making = useRef(false);
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || loggedIn || making.current || !hasInviteWaitingForKey(relay)) return;
    making.current = true;
    loginWithFreshKey(actions)
      .catch(() => undefined)
      .finally(() => {
        making.current = false;
      });
  }, [ready, loggedIn, relay, actions]);

  useEffect(() => {
    if (!ready || !loggedIn || !signerReady || !pubkey) return;
    const invite = pendingInviteFor(relay, pubkey);
    const attempt = invite ? `${pubkey}:${invite.relay}:${invite.code}` : null;
    if (!invite || !attempt || inFlight.current === attempt) return;
    inFlight.current = attempt;
    redeemInvite(invite, pubkey)
      .then((outcome) => {
        // Re-enter the relay: its access verdict and every REQ it refused
        // start over, now that this key is admitted.
        if (outcome.status === 'admitted') return nostrActions.switchRelay(invite.relay);
        if (outcome.status === 'dead') {
          useToastStore.getState().pushToast({
            title: t('common.relayInvite.deadTitle'),
            body: t(`common.relayInvite.dead.${outcome.reason}`),
          });
        }
        return undefined;
      })
      .catch(() => undefined)
      .finally(() => {
        // A retryable outcome is tried again on the next change, not in a loop.
        if (inFlight.current === attempt) inFlight.current = null;
      });
  }, [ready, loggedIn, signerReady, pubkey, relay, t]);
}
