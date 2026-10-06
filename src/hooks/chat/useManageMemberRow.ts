'use client';

import { useState } from 'react';
import { nostrActions } from '@/services/nostr-bridge';

export type MemberRowAction = 'demote' | 'remove';

export interface ManageMemberRow {
  /** Which destructive action the row is currently asking about, if any. */
  readonly confirming: MemberRowAction | null;
  readonly ask: (action: MemberRowAction) => void;
  readonly cancel: () => void;
  /** Run the pending action (kind 9001 permission removal for demote, kind 9001 removal otherwise) and close the prompt. */
  readonly confirmPending: () => void;
}

/**
 * The inline confirm state machine behind one member row of the channel
 * settings form. An inline confirm keeps the question attached to the row
 * it is about; a `window.confirm` dialog names a person out of context and
 * on mobile covers the sheet. Both shells had this written out by hand with
 * the same branch; the row skins now only render.
 */
export function useManageMemberRow(groupId: string, pubkey: string): ManageMemberRow {
  const [confirming, setConfirming] = useState<MemberRowAction | null>(null);

  function confirmPending() {
    if (confirming === 'demote') void nostrActions.removePermission(groupId, pubkey, ['admin']);
    else if (confirming === 'remove') void nostrActions.removeUser(groupId, pubkey);
    setConfirming(null);
  }

  return {
    confirming,
    ask: setConfirming,
    cancel: () => setConfirming(null),
    confirmPending,
  };
}
