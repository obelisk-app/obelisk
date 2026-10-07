'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLoadEarlier, type JsMessage } from '@/services/nostr-bridge';
import { useReadStateStore } from '@/store/read-state';
import { useChatStore } from '@/store/chat';
import { channelScrollPositionKey } from '@/utils/chat/timeline/channel-scroll-position';
import { channelInitialAnchorFromCursor } from '@/utils/chat/timeline/channel-scroll-anchor';
import { useChannelScrollPosition } from '@/hooks/chat/timeline/useChannelScrollPosition';
import { useHistoryPagination } from '@/hooks/chat/timeline/useHistoryPagination';

/**
 * The desktop channel's scroll viewport: where it opens (saved position or
 * first unread), stick-to-bottom, top-of-list pagination, and the
 * scroll-and-flash for a `?m=` / search jump. Restore and pagination are the
 * shared `src/hooks/chat/` hooks the phone shell uses too.
 */
export function useChannelViewport({
  groupId, relay, myPubkey, messages, pendingMessageId, onConsumePendingMessageId,
}: {
  groupId: string;
  relay: string;
  myPubkey: string | null;
  messages: ReadonlyArray<JsMessage>;
  pendingMessageId: string | null;
  onConsumePendingMessageId: () => void;
}) {
  const readCursorMs = useReadStateStore((s) => s.groupCursors[groupId]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = useMemo(() => channelScrollPositionKey(relay, groupId), [relay, groupId]);
  const initialAnchor = useMemo(
    () => channelInitialAnchorFromCursor(messages, readCursorMs, myPubkey),
    [messages, myPubkey, readCursorMs],
  );
  const initialAnchorMessageId = initialAnchor.kind === 'message' ? initialAnchor.messageId : null;
  const getInitialAnchorElement = useCallback(() => {
    if (!initialAnchorMessageId) return null;
    const scroller = scrollRef.current;
    if (!scroller) return null;
    const target = document.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(initialAnchorMessageId)}"]`);
    if (!target || !scroller.contains(target)) return null;
    return target;
  }, [initialAnchorMessageId]);

  // "Stick to bottom", auto-scroll on new messages only when the user is
  // already near the bottom. Reading mid-history without being yanked down
  // by every incoming message is a basic chat-UX expectation; the previous
  // unconditional `scrollTop = scrollHeight` broke that, and combined with
  // the now-removed messagesVisible unmount it also re-rendered users to
  // the top of the channel on AUTH flicker.
  const stickToBottomRef = useRef(true);
  const setNearBottom = useCallback((near: boolean) => {
    stickToBottomRef.current = near;
    const cur = useChatStore.getState().isNearBottom;
    if (cur !== near) useChatStore.setState({ isNearBottom: near });
  }, []);
  useChannelScrollPosition({
    scrollKey,
    scrollRef,
    itemCount: messages.length,
    disabled: !!pendingMessageId,
    initialAnchorKey: initialAnchorMessageId,
    getInitialAnchorElement,
    nearBottomPx: 100,
    onNearBottomChange: setNearBottom,
  });
  const { loadEarlier, loading: loadingEarlier, reachedStart } = useLoadEarlier(groupId);
  // Top-of-list pagination + scroll anchoring live in the shared hook so the
  // desktop and phone shells behave identically. See useHistoryPagination for
  // why the trigger prefetches well before the very top.
  const { atTop: nearHistoryTop } = useHistoryPagination({
    scrollRef,
    itemCount: messages.length,
    loadEarlier,
    loading: loadingEarlier,
    reachedStart,
    sessionKey: scrollKey,
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setNearBottom(dist < 100);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [setNearBottom]);
  // New messages: stick to bottom only if the user was already there.
  useEffect(() => {
    if (pendingMessageId) return;
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pendingMessageId]);

  useEffect(() => {
    if (!pendingMessageId) return;
    const exists = messages.some((m) => m.id === pendingMessageId);
    if (!exists) return; // message not loaded yet, try again on next batch
    const el = document.querySelector(`[data-msg-id="${pendingMessageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-1', 'ring-lc-green');
    setTimeout(() => el.classList.remove('ring-1', 'ring-lc-green'), 1800);
    // Strip ?m= so a refresh doesn't re-trigger.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('m');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    onConsumePendingMessageId();
  }, [pendingMessageId, messages, onConsumePendingMessageId]);

  return { scrollRef, loadingEarlier, reachedStart, nearHistoryTop };
}
