'use client';

import { useEffect } from 'react';
import { useNotificationStore } from '@/store/notification';

/**
 * Fetch unread counts on mount, tab focus, and socket reconnect.
 *
 * Single-mount fetch used to leave the badge stale forever if the client
 * missed a socket event (disconnect, OS-suspended tab, account-switch
 * race). Refetching on visibility/reconnect makes the server the source
 * of truth for counts whenever the tab has been backgrounded. Debounced
 * so tab-flap or reconnect storms don't hammer the DB.
 */
export function useUnreadRefresh(sessionChecked: boolean) {
  useEffect(() => {
    if (!sessionChecked) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const fetchNow = () => {
      fetch('/api/unread')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) {
            useNotificationStore.getState().setBulkUnreads(data);
          }
        })
        .catch(() => {});
    };

    const refreshUnreads = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchNow, 500);
    };

    fetchNow();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshUnreads();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshUnreads);
    window.addEventListener('obelisk:unread-refresh', refreshUnreads as EventListener);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshUnreads);
      window.removeEventListener('obelisk:unread-refresh', refreshUnreads as EventListener);
    };
  }, [sessionChecked]);
}
