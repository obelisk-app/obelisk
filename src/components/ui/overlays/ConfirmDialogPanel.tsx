'use client';

import { useTranslations } from 'next-intl';
import Modal from './Modal';
import ModalHeader from './ModalHeader';
import ModalFooter from './ModalFooter';
import { LogOutIcon, TrashIcon } from '@/assets/icons';
import { useConfirmDialogPanel } from '@/hooks/common/useConfirmDialogPanel';
import type { PendingConfirm } from '@/services/common/confirm-dialog';

/** One pending confirmation, rendered by `ConfirmDialogHost`. */
export default function ConfirmDialogPanel({ pending }: { pending: PendingConfirm }) {
  const t = useTranslations();
  const vm = useConfirmDialogPanel(pending);
  return (
    <Modal
      onClose={vm.cancel}
      testId="confirm-dialog"
      // Above everything, the settings modal included: a confirmation asked
      // from inside it was painted behind it, out of reach.
      layerClassName="z-[210]"
      panelClassName="w-full max-w-sm mx-4 rounded-2xl bg-lc-dark border border-lc-border p-6 shadow-xl"
      role="alertdialog"
      aria-labelledby={vm.titleId}
      aria-describedby={pending.message ? vm.messageId : undefined}
    >
      <ModalHeader
        variant="alert"
        tone={vm.danger ? 'danger' : 'accent'}
        icon={vm.icon === 'none' ? undefined : vm.icon === 'trash' ? <TrashIcon size={22} /> : <LogOutIcon size={22} />}
        title={pending.title}
        subtitle={pending.message || undefined}
        titleId={vm.titleId}
        subtitleId={vm.messageId}
      />
      <ModalFooter
        variant="alert"
        cancelRef={vm.cancelRef}
        cancel={{
          onClick: vm.cancel,
          label: pending.cancelLabel ?? t('common.cancel'),
          testId: 'confirm-dialog-cancel',
        }}
        actions={[{
          label: pending.confirmLabel ?? t('common.confirm.delete'),
          onClick: vm.confirm,
          tone: vm.danger ? 'danger' : 'primary',
          testId: 'confirm-dialog-confirm',
        }]}
      />
    </Modal>
  );
}
