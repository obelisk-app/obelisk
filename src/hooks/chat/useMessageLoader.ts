'use client';

import { useEffect, type MutableRefObject } from 'react';
import { useChatStore } from '@/store/chat';
import { useNotificationStore } from '@/store/notification';

type Args = {
  activeChannelId: string | null;
  activePostId: string | null;
  pendingHighlightRef: MutableRefObject<{ channelId: string; messageId: string } | null>;
  setMessages: ReturnType<typeof useChatStore.getState>['setMessages'];
  setLoadingMessages: ReturnType<typeof useChatStore.getState>['setLoadingMessages'];
  setMessageCursor: ReturnType<typeof useChatStore.getState>['setMessageCursor'];
};

/**
 * Two effects that both key on the active channel/post:
 *   - Clear the post's unread counter (and persist lastReadAt) when the user
 *     opens a forum post.
 *   - Fetch the message page for the active channel/post, honoring the
 *     `pendingHighlightRef` so a refresh-restore can scroll to the right
 *     message even if it's off the latest page (falls back to `?around=`).
 */
export function useMessageLoader({
  activeChannelId,
  activePostId,
  pendingHighlightRef,
  setMessages,
  setLoadingMessages,
  setMessageCursor,
}: Args) {
  // When the user enters a post chat, clear its unread counter locally and
  // persist lastReadAt to the server.
  useEffect(() => {
    if (!activePostId) return;
    useNotificationStore.getState().clearPostUnread(activePostId);
    (async () => {
      try {
        await fetch(`/api/forum/posts/${encodeURIComponent(activePostId)}/read`, {
          method: 'POST',
        });
      } catch { /* ignore */ }
    })();
  }, [activePostId]);

  // Fetch messages when channel changes
  useEffect(() => {
    if (!activeChannelId) return;

    const fetchMessages = async () => {
      try {
        const pending = pendingHighlightRef.current;
        const hasPendingForThisChannel =
          !!pending && pending.channelId === activeChannelId;

        const postParam = activePostId ? `?postId=${encodeURIComponent(activePostId)}` : '';
        const res = await fetch(`/api/channels/${activeChannelId}/messages${postParam}`);
        if (!res.ok) return;
        const data = await res.json();

        // Refresh-restore: if a highlight was queued for this channel (from
        // URL ?m= or per-channel localStorage), and the target message is in
        // the freshly-loaded batch, kick MessageArea into scrolling there.
        // If the target isn't in the latest page (old deep-link from "Copiar
        // enlace"), re-fetch with ?around= so the message lands centered.
        if (hasPendingForThisChannel) {
          const inLatest = data.messages.some(
            (m: any) => m.id === pending!.messageId,
          );
          if (!inLatest) {
            try {
              const aroundRes = await fetch(
                `/api/channels/${activeChannelId}/messages?around=${encodeURIComponent(
                  pending!.messageId,
                )}`,
              );
              if (aroundRes.ok) {
                const aroundData = await aroundRes.json();
                setMessages(aroundData.messages);
                setMessageCursor(
                  aroundData.nextCursor ?? null,
                  !!aroundData.nextCursor,
                );
                pendingHighlightRef.current = null;
                if (
                  aroundData.messages.some(
                    (m: any) => m.id === pending!.messageId,
                  )
                ) {
                  useChatStore.setState({
                    highlightedMessageId: pending!.messageId,
                  });
                }
                return;
              }
            } catch {
              // fall through — just render the latest page below.
            }
          }
        }

        setMessages(data.messages);
        setMessageCursor(data.nextCursor ?? null, !!data.nextCursor);

        if (hasPendingForThisChannel) {
          pendingHighlightRef.current = null;
          if (data.messages.some((m: any) => m.id === pending!.messageId)) {
            useChatStore.setState({ highlightedMessageId: pending!.messageId });
          }
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
        setLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [activeChannelId, activePostId, setMessages, setLoadingMessages, setMessageCursor]);
}
