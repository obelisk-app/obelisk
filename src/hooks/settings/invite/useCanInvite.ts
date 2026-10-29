'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useConfiguredRelays, useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useMyLoginMethod, useMyPubkey, useSignerReady } from '@/hooks/session/useSession';
import { fetchInviteStatus, peekInviteStatus, subscribeInviteStatus } from '@/services/relay/relay-invite-api';
import { inviteRelayChoices, showsInviteEntry } from '@/utils/relay/relay-invite-panel';

/**
 * Ask the relays in `ask` for this account's invite status (once each per
 * visit; `relay-invite-api.ts` remembers answers, never failures), and
 * re-render as answers arrive.
 */
function useInviteStatusAnswers(ask: ReadonlyArray<string>, pubkey: string | null, signerReady: boolean): void {
  const askKey = ask.join(' ');
  useEffect(() => {
    if (!pubkey || !signerReady) return;
    for (const relay of askKey.split(' ').filter(Boolean)) {
      // A relay that could not be asked just does not count, this time.
      void fetchInviteStatus(relay, pubkey).catch(() => undefined);
    }
  }, [askKey, pubkey, signerReady]);
}

/**
 * Whether Settings shows "Invite people": this account may invite on the
 * relay in view or on any other relay in its list, or made links on one of
 * them (a spent allowance still leaves the links and who joined to look at).
 *
 * The relay in view is always asked. The others are asked only when signing
 * is silent (a key held by the app); with an extension or a bunker every
 * request is a signature that may be a prompt, so for those the other relays
 * count once something else (the invite panel's relay picker) has asked.
 */
export function useCanInvite(): boolean {
  const relay = useCurrentRelayUrl();
  const configured = useConfiguredRelays();
  const pubkey = useMyPubkey();
  const signerReady = useSignerReady();
  const silent = useMyLoginMethod() === 'nsec';
  const choices = useMemo(() => inviteRelayChoices(relay, configured), [relay, configured]);
  useInviteStatusAnswers(silent ? choices : choices.slice(0, 1), pubkey, signerReady);
  return useSyncExternalStore(
    subscribeInviteStatus,
    () => !!pubkey && choices.some((url) => showsInviteEntry(peekInviteStatus(url, pubkey))),
    () => false,
  );
}

/**
 * Whether this account may create a link on `relay` now (the phone relay
 * menu's "Invite people"). Asked only when signing is silent: opening a menu
 * must not raise a signer prompt. Otherwise a remembered answer (from
 * Settings) counts.
 */
export function useCanMintOn(relay: string): boolean {
  const pubkey = useMyPubkey();
  const signerReady = useSignerReady();
  const silent = useMyLoginMethod() === 'nsec';
  useInviteStatusAnswers(silent ? [relay] : [], pubkey, signerReady);
  return useSyncExternalStore(
    subscribeInviteStatus,
    () => !!pubkey && !!peekInviteStatus(relay, pubkey)?.can_mint,
    () => false,
  );
}
