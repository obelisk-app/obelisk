'use client';

/**
 * Single source of "advance the read cursor while the user is reading."
 *
 * Mounted once at the top of `AppGate.tsx`, gated on `useIsLoggedIn`. Watches
 * the active DM thread and active channel; whenever the user is genuinely
 * watching them (visible + focused + active + nearBottom-for-channels), the
 * cursor advances to the latest message's `createdAt`.
 *
 * The hook only writes cursors. It does NOT touch `activeDMPubkey` or
 * `activeChannelId` — those stay owned by the shells' click handlers. That
 * separation lets one hook serve both mobile and desktop without coupling.
 */

import { useEffect } from 'react';
import { useDirectMessages, useMessages } from '@/lib/nostr-bridge';
import { useDMStore } from '@/store/dm';
import { useChatStore } from '@/store/chat';
import { useReadStateStore } from '@/store/read-state';
import { isUserWatchingChannel, isUserWatchingDM } from '@/lib/read-gates';

export function useAutoMarkRead(): void {
  const activeDm = useDMStore((s) => s.activeDMPubkey);
  const activeChannel = useChatStore((s) => s.activeChannelId);
  const dmsByPeer = useDirectMessages();
  const channelMessages = useMessages(activeChannel ?? null);
  // Re-runs whenever scroll position flips into/out of the bottom band.
  const isNearBottom = useChatStore((s) => s.isNearBottom);

  // ── DM cursor advance ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeDm) return;

    const advance = () => {
      if (!isUserWatchingDM(activeDm)) return;
      const peerMsgs = dmsByPeer[activeDm];
      if (!peerMsgs || peerMsgs.length === 0) return;
      const latestSec = peerMsgs[peerMsgs.length - 1].createdAt;
      const tsMs = latestSec * 1000;
      useReadStateStore.getState().setDmCursor(activeDm, tsMs);
    };

    // Run once for the current state, then on visibility/focus changes.
    advance();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', advance);
      window.addEventListener('focus', advance);
      window.addEventListener('blur', advance);
    }
    return () => {
      if (typeof document === 'undefined') return;
      document.removeEventListener('visibilitychange', advance);
      window.removeEventListener('focus', advance);
      window.removeEventListener('blur', advance);
    };
  }, [activeDm, dmsByPeer]);

  // ── Channel cursor advance ─────────────────────────────────────────
  useEffect(() => {
    if (!activeChannel) return;

    const advance = () => {
      if (!isUserWatchingChannel(activeChannel)) return;
      if (!channelMessages || channelMessages.length === 0) return;
      const latestSec = channelMessages[channelMessages.length - 1].createdAt;
      const tsMs = latestSec * 1000;
      useReadStateStore.getState().setGroupCursor(activeChannel, tsMs);
    };

    advance();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', advance);
      window.addEventListener('focus', advance);
      window.addEventListener('blur', advance);
    }
    return () => {
      if (typeof document === 'undefined') return;
      document.removeEventListener('visibilitychange', advance);
      window.removeEventListener('focus', advance);
      window.removeEventListener('blur', advance);
    };
  }, [activeChannel, channelMessages, isNearBottom]);
}
