'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nostrActions, useLoadEarlier, type JsMessage } from '@/services/nostr-bridge';
import { useReadStateStore } from '@/store/read-state';
import { useChatStore } from '@/store/chat';
import { channelScrollPositionKey } from '@/utils/chat/timeline/channel-scroll-position';
import { channelInitialAnchorFromCursor } from '@/utils/chat/timeline/channel-scroll-anchor';
import { useChannelScrollPosition } from '@/hooks/chat/timeline/useChannelScrollPosition';
import { useHistoryPagination } from '@/hooks/chat/timeline/useHistoryPagination';

/**
 * Focused fetch of kind 39000 for this groupId, guarantees the channel
 * metadata is fetched even if the global stream missed it. The mobile
 * chat header reads `group.name` for the title; without this fetch the
 * user can stare at the channel id slice forever on a slow / silently-
 * filtering relay.
 */
export function useEnsureGroupMetadata(groupId: string, groupKnown: boolean) {
  useEffect(() => {
    if (!groupId) return;
    if (groupKnown) return;
    void nostrActions.fetchGroupMetadata(groupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
}

/**
 * The message being replied to. Reset when the channel changes (in the same
 * render), and set by "Reply" taps from the message-actions sheet, which is
 * mounted at the PhoneShell level and so asks through a window event, the
 * same indirection the quick-react buttons use.
 */
export function useReplyTarget(groupId: string, messages: ReadonlyArray<JsMessage>) {
  const [replyingTo, setReplyingTo] = useState<JsMessage | null>(null);
  const [replyChannel, setReplyChannel] = useState(groupId);
  if (replyChannel !== groupId) {
    setReplyChannel(groupId);
    setReplyingTo(null);
  }
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ msgId: string }>;
      const target = messages.find((m) => m.id === ev.detail.msgId);
      if (target) setReplyingTo(target);
    };
    window.addEventListener('obelisk-mobile:reply', handler);
    return () => window.removeEventListener('obelisk-mobile:reply', handler);
  }, [messages]);
  return { replyingTo, setReplyingTo };
}

/**
 * The phone channel's scroll viewport: where it opens (first unread, not
 * the saved offset), the search-jump flash, stick-to-bottom on new
 * messages, and top-of-list pagination. Restore and pagination are the
 * shared `src/hooks/chat/` hooks the desktop shell uses too.
 */
export function usePhoneChannelViewport({ groupId, relay, myPubkey, messages }: {
  groupId: string;
  relay: string;
  myPubkey: string | null;
  messages: ReadonlyArray<JsMessage>;
}) {
  const readCursorMs = useReadStateStore((s) => s.groupCursors[groupId]);
  const messagesRef = useRef<HTMLDivElement>(null);
  const scrollKey = useMemo(() => channelScrollPositionKey(relay, groupId), [relay, groupId]);
  const initialAnchor = useMemo(
    () => channelInitialAnchorFromCursor(messages, readCursorMs, myPubkey),
    [messages, myPubkey, readCursorMs],
  );
  const initialAnchorMessageId = initialAnchor.kind === 'message' ? initialAnchor.messageId : null;
  const getInitialAnchorElement = useCallback(() => {
    if (!initialAnchorMessageId) return null;
    const scroller = messagesRef.current;
    if (!scroller) return null;
    const target = document.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(initialAnchorMessageId)}"]`);
    if (!target || !scroller.contains(target)) return null;
    return target;
  }, [initialAnchorMessageId]);

  useChannelScrollPosition({
    scrollKey,
    scrollRef: messagesRef,
    itemCount: messages.length,
    initialAnchorKey: initialAnchorMessageId,
    getInitialAnchorElement,
    ignoreSavedOnInitialRestore: true,
    nearBottomPx: 200,
    onNearBottomChange: (near) => {
      const cur = useChatStore.getState().isNearBottom;
      if (cur !== near) useChatStore.setState({ isNearBottom: near });
    },
  });

  // A search result asked to jump here. The message may not be loaded yet,
  // so this re-runs as batches arrive and only consumes the request once it
  // actually scrolled, same contract as the desktop `pendingMessageId`.
  const pendingJump = useChatStore((s) => s.pendingJump);
  useEffect(() => {
    if (!pendingJump || pendingJump.groupId !== groupId) return;
    const target = pendingJump.messageId;
    // No message id → the request was "just open this channel", and
    // navigating here has already satisfied it.
    if (!target) { useChatStore.getState().consumeJump(); return; }
    if (!messages.some((m) => m.id === target)) return;
    const el = messagesRef.current?.querySelector(`[data-msg-id="${CSS.escape(target)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('msg-flash');
    setTimeout(() => el.classList.remove('msg-flash'), 1800);
    useChatStore.getState().consumeJump();
  }, [pendingJump, groupId, messages]);

  // Auto-scroll to bottom when new messages arrive (only if already near).
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    // Don't yank the view to the bottom while we're trying to land on a
    // searched-for message further up.
    if (pendingJump && pendingJump.groupId === groupId) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (isNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Top-of-list pagination. Live REQ caps at the background limit; older
  // history is paged in as the user approaches the top, with the viewport
  // anchored across the prepend, see useHistoryPagination.
  const { loadEarlier, loading: loadingEarlier, reachedStart } = useLoadEarlier(groupId);
  const { atTop: nearHistoryTop } = useHistoryPagination({
    scrollRef: messagesRef,
    itemCount: messages.length,
    loadEarlier,
    loading: loadingEarlier,
    reachedStart,
    sessionKey: scrollKey,
  });

  return { messagesRef, loadingEarlier, reachedStart, nearHistoryTop };
}
