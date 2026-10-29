'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { revokeInviteCode } from '@/services/relay/relay-invite-api';
import type { RelayInviteCode } from '@/types/relay/relay-invite';
import { errorText } from '@/utils/errors/error-text';
import { inviteUsage } from '@/utils/relay/relay-invite';
import { useRelayInviteLinkActions } from './useRelayInviteLinkActions';

/**
 * One invite link's card: how full it is, who joined, Copy and Share, and
 * "Turn off" behind an inline confirmation (turning off stops new joins;
 * people already in stay).
 */
export function useRelayInviteCodeCard({ relay, relayName, invite, link, at, onChanged }: {
  relay: string;
  relayName: string;
  invite: RelayInviteCode;
  link: string;
  /** When the answer was read, for the days left. */
  at: number;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const actions = useRelayInviteLinkActions(link, relayName);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    ...actions,
    ...inviteUsage(invite, at),
    active: invite.status === 'active',
    confirming,
    busy,
    error,
    askTurnOff: () => { setError(null); setConfirming(true); },
    cancelTurnOff: () => setConfirming(false),
    turnOff: async () => {
      setBusy(true);
      setError(null);
      try {
        await revokeInviteCode(relay, invite.code);
        setConfirming(false);
        onChanged();
      } catch (e) {
        setError(errorText(t, e, 'settings.invites.failed'));
      } finally {
        setBusy(false);
      }
    },
  };
}
