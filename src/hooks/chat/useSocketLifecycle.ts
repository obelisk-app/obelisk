'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth';
import { useChatStore, type Message } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { useVoiceStore } from '@/store/voice';
import { useNotificationStore } from '@/store/notification';
import { useNotificationPrefsStore } from '@/store/notificationPrefs';
import { useToastStore } from '@/store/toast';
import { playMentionSound } from '@/lib/mentionSound';
import { NotificationCenter } from '@/lib/notifications';
import { shortNpub } from '@/lib/mentions';
import {
  isUserWatchingChannel,
  handleIncomingChannelMessage,
} from '@/lib/read-gates';
import { clearBadge } from '@/lib/favicon-badge';
import { ServerToClient, ClientToServer } from '@/lib/socket-events';

type Router = ReturnType<typeof useRouter>;

type Args = {
  sessionChecked: boolean;
  profilePubkey: string | undefined;
  profilePubkeyRef: MutableRefObject<string | null>;
  activeChannelIdRef: MutableRefObject<string | null>;
  profileCache: Map<string, { name?: string; picture?: string }>;
  addMessage: ReturnType<typeof useChatStore.getState>['addMessage'];
  removeMessage: ReturnType<typeof useChatStore.getState>['removeMessage'];
  updateMessage: ReturnType<typeof useChatStore.getState>['updateMessage'];
  updateReactions: ReturnType<typeof useChatStore.getState>['updateReactions'];
  setMemberList: ReturnType<typeof useChatStore.getState>['setMemberList'];
  logout: ReturnType<typeof useAuthStore.getState>['logout'];
  router: Router;
  setMessageError: (msg: string | null) => void;
};

/**
 * Opens the Socket.io connection for the authed session, wires every
 * subscription the chat page relies on (presence, messages, reactions,
 * unread/read sync, DM inbox, games, voice, notifications), and tears it all
 * down on logout or account switch.
 *
 * The monolith is preserved as a single effect on purpose — subscription
 * order matters (e.g. `connect` must be bound before the socket opens to
 * guarantee the presence-sync fires), and reconnect handling expects every
 * handler to be re-bound atomically.
 */
