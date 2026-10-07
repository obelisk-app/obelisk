'use client';

/**
 * The app's own confirmation dialog, in place of `window.confirm()`.
 *
 * The native dialog can't be styled, reads as a browser warning rather than
 * part of Obelisk, ignores the app's language (its buttons follow the OS),
 * and is suppressed outright in some embedded webviews, where `confirm()`
 * returns `false` and the action silently does nothing.
 *
 * Callers ask through `confirmDialog` in `src/services/confirm-dialog.ts`;
 * `<ConfirmDialogHost />` is mounted once in the root layout and renders
 * whatever request is pending there, so any code path (a component, a hook,
 * a plain function) can ask without owning modal state.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import Modal from './Modal';
import ModalHeader from './ModalHeader';
import ModalFooter from './ModalFooter';
import { useTranslations } from 'next-intl';
import { LogOutIcon, TrashIcon } from './icons';
import {
  getPendingConfirm, settleConfirm, subscribeConfirm, type PendingConfirm,
} from '@/services/confirm-dialog';

const getServerSnapshot = () => null;

export function ConfirmDialogHost() {
  const pending = useSyncExternalStore(subscribeConfirm, getPendingConfirm, getServerSnapshot);
  // An unmounting host (route change, logout) must not leave a caller
  // awaiting forever.
  useEffect(() => () => settleConfirm(false), []);
  if (!pending) return null;
  return <ConfirmDialogPanel key={pending.id} pending={pending} />;
}

function ConfirmDialogPanel({ pending }: { pending: PendingConfirm }) {
  const t = useTranslations();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const tone = pending.tone ?? 'danger';
  const icon = pending.icon ?? (tone === 'danger' ? 'trash' : 'none');
  const titleId = `confirm-dialog-title-${pending.id}`;
  const messageId = `confirm-dialog-message-${pending.id}`;

  // Focus lands on Cancel, not on the destructive button: an Enter pressed
  // out of habit should not delete anything. Focus goes back to whatever
  // opened the dialog when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  return (
    <Modal
      onClose={() => settleConfirm(false)}
      testId="confirm-dialog"
      // Above everything, the settings modal included: a confirmation asked
      // from inside it was painted behind it, out of reach.
      layerClassName="z-[210]"
      panelClassName="w-full max-w-sm mx-4 rounded-2xl bg-lc-dark border border-lc-border p-6 shadow-xl"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={pending.message ? messageId : undefined}
    >
      <ModalHeader
        variant="alert"
        tone={tone === 'danger' ? 'danger' : 'accent'}
        icon={icon === 'none' ? undefined : icon === 'trash' ? <TrashIcon size={22} /> : <LogOutIcon size={22} />}
        title={pending.title}
        subtitle={pending.message || undefined}
        titleId={titleId}
        subtitleId={messageId}
      />
      <ModalFooter
        variant="alert"
        cancelRef={cancelRef}
        cancel={{
          onClick: () => settleConfirm(false),
          label: pending.cancelLabel ?? t('common.cancel'),
          testId: 'confirm-dialog-cancel',
        }}
        actions={[{
          label: pending.confirmLabel ?? t('common.confirm.delete'),
          onClick: () => settleConfirm(true),
          tone: tone === 'danger' ? 'danger' : 'primary',
          testId: 'confirm-dialog-confirm',
        }]}
      />
    </Modal>
  );
}
