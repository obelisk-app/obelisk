'use client';

import { useId, useState } from 'react';
import type { ZapTarget } from '@/store/chat/message-zap';
import { useUserMetadata } from '@/services/nostr-bridge';
import { DEFAULT_ZAP_AMOUNT_SATS } from '@/constants/wallet/zap';
import { useSendZap } from './useSendZap';

/**
 * The zap dialog's form: the amount (the target's default to start, 0 for
 * anything that is not a number), the comment, who it goes to and their
 * lightning address (their kind 0 first, then what the target carried), and
 * the send with its busy and error state. A sent zap closes the dialog.
 */
export function useMessageZapForm(target: ZapTarget, close: () => void) {
  const amountId = useId();
  const commentId = useId();
  const [amount, setAmount] = useState<number>(target.defaultAmountSats ?? DEFAULT_ZAP_AMOUNT_SATS);
  const [comment, setComment] = useState<string>('');
  const meta = useUserMetadata(target.recipientPubkey);
  const lud16 = meta?.lud16 ?? target.recipientLud16 ?? null;
  const displayName = meta?.displayName || meta?.name || target.displayName;
  const { send, busy, error, unconfirmed } = useSendZap({ recipient: target, amountSats: amount, comment, lud16, displayName, onSent: close });
  return {
    amountId,
    commentId,
    amount,
    comment,
    lud16,
    displayName,
    send,
    busy,
    error,
    canSend: !busy && !unconfirmed && !!amount,
    setAmount,
    setAmountText: (value: string) => setAmount(parseInt(value, 10) || 0),
    setComment,
  };
}
