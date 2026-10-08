'use client';

import Button from '@/components/ui/buttons/Button';
import type { ZapTarget } from '@/store/chat/message-zap';
import { ZAP_QUICK_AMOUNTS_SATS } from '@/constants/wallet/zap';
import { useMessageZapForm } from '@/hooks/chat/zaps/useMessageZapForm';
import Modal from '@/components/ui/overlays/Modal';
import Input from '@/components/ui/forms/Input';
import { ZapIcon } from '@/assets/icons';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/hooks/common/useFormat';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import PayingWalletNote from './PayingWalletNote';
import Label from '@/components/ui/forms/Label';
import FormError from '@/components/ui/forms/FormError';
import Text from '@/components/ui/layout/Text';

/** The zap form for one target: amount (with quick picks), comment, and send on the yellow zap pill. */
export default function MessageZapDialog({ target, close }: { target: ZapTarget; close: () => void }) {
  const t = useTranslations();
  const { formatNumber } = useFormat();
  const vm = useMessageZapForm(target, close);

  return (
    <Modal
      onClose={close}
      panelClassName="w-full max-w-md mx-4 flex flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark"
    >
        <ModalHeader
          title={t('chat.zap.title', { name: vm.displayName })}
          icon={<ZapIcon filled className="h-5 w-5 text-yellow-400" />}
          onClose={close}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <Label htmlFor={vm.amountId} className="mb-2 block text-xs text-lc-muted">{t('chat.zap.amount')}</Label>
          <Input
            id={vm.amountId}
            type="number"
            value={vm.amount}
            min={1}
            autoFocus
            onChange={(e) => vm.setAmountText(e.target.value)}
            className="mb-3"
          />
          <div className="mb-3 flex flex-wrap gap-2">
            {ZAP_QUICK_AMOUNTS_SATS.map((a) => (
              <Button
                variant="bare"
                key={a}
                type="button"
                onClick={() => vm.setAmount(a)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  vm.amount === a
                    ? 'border-yellow-400 bg-yellow-400 text-lc-black'
                    : 'border-lc-border text-lc-white hover:bg-lc-border/40'
                }`}
              >
                {formatNumber(a)}
              </Button>
            ))}
          </div>
          <Label htmlFor={vm.commentId} className="mb-2 block text-xs text-lc-muted">{t('chat.zap.comment')}</Label>
          <Input
            id={vm.commentId}
            type="text"
            {...vm.comment}
            maxLength={200}
            placeholder={t('chat.zap.commentPlaceholder')}
            className="mb-3"
          />
          <FormError className="mb-3">{vm.error}</FormError>
          {!vm.lud16 && (
            <Text as="p" size="xs" className="mb-3 text-yellow-400">{t('chat.zap.noAddress')}</Text>
          )}
          <PayingWalletNote className="mb-3" />
        </div>
        <ModalFooter
          cancel={{ onClick: close }}
          actions={[{
            label: vm.busy ? t('common.sending') : t('chat.zap.send', { amount: formatNumber(vm.amount) }),
            onClick: vm.send,
            tone: 'zap',
            disabled: !vm.canSend,
          }]}
        />
    </Modal>
  );
}
