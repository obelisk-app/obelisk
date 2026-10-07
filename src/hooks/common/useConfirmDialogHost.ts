'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getPendingConfirm, settleConfirm, subscribeConfirm } from '@/services/common/confirm-dialog';

const getServerSnapshot = () => null;

/**
 * The confirm dialog host's view model: the request waiting for an answer,
 * or null. An unmounting host (route change, logout) answers "no", so a
 * caller is never left awaiting forever.
 */
export function useConfirmDialogHost() {
  const pending = useSyncExternalStore(subscribeConfirm, getPendingConfirm, getServerSnapshot);
  useEffect(() => () => settleConfirm(false), []);
  return pending;
}
