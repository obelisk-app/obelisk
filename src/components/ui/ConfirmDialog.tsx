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
import Button from './Button';
import Modal from './Modal';
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
      panelClassName="w-full max-w-sm mx-4 rounded-2xl bg-lc-dark border border-lc-border p-6 shadow-xl"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={pending.message ? messageId : undefined}
    >
      <div>
        {icon !== 'none' && (
          <div
            className={
              'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full '
              + (tone === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-lc-green/10 text-lc-green')
            }
            aria-hidden="true"
          >
            {icon === 'trash' ? <TrashIcon size={22} /> : <LogOutIcon size={22} />}
          </div>
        )}
        <h2 id={titleId} className="text-center text-lg font-semibold text-lc-white break-words">
          {pending.title}
        </h2>
        {pending.message && (
          <p id={messageId} className="mt-2 text-center text-sm text-lc-muted whitespace-pre-line break-words">
            {pending.message}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            variant="outlinePill"
            size="lg"
            onClick={() => settleConfirm(false)}
            data-testid="confirm-dialog-cancel"
          >
            {pending.cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'pill'}
            size={tone === 'danger' ? 'lg' : 'sm'}
            onClick={() => settleConfirm(true)}
            data-testid="confirm-dialog-confirm"
          >
            {pending.confirmLabel ?? t('common.confirm.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
