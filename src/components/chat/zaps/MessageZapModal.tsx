'use client';

import { useId, useState } from 'react';
import { useMessageZapStore, type ZapTarget } from '@/store/chat/message-zap';
import { useUserMetadata } from '@/services/nostr-bridge';
import { DEFAULT_ZAP_AMOUNT_SATS, ZAP_QUICK_AMOUNTS_SATS } from '@/services/wallet/zap-constants';
import { useSendZap } from '@/hooks/chat/zaps/useSendZap';
import Modal from '@/components/ui/overlays/Modal';
import Input from '@/components/ui/forms/Input';
import { ZapIcon } from '@/components/ui/icons/icons';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import PayingWalletNote from './PayingWalletNote';

export default function MessageZapModal() {
  const target = useMessageZapStore((s) => s.target);
  const close = useMessageZapStore((s) => s.close);

  if (!target) return null;

  const key = `${target.groupId}:${target.messageId ?? ''}:${target.recipientPubkey}:${target.defaultAmountSats ?? DEFAULT_ZAP_AMOUNT_SATS}`;
  return <MessageZapModalInner key={key} target={target} close={close} />;
}

function MessageZapModalInner({ target, close }: { target: ZapTarget; close: () => void }) {
  const t = useTranslations();
  const { formatNumber } = useFormat();
  const amountId = useId();
  const commentId = useId();
  const [amount, setAmount] = useState<number>(target.defaultAmountSats ?? DEFAULT_ZAP_AMOUNT_SATS);
  const [comment, setComment] = useState<string>('');

  const meta = useUserMetadata(target.recipientPubkey);
  const lud16 = meta?.lud16 ?? target.recipientLud16 ?? null;
  const displayName = meta?.displayName || meta?.name || target.displayName;

  const { send, busy, error: err, unconfirmed } = useSendZap({
    recipient: target,
    amountSats: amount,
    comment,
    lud16,
    displayName,
    onSent: close,
  });

  return (
    <Modal
      onClose={close}
      panelClassName="w-full max-w-md mx-4 flex flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark"
    >
        <ModalHeader
          title={t('chat.zap.title', { name: displayName })}
          icon={<ZapIcon filled className="h-5 w-5 text-yellow-400" />}
          onClose={close}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label htmlFor={amountId} className="mb-2 block text-xs text-lc-muted">{t('chat.zap.amount')}</label>
          <Input
            id={amountId}
            type="number"
            value={amount}
            min={1}
            autoFocus
            onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
            className="mb-3"
          />
          <div className="mb-3 flex flex-wrap gap-2">
            {ZAP_QUICK_AMOUNTS_SATS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  amount === a
                    ? 'border-yellow-400 bg-yellow-400 text-lc-black'
                    : 'border-lc-border text-lc-white hover:bg-lc-border/40'
                }`}
              >
                {formatNumber(a)}
              </button>
            ))}
          </div>
          <label htmlFor={commentId} className="mb-2 block text-xs text-lc-muted">{t('chat.zap.comment')}</label>
          <Input
            id={commentId}
            type="text"
            value={comment}
            maxLength={200}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('chat.zap.commentPlaceholder')}
            className="mb-3"
          />
          {err && <p className="mb-3 break-words text-xs text-red-400">{err}</p>}
          {!lud16 && (
            <p className="mb-3 text-xs text-yellow-400">{t('chat.zap.noAddress')}</p>
          )}
          <PayingWalletNote className="mb-3" />
        </div>
        <ModalFooter
          cancel={{ onClick: close }}
          actions={[{
            label: busy ? t('common.sending') : t('chat.zap.send', { amount: formatNumber(amount) }),
            onClick: send,
            tone: 'zap',
            disabled: busy || unconfirmed || !amount,
          }]}
        />
    </Modal>
  );
}