export function useSocketLifecycle({
  sessionChecked,
  profilePubkey,
  profilePubkeyRef,
  activeChannelIdRef,
  profileCache,
  addMessage,
  removeMessage,
  updateMessage,
  updateReactions,
  setMemberList,
  logout,
  router,
  setMessageError,
}: Args) {
  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);

  // Connect Socket.io
  useEffect(() => {
    if (!sessionChecked) return;

    // If a stale socket from a prior account is still hanging on (e.g.
    // rapid re-render before React cleanup ran), force-disconnect it first
    // so its queued events can't land in the new session.
    const prevSocket = socketRef.current;
    if (prevSocket) {
      try { prevSocket.disconnect(); } catch { /* ignore */ }
      socketRef.current = null;
    }

    const socket = io();

    // Snapshot the pubkey this socket was opened for so notification /
    // unread / read handlers can ignore events that land after an in-tab
    // account switch (the effect tears down on pubkey change, but an
    // event already in the queue could still fire on the old socket).
    const expectedPubkey = useAuthStore.getState().profile?.pubkey ?? null;
    const isStaleSession = () =>
      !!expectedPubkey && useAuthStore.getState().profile?.pubkey !== expectedPubkey;

    // Defense-in-depth: every user-targeted emit now carries `recipientPubkey`.
    // If it's present and doesn't match the current session, drop the event —
    // stops cross-user contamination from any socket that somehow received a
    // payload meant for someone else.
    const isForOtherUser = (data: { recipientPubkey?: string } | undefined) => {
      const me = useAuthStore.getState().profile?.pubkey ?? null;
      return !!data?.recipientPubkey && !!me && data.recipientPubkey !== me;
    };

    socket.on('connect', () => {
      console.log('Socket connected');
      // Snapshot currently-online pubkeys
      socket.emit(ClientToServer.PresenceSync, (pubkeys: string[]) => {
        useChatStore.getState().setOnlinePubkeys(pubkeys);
      });
      // Reconnect may have missed events; let the unread-fetch effect
      // reconcile from `/api/unread` as the source of truth.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('obelisk:unread-refresh'));
      }
    });

    socket.on(ServerToClient.PresenceUpdate, ({ pubkey: pk, online }: { pubkey: string; online: boolean }) => {
      useChatStore.getState().setPresence(pk, online);
    });

    socket.on(ServerToClient.BotUpdated, (update: { serverId: string; id: string; type: string; displayName?: string; avatarUrl?: string; lastValue?: string }) => {
      const state = useChatStore.getState();
      if (state.activeServerId && update.serverId !== state.activeServerId) return;
      state.applyBotUpdate(update);
    });

    socket.on(ServerToClient.NewMessage, (message: Message) => {
      const activeCh = useChatStore.getState().activeChannelId;
      console.log(`[socket][new-message] recv ch=${message.channelId} active=${activeCh} id=${message.id}`);
      if (isStaleSession()) {
        console.log('[socket][new-message] drop: stale session');
        return;
      }
      // Seed profileCache from the embedded author so messages from
      // never-seen pubkeys render immediately with name + avatar.
      if (message.author && !profileCache.has(message.authorPubkey)) {
        const name = message.author.nickname || message.author.displayName || undefined;
        const picture = message.author.picture || undefined;
        if (name || picture) {
          profileCache.set(message.authorPubkey, { name, picture });
          // Also append to the member list if this pubkey isn't there yet,
          // so the sidebar stays in sync without a page refresh.
          const current = useChatStore.getState().memberList;
          if (!current.some((m) => m.pubkey === message.authorPubkey)) {
            setMemberList([
              ...current,
              {
                pubkey: message.authorPubkey,
                displayName: name || shortNpub(message.authorPubkey),
                picture,
              },
            ]);
          }
        }
      }
      {
        const state = useChatStore.getState();
        const inActiveChannel = message.channelId === state.activeChannelId;
        if (inActiveChannel) {
          const channel = state.categories
            .flatMap((c) => c.channels)
            .concat(state.pinnedChannels)
            .find((c) => c.id === message.channelId);
          const isForum = channel?.type === 'forum';
          const ap = state.activePostId;
          const anyMsg = message as unknown as { title?: string | null };
          // When viewing a forum post, accept any message that belongs to the
          // post's thread — either a direct reply (replyToId === postId) or a
          // nested reply whose immediate parent is already in the local
          // messages list (i.e. we've seen it, so it's in-thread by
          // definition). Keeps reply-to-reply visible without needing to
          // re-fetch the whole tree on every socket event.
          const inThread = ap
            ? message.replyToId === ap ||
              (message.replyToId != null &&
                state.messages.some((m) => m.id === message.replyToId))
            : false;
          const accept = isForum
            ? ap
              ? inThread
              : !!anyMsg.title && !message.replyToId
            : true;
          if (accept) addMessage(message);
        } else {
          addMessage(message);
        }
      }

      // Badge channels the user isn't actively watching — backgrounded tab,
      // blurred window, scrolled up, or a different channel open. The
      // server's `unread-update` loop deliberately skips anyone in the
      // channel room, so this client-side path is the only one that covers
      // "in-room but not watching". See `handleIncomingChannelMessage`.
      const { incremented, hasMention } = handleIncomingChannelMessage(
        message,
        profilePubkeyRef.current,
      );
      if (incremented && hasMention) {
        // Only mentions belong in the inbox. The sidebar unread dot already
        // signals "new messages in some channel"; mirroring every message
        // into the inbox produces ghost notifications the user can't dismiss
        // by reading individually. The `notification` handler still covers
        // the rich mention-specific path with sender + preview.
        useNotificationStore.getState().pushInboxEvent({
          type: 'mention',
          channelId: message.channelId,
          messageId: message.id,
          senderPubkey: message.authorPubkey,
          preview: message.content.slice(0, 140),
          createdAt: typeof message.createdAt === 'string' ? message.createdAt : new Date(message.createdAt as any).toISOString(),
        });
      }
    });

    socket.on(ServerToClient.MessageDeleted, ({ messageId }: { messageId: string }) => {
      removeMessage(messageId);
    });

    socket.on(ServerToClient.MessageEdited, (message: Message) => {
      updateMessage(message.id, message.content, message.editedAt!);
    });

    socket.on(ServerToClient.ReactionUpdated, ({ messageId, reactions }: { messageId: string; reactions: any[] }) => {
      updateReactions(messageId, reactions);
    });

    socket.on(ServerToClient.MessagePinned, (message: Message) => {
      useChatStore.getState().updatePinState(
        message.id,
        message.pinnedAt ?? null,
        message.pinnedByPubkey ?? null,
      );
    });

    socket.on(ServerToClient.ForceDisconnect, ({ reason }: { reason: string }) => {
      alert(reason);
      // Reset title + favicon explicitly in case the layout switch tears
      // down `useFaviconBadge` before its cleanup can run.
      document.title = 'Obelisk';
      void clearBadge();
      logout();
      router.push('/');
    });

    socket.on(ServerToClient.UserTyping, ({ pubkey: typerPubkey, channelId: ch }: { pubkey: string; channelId: string }) => {
      if (ch === activeChannelIdRef.current && typerPubkey !== profilePubkey) {
        useChatStore.getState().setTyping(typerPubkey);
      }
    });

    socket.on(ServerToClient.InvoicePaid, (data: { paymentHash: string; payerPubkey: string; paidAt: string }) => {
      useChatStore.getState().markInvoicePaid({
        paymentHash: data.paymentHash,
        payerPubkey: data.payerPubkey,
        paidAt: typeof data.paidAt === 'string' ? data.paidAt : new Date(data.paidAt).toISOString(),
      });
    });

    socket.on(ServerToClient.MessageError, ({ error }: { error: string }) => {
      setMessageError(error);
      setTimeout(() => setMessageError(null), 5000);
    });

    socket.on(ServerToClient.VoiceStateUpdate, ({ channelId, participants }: { channelId: string; participants: any[] }) => {
      const voiceStore = useVoiceStore.getState();
      // Update if we're in this voice channel OR currently viewing it
      if (voiceStore.currentVoiceChannelId === channelId || activeChannelIdRef.current === channelId) {
        voiceStore.setParticipants(participants);
      }
    });

    // Track remote video/screen state in the store
    socket.on(ServerToClient.VoiceVideoStart, ({ pubkey: pk }: { pubkey: string }) => {
      useVoiceStore.getState().addRemoteVideo(pk);
    });
    socket.on(ServerToClient.VoiceVideoStop, ({ pubkey: pk }: { pubkey: string }) => {
      useVoiceStore.getState().removeRemoteVideo(pk);
    });
    socket.on(ServerToClient.VoiceScreenStart, ({ pubkey: pk }: { pubkey: string }) => {
      useVoiceStore.getState().addRemoteScreen(pk);
    });
    socket.on(ServerToClient.VoiceScreenStop, ({ pubkey: pk }: { pubkey: string }) => {
      useVoiceStore.getState().removeRemoteScreen(pk);
    });

    // Notification events.
    //
    // Design note: this handler is a pure side-effect. It surfaces the
    // mention flag + browser notification, but NEVER increments the unread
    // counter. Count increments come from exactly one of two places:
    //   - `new-message` (this client is in the channel room) — handled above
    //   - `unread-update` (this client is NOT in the channel room) — below
    // Doing it this way means a single server-side event becomes exactly one
    // client-side count bump, regardless of whether the user is mentioned.
    socket.on(ServerToClient.Notification, (data: { recipientPubkey?: string; type: string; channelId?: string; postId?: string; serverId?: string; messageId?: string; senderPubkey: string; preview?: string; createdAt?: string }) => {
      if (isStaleSession()) return;
      if (isForOtherUser(data)) return;
      const notifStore = useNotificationStore.getState();
      const isMentionLike = data.type === 'mention' || data.type === 'reply' || data.type === 'everyone';
      const pushToInbox = () => notifStore.pushInboxEvent({
        type: (data.type as any) ?? 'mention',
        channelId: data.channelId,
        serverId: data.serverId,
        messageId: data.messageId,
        postId: data.postId,
        senderPubkey: data.senderPubkey,
        preview: data.preview,
        createdAt: data.createdAt ?? new Date().toISOString(),
      });
      if (isMentionLike && data.channelId) {
        pushToInbox();
        const watchingChannel = isUserWatchingChannel(data.channelId);
        const watchingPost = data.postId
          ? useChatStore.getState().activePostId === data.postId
          : false;
        if (!(watchingChannel && (!data.postId || watchingPost))) {
          notifStore.setChannelMention(data.channelId, true);
          if (data.postId) {
            notifStore.setPostMention(data.postId, true);
          }
        }
      } else if (data.type === 'dm') {
        notifStore.setDMUnread(data.senderPubkey, (notifStore.dmUnreads[data.senderPubkey] || 0) + 1);
        pushToInbox();
      }
      NotificationCenter.notify(data as any, {
        viewerPubkey: profilePubkeyRef.current ?? '',
        prefs: useNotificationPrefsStore.getState().prefs,
        channelNameById: (id: string) => {
          const ch = (useChatStore.getState().channels || []).find((c: any) => c.id === id);
          return ch?.name ?? id;
        },
        resolveSuppressionContext: (payload) => {
          return {
            viewerPubkey: profilePubkeyRef.current ?? '',
            documentVisible: typeof document !== 'undefined' && document.visibilityState === 'visible',
            windowFocused: typeof document !== 'undefined' && document.hasFocus(),
            activeChannelId: activeChannelIdRef.current ?? null,
            activePostId: useChatStore.getState().activePostId ?? null,
            scrolledToBottom: false, // not tracked in store; mild over-notification accepted for v1
            resolvedPref: useNotificationPrefsStore.getState().resolve(
              Array.isArray(payload.scopeChain) && payload.scopeChain.length > 0
                ? payload.scopeChain
                : payload.channelId
                  ? [{ type: 'channel' as const, id: payload.channelId }]
                  : [],
            ),
          };
        },
        playSound: playMentionSound,
      });
    });

    // Cross-device / other-tab read sync. Fired by server.ts after it
    // persists a `mark-read` or `dm-read` from any of this user's other
    // sockets. Clears the local unread state without another DB round-trip.
    socket.on(ServerToClient.ReadUpdate, (data: { recipientPubkey?: string; channelId: string }) => {
      if (isStaleSession() || isForOtherUser(data)) return;
      useNotificationStore.getState().clearChannelUnread(data.channelId);
    });

    // Sibling tab / device opened the channel and cleared the mention dot.
    // Only clears the mention flag — count stays until a full `read-update`.
    socket.on(ServerToClient.MentionReadUpdate, (data: { recipientPubkey?: string; channelId: string }) => {
      if (isStaleSession() || isForOtherUser(data)) return;
      useNotificationStore.getState().clearChannelMention(data.channelId);
    });

    socket.on(ServerToClient.DMReadUpdate, (data: { recipientPubkey?: string; pubkey: string }) => {
      if (isStaleSession() || isForOtherUser(data)) return;
      const otherPubkey = data.pubkey;
      useNotificationStore.getState().clearDMUnread(otherPubkey);
      useDMStore.getState().updateThread(otherPubkey, { unreadCount: 0 });
    });

    socket.on(ServerToClient.UnreadUpdate, (data: { recipientPubkey?: string; channelId: string; serverId: string; hasMention: boolean; preview?: string }) => {
      if (isStaleSession() || isForOtherUser(data)) return;
      const notifStore = useNotificationStore.getState();
      notifStore.incrementChannelUnread(data.channelId, data.hasMention);
      if (data.serverId) {
        notifStore.setChannelServerMap({
          ...notifStore.channelServerMap,
          [data.channelId]: data.serverId,
        });
      }
      // Non-mention pings only bump the sidebar unread; they must NOT enter
      // the inbox. Otherwise every message in every channel produces a ghost
      // notification the user can't dismiss without opening the channel
      // itself, defeating the inbox's purpose as a mention/DM-only feed.
    });

    socket.on(ServerToClient.PostUnread, (data: { recipientPubkey?: string; postId: string; messageId: string; authorPubkey: string; hasMention?: boolean }) => {
      if (isStaleSession() || isForOtherUser(data)) return;
      if (data.postId === useChatStore.getState().activePostId) return;
      useNotificationStore.getState().incrementPostUnread(data.postId, data.hasMention);
    });

    // Fired when the server auto-subscribes the viewer to a forum post
    // (e.g. because they were @-mentioned in it). Thread the post meta
    // straight into followedPostIds/Meta so the thread row appears under
    // its forum channel in the sidebar without a refetch.
    socket.on(ServerToClient.PostSubscribed, (data: { postId: string; title: string; channelId: string; channelName: string; serverId: string }) => {
      const state = useChatStore.getState();
      const followedPostIds = Array.isArray(state.followedPostIds) ? state.followedPostIds : [];
      const followedPostMeta = state.followedPostMeta && typeof state.followedPostMeta === 'object' ? state.followedPostMeta : {};
      if (followedPostIds.includes(data.postId)) return;
      useChatStore.setState({
        followedPostIds: [...followedPostIds, data.postId],
        followedPostMeta: {
          ...followedPostMeta,
          [data.postId]: {
            id: data.postId,
            title: data.title,
            channelId: data.channelId,
            channelName: data.channelName,
            serverId: data.serverId,
          },
        },
        // A fresh mention is a strong enough signal to clear an earlier
        // explicit-unfollow suppression so the thread re-appears.
        suppressedAutoFollowPostIds: state.suppressedAutoFollowPostIds.filter(
          (id) => id !== data.postId,
        ),
      });
    });

    // ── Games / Activities ──
    const onGameEvent = (g: any) => {
      if (!g?.id) return;
      import('@/store/games').then(({ useGamesStore }) => {
        useGamesStore.getState().upsertGame(g);
      });
    };
    socket.on(ServerToClient.GameCreated, onGameEvent);
    socket.on(ServerToClient.GameUpdated, onGameEvent);
    socket.on(ServerToClient.GameFinished, onGameEvent);
    socket.on(ServerToClient.GameTurn, (data: { gameId: string; currentTurn: string; turnDeadline: string; type: string }) => {
      if (data.currentTurn !== profilePubkey) return;
      // Notify the player regardless of which channel they're in.
      try {
        const title = '¡Tu turno!';
        const body = `Es tu turno en ${data.type === 'tic-tac-toe' ? 'Tic-Tac-Toe' : data.type}`;
        useToastStore.getState().pushToast({ title, body });
      } catch {}
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
    });
    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnect:', reason);
    });
    socket.io.on('reconnect_attempt', (n) => {
      console.log('[socket] reconnect_attempt', n);
    });

    socketRef.current = socket;
    setSocketInstance(socket);

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
      useChatStore.getState().setOnlinePubkeys([]);
    };
    // `profile?.pubkey` is in the deps so switching accounts in-tab
    // disconnects the old socket and opens a fresh one that re-handshakes
    // with the new session cookie. Without it the previous user's presence
    // room + room subscriptions would leak into the new session.
  }, [sessionChecked, profilePubkey, addMessage, removeMessage, updateMessage, updateReactions, logout, router]);

  return { socketRef, socketInstance };
}
