'use client';

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '@/store/notification';
import { setBadgeCount, clearBadge } from '@/lib/favicon-badge';

const BASE_TITLE = 'Obelisk';

/**
 * Compute the unread total = every channel unread + every DM unread.
 * Surfaces all unread activity on the favicon + title, not just mentions.
 */
function computeTotal(): number {
  const state = useNotificationStore.getState();
  let total = 0;
  for (const count of Object.values(state.channelUnreads)) {
    total += count;
  }
  for (const count of Object.values(state.dmUnreads)) {
    total += count;
  }
  return total;
}

/**
 * Subscribe to notification store changes and mirror the unread total into
 * the browser tab: red dot on the favicon + `(N) Obelisk` in the title.
 * Should be mounted exactly once at the chat root.
 */
export function useFaviconBadge(): void {
  const originalTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (originalTitleRef.current === null) {
      // If the page loaded with an already-badged title (e.g. a remounted
      // hook after previously applying `(7) Obelisk`), strip the badge
      // back to the base so unmount/restore doesn't freeze a stale count.
      const current = document.title || BASE_TITLE;
      originalTitleRef.current = current.startsWith('(') ? BASE_TITLE : current;
    }

    const apply = (total: number) => {
      if (total > 0) {
        const label = total > 99 ? '99+' : String(total);
        document.title = `(${label}) ${originalTitleRef.current || BASE_TITLE}`;
        void setBadgeCount(total);
      } else {
        document.title = originalTitleRef.current || BASE_TITLE;
        void clearBadge();
      }
    };

    // Apply current state immediately
    apply(computeTotal());

    // Re-apply on every notification store change
    const unsubscribe = useNotificationStore.subscribe(() => {
      apply(computeTotal());
    });

    return () => {
      unsubscribe();
      // Restore title + favicon on unmount (e.g. on logout)
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
      void clearBadge();
    };
  }, []);
}
