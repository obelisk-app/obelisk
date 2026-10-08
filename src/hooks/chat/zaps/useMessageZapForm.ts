'use client';

import { useId } from 'react';
import type { ZapTarget } from '@/store/chat/message-zap';
import { useUserMetadata } from '@/services/nostr-bridge';
import { DEFAULT_ZAP_AMOUNT_SATS } from '@/constants/wallet/zap';
import { useForm } from '@/hooks/common/useForm';
import { useSendZap } from './useSendZap';

/**
 * The zap dialog's form: the amount (the target's default to start, 0 for
 * anything that is not a number) and the comment are the common form's
 * values; who it goes to and their lightning address come from their kind 0
 * first, then what the target carried. It stays a hook because sending is
 * money: `useSendZap` keeps its own busy flag, error and "the wallet may
 * have paid" lock, which outlast a submit, so the dialog reads those rather
 * than the form's. A sent zap closes the dialog.
 */
export function useMessageZapForm(target: ZapTarget, close: () => void) {
  const amountId = useId();
  const commentId = useId();
  const meta = useUserMetadata(target.recipientPubkey);
  const lud16 = meta?.lud16 ?? target.recipientLud16 ?? null;
  const displayName = meta?.displayName || meta?.name || target.displayName;
  const form = useForm({
    initial: () => ({ amount: target.defaultAmountSats ?? DEFAULT_ZAP_AMOUNT_SATS, comment: '' }),
    submit: () => zap.send(),
  });
  const zap = useSendZap({ recipient: target, amountSats: form.values.amount, comment: form.values.comment, lud16, displayName, onSent: close });
  return {
    amountId,
    commentId,
    amount: form.values.amount,
    comment: form.field('comment'),
    lud16,
    displayName,
    send: () => void form.submit(),
    busy: zap.busy,
    error: zap.error,
    canSend: !zap.busy && !zap.unconfirmed && !!form.values.amount,
    setAmount: (value: number) => form.set('amount', value),
    setAmountText: (value: string) => form.set('amount', parseInt(value, 10) || 0),
  };
}
