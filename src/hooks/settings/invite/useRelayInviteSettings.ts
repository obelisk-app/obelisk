'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useMyPubkey, useSignerReady } from '@/hooks/session/useSession';
import {
  createInviteCode,
  fetchInviteStatus,
  revokeInviteCode,
  type RelayInviteMe,
} from '@/services/relay/relay-invite-api';
import { copyWithToast } from '@/services/common/clipboard';
import { relayInviteLink } from '@/utils/relay/relay-invite';
import { relayHostLabel } from '@/utils/relay-url/relay-host';
import { errorText } from '@/utils/errors/error-text';
import { shortNpubLabel } from '@/utils/identity/short-npub';

/**
 * Settings > Invite people: this account's invite links on the relay in
 * view, how much of each is used and who joined on it, and making or
 * stopping one. Data from the relay's minter API (`relay-invite-api.ts`).
 */
export function useRelayInviteSettings() {
  const t = useTranslations();
  const relay = useCurrentRelayUrl();
  const pubkey = useMyPubkey();
  const signerReady = useSignerReady();
  const key = `${relay}|${pubkey ?? ''}`;
  // The answer is tagged with the relay and account it is for, so switching
  // either reads as loading again without resetting state in an effect.
  const [answer, setAnswer] = useState<{ key: string; me: RelayInviteMe | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    if (!pubkey || !relay) return;
    const me = await fetchInviteStatus(relay, pubkey, fresh);
    setAnswer({ key: `${relay}|${pubkey}`, me });
  }, [relay, pubkey]);

  useEffect(() => {
    if (!signerReady || !pubkey || !relay) return;
    let cancelled = false;
    void fetchInviteStatus(relay, pubkey).then((me) => {
      if (!cancelled) setAnswer({ key: `${relay}|${pubkey}`, me });
    });
    return () => {
      cancelled = true;
    };
  }, [relay, pubkey, signerReady]);

  const me = answer?.key === key ? answer.me : null;
  const loading = answer?.key !== key;

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load(true);
    } catch (e) {
      setError(errorText(t, e, 'settings.invites.failed'));
    } finally {
      setBusy(false);
    }
  };

  const linkFor = (code: string) => relayInviteLink(window.location.origin, code, relayHostLabel(relay));

  return {
    loading,
    busy,
    error,
    me,
    relayHost: relayHostLabel(relay),
    linkFor,
    /** Each code with its link and who joined on it, newest first (the relay's order). */
    rows: (me?.codes ?? []).map((invite) => ({
      invite,
      link: linkFor(invite.code),
      joined: invite.redemptions.map((r) => shortNpubLabel(r.pubkey)).join(', '),
    })),
    create: () => act(async () => {
      const invite = await createInviteCode(relay);
      copyWithToast(linkFor(invite.code), t('settings.invites.copied'));
    }),
    copy: (code: string) => copyWithToast(linkFor(code), t('settings.invites.copied')),
    revoke: (code: string) => act(() => revokeInviteCode(relay, code)),
  };
}
