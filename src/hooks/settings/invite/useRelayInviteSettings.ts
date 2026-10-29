'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConfiguredRelays, useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useMyPubkey, useSignerReady } from '@/hooks/session/useSession';
import { fetchInviteStatus } from '@/services/relay/relay-invite-api';
import { fetchRelayInfo } from '@/services/relay/relay-info';
import { onOpenSettings, takeRequestedInviteRelay } from '@/services/settings/open-settings';
import type { RelayInviteCode, RelayInviteMe } from '@/types/relay/relay-invite';
import { RELAY_INVITE_AUTO_ALLOWANCE } from '@/constants/relay/relay-invite';
import { relayInviteLink } from '@/utils/relay/relay-invite';
import {
  inviteAllowance,
  inviteFormLimits,
  inviteRelayChoices,
  splitInviteCodes,
} from '@/utils/relay/relay-invite-panel';
import { relayHostLabel } from '@/utils/relay-url/relay-host';
import { sameRelay, normalizeDeepLinkRelay } from '@/utils/relay/deep-link';

type Answer =
  | { key: string; me: RelayInviteMe | null; at: number }
  | { key: string; failed: true };

/**
 * Settings > Invite people. Settings are global, so the panel names the relay
 * the links are for and lets the person pick another of their relays right
 * there, without leaving settings or changing the relay in view. Each pick
 * asks that relay's minter API (`GET /api/invites/me`, NIP-98 signed for that
 * relay's URL), once per visit; a request that failed is shown with Retry
 * and asked again, never remembered.
 */
export function useRelayInviteSettings() {
  const t = useTranslations();
  const current = useCurrentRelayUrl();
  const configured = useConfiguredRelays();
  const pubkey = useMyPubkey();
  const signerReady = useSignerReady();
  // Null follows the relay in view; a pick (or the relay menu's request) pins one.
  const [picked, setPicked] = useState<string | null>(() => takeRequestedInviteRelay());
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [names, setNames] = useState<Record<string, string>>({});
  // The link just made, shown on its own above the list until the relay changes.
  const [created, setCreated] = useState<{ relay: string; code: string } | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  // Already open when the relay menu asks for another relay: follow the request.
  useEffect(() => onOpenSettings(({ section, relay }) => {
    if (section !== 'invites' || !relay) return;
    setPicked(takeRequestedInviteRelay() ?? relay);
  }), []);

  const relay = picked ?? current;
  const choices = useMemo(() => {
    const list = inviteRelayChoices(current, configured);
    return picked && !list.some((url) => sameRelay(url, normalizeDeepLinkRelay(picked))) ? [...list, picked] : list;
  }, [current, configured, picked]);
  const choicesKey = choices.join(' ');

  // Names for the picker, from each relay's NIP-11 document (cached locally).
  useEffect(() => {
    let alive = true;
    for (const url of choicesKey.split(' ').filter(Boolean)) {
      void fetchRelayInfo(url).then((info) => {
        if (alive && info?.name) setNames((prev) => (prev[url] === info.name ? prev : { ...prev, [url]: info.name! }));
      });
    }
    return () => { alive = false; };
  }, [choicesKey]);

  const key = `${relay}|${pubkey ?? ''}|${attempt}`;
  // Ask `relay` (or take its remembered answer); the answer is tagged with
  // the relay, account and attempt it is for, so a switch reads as loading.
  const ask = useCallback((fresh: boolean, tag: string) => {
    if (!pubkey || !relay) return () => {};
    let alive = true;
    fetchInviteStatus(relay, pubkey, fresh).then(
      (me) => { if (alive) setAnswer({ key: tag, me, at: Date.now() }); },
      () => { if (alive) setAnswer({ key: tag, failed: true }); },
    );
    return () => { alive = false; };
  }, [relay, pubkey]);

  useEffect(() => (signerReady ? ask(false, key) : undefined), [ask, key, signerReady]);
  const reload = () => { ask(true, key); };

  const mine = answer?.key === key ? answer : null;
  const me = mine && 'me' in mine ? mine.me : null;
  const at = mine && 'at' in mine ? mine.at : 0;
  const host = relay ? relayHostLabel(relay) : '';
  const linkFor = (code: string) => relayInviteLink(window.location.origin, code, host);
  const rowFor = (invite: RelayInviteCode) => ({ invite, link: linkFor(invite.code), at });
  const split = splitInviteCodes(me?.codes ?? []);
  const newest = created && created.relay === relay ? created.code : null;
  const relayName = names[relay] ?? host;
  const total = me?.admits_total ?? RELAY_INVITE_AUTO_ALLOWANCE;

  return {
    relay,
    relayHost: host,
    relayName,
    choices: choices.map((url) => {
      const label = names[url] ? t('settings.invites.relayOption', { name: names[url], host: relayHostLabel(url) }) : relayHostLabel(url);
      return { url, label: url === current ? t('settings.invites.relayOptionCurrent', { relay: label }) : label };
    }),
    pick: (url: string) => setPicked(url === current ? null : url),
    loading: !mine,
    failed: !!mine && 'failed' in mine,
    retry: () => setAttempt((n) => n + 1),
    me,
    /** The relay answered that it has no invite links at all. */
    noApi: !!mine && 'me' in mine && mine.me === null,
    /** Who may invite on this relay, and whether this account is one of them. */
    explanation: !me ? null : me.basis
      ? t(`settings.invites.basis.${me.basis}`, { relay: relayName, total })
      : t('settings.invites.basis.none', { total: RELAY_INVITE_AUTO_ALLOWANCE }),
    /** May invite here, but the allowance is spent: links stay listed, nothing new. */
    spent: !!me?.basis && !me.can_mint,
    canCreate: !!me?.can_mint,
    allowance: me ? inviteAllowance(me) : null,
    limits: me ? inviteFormLimits(me) : null,
    /** Live links, the one just made left out (it is shown on its own). */
    active: split.active.filter((i) => i.code !== newest).map(rowFor),
    past: split.past.map(rowFor),
    pastOpen,
    togglePast: () => setPastOpen((open) => !open),
    created: newest ? linkFor(newest) : null,
    onCreated: (invite: RelayInviteCode) => {
      setCreated({ relay, code: invite.code });
      reload();
    },
    /** After a link was turned off: ask again, skipping the remembered answer. */
    refresh: reload,
  };
}
