'use client';

import { useMessageZapStore } from '@/store/chat/message-zap';
import { DEFAULT_ZAP_AMOUNT_SATS } from '@/constants/wallet/zap';
import MessageZapDialog from './MessageZapDialog';

/** The zap dialog for a message or a person, open while the zap store has a target; a new target starts a fresh form. */
export default function MessageZapModal() {
  const target = useMessageZapStore((s) => s.target);
  const close = useMessageZapStore((s) => s.close);

  if (!target) return null;

  const key = `${target.groupId}:${target.messageId ?? ''}:${target.recipientPubkey}:${target.defaultAmountSats ?? DEFAULT_ZAP_AMOUNT_SATS}`;
  return <MessageZapDialog key={key} target={target} close={close} />;
}
