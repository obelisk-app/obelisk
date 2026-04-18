'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useChatStore } from '@/store/chat';
import { useDMStore, markThreadRead } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';
import { isUserWatchingChannel, isUserWatchingDM } from '@/lib/read-gates';
import { postClearChannel, postClearDM } from '@/lib/notification-broadcast';

/**
 * Centralized mark-as-read gating.
 *
 * A channel / DM is only marked read when ALL of these are true:
 *   - the tab is visible (`document.visibilityState === 'visible'`)
 *   - the window has focus (`document.hasFocus()`)
 *   - there is an active channel or DM
 *   - the message list is scrolled within ~150px of the bottom
 *     (tracked by `useChatStore.isNearBottom`)
 *
 * When all gates pass, we debounce ~250ms (so rapid scroll/visibility
 * flapping doesn't hammer the DB) and then emit `mark-read` via socket
 * (channels) or POST `/api/dm/:pubkey/read` (DMs), and clear the local
 * unread counter.
 *
 * If a new message arrives while any gate is false, the unread count
 * stays — that's the whole point of this rewrite. The previous code
 * marked channels read on navigation alone, which meant "clicking
 * through channels clears unreads you never saw".
 */
export function useReadTracker(socket: Socket | null) {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const userSelectedChannelId = useChatStore((s) => s.userSelectedChannelId);
  const isNearBottom = useChatStore((s) => s.isNearBottom);
  const messagesLength = useChatStore((s) => s.messages.length);
  const lastMessageId = useChatStore((s) =>
    s.messages.length > 0 ? s.messages[s.messages.length - 1].id : null
  );

  const activeDMPubkey = useDMStore((s) => s.activeDMPubkey);
  const dmMessagesLength = useDMStore((s) => s.messages.length);

  // Visibility + focus tracked as state so effects re-run on change.
  // SSR guards: default to true so the first client render doesn't
  // suppress marking read before the listeners attach.
  const [isVisible, setIsVisible] = useState(true);
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setIsVisible(document.visibilityState === 'visible');
    setIsFocused(document.hasFocus());

    const onVisibility = () => setIsVisible(document.visibilityState === 'visible');
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Mention-clear effect — separate from the count-clear below.
  //
  // Rationale: the full mark-read path requires the viewer to be scrolled
  // within ~150px of the bottom. That's correct for the unread *count*
  // (we shouldn't silently eat messages the user hasn't actually reached),
  // but it's wrong for the *mention dot*. If someone pings you and you
  // open the channel to scroll up and read context, the ping has clearly
  // been seen — keeping the mention badge lit until you also scroll to
  // the bottom was the biggest source of "mentions never clear" reports.
  //
  // This effect fires on channel activation and clears the mention flag
  // locally + advances the server-side mention cursor, regardless of
  // scroll position. The count is still gated by the effect below.
  useEffect(() => {
    if (!activeChannelId) return;
    if (!isVisible || !isFocused) return;
    // Only clear mentions on channels the user actively navigated to. Auto-
    // landing (first channel of default server on login, server-switch
    // landing) sets activeChannelId without user intent — clearing mentions
    // in that case would silently mark reads the user never made.
    if (userSelectedChannelId !== activeChannelId) return;

    const notif = useNotificationStore.getState();
    if (!notif.channelMentions[activeChannelId]) return;

    const channelId = activeChannelId;
    const timer = setTimeout(() => {
      if (typeof document !== 'undefined') {
        if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      }
      const chat = useChatStore.getState();
      if (chat.activeChannelId !== channelId) return;
      if (chat.userSelectedChannelId !== channelId) return;

      if (socket) socket.emit('mark-mention-read', { channelId });
      useNotificationStore.getState().clearChannelMention(channelId);
    }, 250);

    return () => clearTimeout(timer);
  }, [activeChannelId, userSelectedChannelId, isVisible, isFocused, socket]);

  // Channel mark-read effect
  useEffect(() => {
    if (!activeChannelId) return;
    if (!isVisible || !isFocused || !isNearBottom) return;
    // Auto-landing (default server, landing channel, server switch) must
    // never silently mark a channel read — that's how mentions in servers
    // the user never actually opened end up cleared. Gate on explicit user
    // navigation.
    if (userSelectedChannelId !== activeChannelId) return;

    const notif = useNotificationStore.getState();
    const currentUnread = notif.channelUnreads[activeChannelId] || 0;
    const hasMention = notif.channelMentions[activeChannelId];
    if (currentUnread === 0 && !hasMention) return;

    const timer = setTimeout(() => {
      // Re-check gates at flush time in case the user navigated away.
      if (!isUserWatchingChannel(activeChannelId)) return;
      if (useChatStore.getState().userSelectedChannelId !== activeChannelId) return;

      if (socket) {
        socket.emit('mark-read', {
          channelId: activeChannelId,
          lastMessageId: lastMessageId ?? undefined,
        });
      }
      useNotificationStore.getState().clearChannelUnread(activeChannelId);
      postClearChannel(activeChannelId);
    }, 250);

    return () => clearTimeout(timer);
  }, [activeChannelId, userSelectedChannelId, isNearBottom, isVisible, isFocused, messagesLength, lastMessageId, socket]);

  // DM mark-read effect — device-local only. DM read state is not synced
  // to the server; see `markThreadRead` in `@/store/dm`.
  useEffect(() => {
    if (!activeDMPubkey) return;
    if (!isVisible || !isFocused) return;

    const notif = useNotificationStore.getState();
    const currentUnread = notif.dmUnreads[activeDMPubkey] || 0;
    const storeUnread = useDMStore.getState().threads.find(t => t.pubkey === activeDMPubkey)?.unreadCount || 0;
    if (currentUnread === 0 && storeUnread === 0) return;

    const timer = setTimeout(() => {
      if (!isUserWatchingDM(activeDMPubkey)) return;

      void markThreadRead(activeDMPubkey);
      useNotificationStore.getState().clearDMUnread(activeDMPubkey);
      postClearDM(activeDMPubkey);
    }, 250);

    return () => clearTimeout(timer);
  }, [activeDMPubkey, dmMessagesLength, isVisible, isFocused]);
}
