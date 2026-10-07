'use client';

import { useEffect, useRef } from 'react';
import { settleConfirm, type PendingConfirm } from '@/services/common/confirm-dialog';

/**
 * The confirm dialog's view model: its look from the request, its ids, and
 * the answer handlers. Focus lands on Cancel, not on the destructive button,
 * so an Enter pressed out of habit deletes nothing; it goes back to whatever
 * opened the dialog when it closes.
 */
export function useConfirmDialogPanel(pending: PendingConfirm) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);
  const tone = pending.tone ?? 'danger';
  return {
    cancelRef,
    danger: tone === 'danger',
    icon: pending.icon ?? (tone === 'danger' ? 'trash' : 'none'),
    titleId: `confirm-dialog-title-${pending.id}`,
    messageId: `confirm-dialog-message-${pending.id}`,
    cancel: () => settleConfirm(false),
    confirm: () => settleConfirm(true),
  };
}
