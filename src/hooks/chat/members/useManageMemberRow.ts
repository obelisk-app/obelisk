'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { nostrActions } from '@/services/nostr-bridge';
import { errorText } from '@/utils/errors/error-text';

export type MemberRowAction = 'promote' | 'demote' | 'remove';

/** Member role actions are confirmed, serialized, and reflected by relay membership updates. */
export function useManageMemberRow(groupId: string, pubkey: string) {
  const t = useTranslations();
  const [confirming, setConfirming] = useState<MemberRowAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function confirmPending() {
    if (!confirming || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setConfirming(null);
    try {
      if (confirming === 'promote') await nostrActions.putUser(groupId, pubkey, ['admin']);
      else if (confirming === 'demote') await nostrActions.removePermission(groupId, pubkey, ['admin']);
      else await nostrActions.removeUser(groupId, pubkey);
    } catch (err) {
      setError(errorText(t, err, 'chat.channelSettings.memberFailed'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    confirming, busy, error,
    ask: (action: MemberRowAction) => { if (!inFlight.current) { setError(null); setConfirming(action); } },
    cancel: () => setConfirming(null),
    confirmPending,
  };
}
