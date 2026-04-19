'use client';

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '@/store/notification';
import { useChatStore } from '@/store/chat';
import { isUserWatchingChannel } from '@/lib/read-gates';
import { setBadgeCount, clearBadge } from '@/lib/favicon-badge';

const BASE_TITLE = 'Obelisk';

/**
 * Compute the unread total = every channel unread + every DM unread.
 *
 * Excludes the currently-active channel when the user is actively watching
 * it (visible + focused + scrolled-near-bottom). In that case the unread
 * messages are rendered on-screen live — counting them in the favicon badge
 * produces a phantom number with no corresponding sidebar dot (the sidebar
 * suppresses the badge on the active row). This is distinct from the
 * mark-read gate in `useReadTracker`, which is intentionally stricter to
 * avoid silently marking server cursors on auto-land; the favicon just
 * reflects what the user can actually see.
 */
function computeTotal(): number {
  const state = useNotificationStore.getState();
  const activeChannelId = useChatStore.getState().activeChannelId;
  const skipChannel =
    activeChannelId && isUserWatchingChannel(activeChannelId) ? activeChannelId : null;

  let total = 0;
  for (const [id, count] of Object.entries(state.channelUnreads)) {
    if (id === skipChannel) continue;
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

    const recompute = () => apply(computeTotal());

    // Apply current state immediately
    recompute();

    // Re-apply on every notification store change AND on chat-store changes
    // (activeChannelId / isNearBottom) since those feed into the watching
    // check in computeTotal.
    const unsubNotif = useNotificationStore.subscribe(recompute);
    const unsubChat = useChatStore.subscribe(recompute);

    // Visibility + focus also feed into isUserWatchingChannel.
    document.addEventListener('visibilitychange', recompute);
    window.addEventListener('focus', recompute);
    window.addEventListener('blur', recompute);

    return () => {
      unsubNotif();
      unsubChat();
      document.removeEventListener('visibilitychange', recompute);
      window.removeEventListener('focus', recompute);
      window.removeEventListener('blur', recompute);
      // Restore title + favicon on unmount (e.g. on logout)
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
      void clearBadge();
    };
  }, []);
}
