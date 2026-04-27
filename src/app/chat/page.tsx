'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useChatStore, Message, MemberInfo } from '@/store/chat';
import ServerBar from '@/components/chat/ServerBar';
import { UserPanel } from '@/components/chat/ChannelSidebar';
import ChannelSidebar from '@/components/chat/ChannelSidebar';
import MessageArea from '@/components/chat/MessageArea';
import ProfilePopover from '@/components/chat/ProfilePopover';
import PinnedMessagesPanel from '@/components/chat/PinnedMessagesPanel';
import MessageInput from '@/components/chat/MessageInput';
import ForumView from '@/components/chat/ForumView';
import PostChatHeader from '@/components/chat/PostChatHeader';
import ChannelTopicModal from '@/components/chat/ChannelTopicModal';
import ChannelEmoji from '@/components/chat/ChannelEmoji';
import SearchBar from '@/components/chat/SearchBar';
import SearchResultsPane from '@/components/chat/SearchResultsPane';
import { useSearchStore } from '@/store/search';
import DMList from '@/components/dm/DMList';
import DMChat from '@/components/dm/DMChat';
import NewDMModal from '@/components/dm/NewDMModal';
import ProtocolPrompt from '@/components/dm/ProtocolPrompt';
import { DMSessionProvider } from '@/components/dm/DMSessionProvider';
import VoiceChannel from '@/components/chat/VoiceChannel';
import { useDMStore } from '@/store/dm';
import { useVoiceStore } from '@/store/voice';
import GameDock from '@/components/games/GameDock';
import ActivitiesPanel from '@/components/games/ActivitiesPanel';
import GamePickerModal from '@/components/games/GamePickerModal';
import SettingsModal from '@/components/settings/SettingsModal';
import GameFullscreenView from '@/components/games/GameFullscreenView';
import { useGamesStore } from '@/store/games';
import { WebSocketVoiceClient } from '@/lib/voice';
import { LiveKitVoiceClient, fetchVoiceToken } from '@/lib/livekit-voice';
import { setActiveVoiceClient } from '@/lib/voice-active-client';
import { DM_FEATURE_ENABLED } from '@/lib/feature-flags';
import { shortNpub, parseMentions } from '@/lib/mentions';
import MemberList from '@/components/chat/MemberList';
import LoginModal from '@/components/LoginModal';
import ShootingStars from '@/components/ShootingStars';
import { useNotificationStore } from '@/store/notification';
import { NotifyMenu } from '@/components/notifications/NotifyMenu';
import { useNotificationPrefsStore } from '@/store/notificationPrefs';
import { useReadTracker } from '@/hooks/useReadTracker';
import { useFaviconBadge } from '@/hooks/useFaviconBadge';
import { useTranslation } from '@/i18n/context';
import type { InboxEvent } from '@/store/notification';
import { pushErrorToast } from '@/store/toast';
import { SoftPromptBanner } from '@/components/notifications/SoftPromptBanner';
import { useSessionBootstrap } from '@/hooks/chat/useSessionBootstrap';
import { useSlugResolution, type InitialUrl } from '@/hooks/chat/useSlugResolution';
import { useServerAndChannelLoader } from '@/hooks/chat/useServerAndChannelLoader';
import { useServerMetadata } from '@/hooks/chat/useServerMetadata';
import { useUnreadRefresh } from '@/hooks/chat/useUnreadRefresh';
import { useDMLifecycle } from '@/hooks/chat/useDMLifecycle';
import { useSocketLifecycle } from '@/hooks/chat/useSocketLifecycle';
import { useZapReceipts } from '@/hooks/chat/useZapReceipts';
import { useRoomAndUrlSync } from '@/hooks/chat/useRoomAndUrlSync';
import { useBroadcastSync } from '@/hooks/chat/useBroadcastSync';
import { useMessageLoader } from '@/hooks/chat/useMessageLoader';
import { useVoiceChatPane } from '@/hooks/chat/useVoiceChatPane';

function formatInboxTime(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function renderInboxPreview(preview: string, members: MemberInfo[]): string {
  // Replace `nostr:npub1...` tokens with `@DisplayName` so inbox rows don't
  // surface raw bech32 keys to users.
  const segments = parseMentions(preview, members);
  return segments
    .map((s) => (s.type === 'mention' ? `@${s.displayName}` : s.text))
    .join('');
}

function InboxRow({
  evt,
  onActivate,
  typeLabel,
  senderName,
  members,
}: {
  evt: InboxEvent;
  onActivate: () => void;
  typeLabel: string;
  senderName: string | null;
  members: MemberInfo[];
}) {
  const cleanedPreview = evt.preview ? renderInboxPreview(evt.preview, members) : null;
  return (
    <button
      type="button"
      onClick={onActivate}
      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-lc-border/40 transition-colors border-b border-lc-border/40 last:border-b-0"
      data-testid="top-notifications-row"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-lc-green uppercase tracking-wide">{typeLabel}</span>
          {senderName && (
            <span className="text-xs font-medium text-lc-white truncate">{senderName}</span>
          )}
          <span className="text-[11px] text-lc-muted">{formatInboxTime(evt.createdAt)}</span>
        </div>
        {cleanedPreview && (
          <p className="mt-1 text-xs text-lc-muted line-clamp-2 break-words">{cleanedPreview}</p>
        )}
      </div>
      {!evt.read && <span className="w-2 h-2 rounded-full bg-lc-green mt-1.5 shrink-0" aria-hidden="true" />}
    </button>
  );
}

function navigateToInboxEvent(evt: InboxEvent): void {
  if (evt.type === 'dm' && evt.senderPubkey) {
    const dm = useDMStore.getState();
    dm.setDMMode(true);
    dm.setActiveDM(evt.senderPubkey);
    return;
  }
  if (evt.channelId) {
    const chat = useChatStore.getState();
    if (evt.serverId && chat.activeServerId !== evt.serverId) {
      chat.setActiveServer(evt.serverId);
    }
    chat.setActiveChannel(evt.channelId);
    if (evt.postId) chat.setActivePostId(evt.postId);
  }
}

function TypingIndicator({ profileCache }: { profileCache: Map<string, { name?: string; picture?: string }> }) {
  const { typingUsers, memberList } = useChatStore();
  const typingPubkeys = Object.keys(typingUsers);
  if (typingPubkeys.length === 0) return null;

  const names = typingPubkeys.map((pk) => {
    const cached = profileCache.get(pk)?.name;
    if (cached) return cached;
    const member = memberList.find((m) => m.pubkey === pk);
    if (member?.displayName) return member.displayName;
    return shortNpub(pk);
  });
  const text = names.length === 1
    ? `${names[0]} is typing...`
    : `${names.join(', ')} are typing...`;

  return (
    <div className="px-4 py-1 text-xs text-lc-muted">
      {text}
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const isConnected = useAuthStore((s) => s.isConnected);
  const profile = useAuthStore((s) => s.profile);
  const { logout, restoreSession } = useAuthStore();
  const inboxEvents = useNotificationStore((s) => s.inboxEvents);
  const unreadInboxCount = useNotificationStore((s) => s.unreadInboxCount);
  const isSearchOpen = useSearchStore((s) => s.isOpen);
  const searchQuery = useSearchStore((s) => s.query);
  const searchActiveFilters = useSearchStore((s) => s.activeFilters);
  const showSearchPane = isSearchOpen && (
    !!searchQuery.trim() ||
    Object.keys(searchActiveFilters).length > 0
  );
  const {
    servers,
    activeServerId,
    activeChannelId,
    activePostId,
    setActivePostId,
    pinnedChannels,
    categories,
    setServers,
    setActiveServer,
    setChannels,
    setActiveChannel,
    setMessages,
    addMessage,
    removeMessage,
    updateMessage,
    updateReactions,
    setLoadingMessages,
    setEditingMessage,
    setMessageCursor,
    memberList,
    setMemberList,
    setMyRole,
    setServerEmojis,
    setServerGifs,
  } = useChatStore();
  const voiceClientRef = useRef<WebSocketVoiceClient | LiveKitVoiceClient | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const profilePubkeyRef = useRef<string | null>(null);
  const [profileCache] = useState(() => new Map<string, { name?: string; picture?: string }>());

  // Location restoration on refresh: the user's last server/channel/message
  // are encoded into URL query params (?s=, ?c=, ?m=). On initial mount we
  // read them once and use them to override the "pick the first server /
  // first channel" defaults. `pendingHighlightRef` carries the target message
  // id across the async channel-fetch boundary so MessageArea can scroll to
  // it once the messages for the restored channel actually arrive.
  const initialUrlRef = useRef<InitialUrl | null>(null);
  if (initialUrlRef.current === null) {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      initialUrlRef.current = { s: sp.get('s'), c: sp.get('c'), m: sp.get('m'), p: sp.get('p') };
    } else {
      initialUrlRef.current = { s: null, c: null, m: null, p: null };
    }
  }
  // Capture `?p=<postId>` once so it can be passed to <ForumView> the first
  // time a forum channel mounts. We consume it rather than re-reading so a
  // back/forth navigation doesn't reopen the deep-linked post.
  const initialForumPostIdRef = useRef<string | null>(initialUrlRef.current?.p ?? null);
  const [initialForumPostId, setInitialForumPostId] = useState<string | null>(initialForumPostIdRef.current);
  useEffect(() => {
    if (initialForumPostId) {
      setActivePostId(initialForumPostId);
      const t = setTimeout(() => setInitialForumPostId(null), 0);
      return () => clearTimeout(t);
    }
  }, [initialForumPostId, setActivePostId]);

  const slugResolutionDone = useSlugResolution(initialUrlRef);
  const pendingHighlightRef = useRef<{ channelId: string; messageId: string } | null>(null);

  const {
    sessionChecked,
    sessionInvalid,
    ndkReady,
    setSessionChecked,
    setSessionInvalid,
    sessionCheckStartedRef,
  } = useSessionBootstrap(router);

  const [messageError, setMessageError] = useState<string | null>(null);
  const { isDMMode } = useDMStore();
  const [showNewDMModal, setShowNewDMModal] = useState(false);

  const { serversLoaded, hasDefaultServer } = useServerAndChannelLoader({
    sessionChecked,
    slugResolutionDone,
    activeServerId,
    setServers,
    setActiveServer,
    setChannels,
    setActiveChannel,
    setActivePostId,
    initialUrlRef,
    pendingHighlightRef,
    setInitialForumPostId,
  });

  // Fetch unread counts on mount, tab focus, and socket reconnect.
  useUnreadRefresh(sessionChecked);

  // Subscribe to NIP-57 kind 9735 zap receipts for the signed-in user.
  useZapReceipts(profile?.pubkey ?? null);

  // Add own profile to cache. Prefer the per-server nickname (tracked in
  // memberList as `displayName`) over the Nostr displayName so that messages
  // from the signed-in user render with their alias, matching what other
  // members see.
  const ownMember = useChatStore((s) =>
    profile ? s.memberList.find((m) => m.pubkey === profile.pubkey) : undefined
  );
  // Write synchronously during render so that the alias flows into this
  // render's child tree. An effect would mutate the Map *after* commit, and
  // since Map mutation doesn't trigger a re-render, stale names would linger
  // in MessageArea until some unrelated state change forced another render.
  if (profile) {
    profileCache.set(profile.pubkey, {
      name: ownMember?.displayName || profile.displayName || profile.name,
      picture: ownMember?.picture || profile.picture,
    });
    profilePubkeyRef.current = profile.pubkey;
  } else {
    profilePubkeyRef.current = null;
  }

  // `restoreSession` in the auth store already triggers the canonical
  // server-side profile sync via `/api/members/me/sync-nostr`. No client-side
  // PATCH is needed here — previously this component re-sent Zustand-cached
  // profile values (which could be stale) and caused write drift.
  const profileSynced = sessionChecked;

  useServerMetadata({
    profileSynced,
    sessionChecked,
    activeServerId,
    servers,
    profileCache,
    setMemberList,
    setMyRole,
    setServerEmojis,
    setServerGifs,
  });

  useDMLifecycle({
    isDMMode,
    ndkReady,
    profilePubkey: profile?.pubkey,
    profileCache,
  });

  const { socketRef, socketInstance } = useSocketLifecycle({
    sessionChecked,
    profilePubkey: profile?.pubkey,
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
  });

  useRoomAndUrlSync({
    socketRef,
    activeServerId,
    activeChannelId,
    activePostId,
    prevChannelRef,
    activeChannelIdRef,
  });

  useBroadcastSync(profilePubkeyRef);

  // Centralized mark-as-read gating (visibility + focus + scroll-to-bottom).
  useReadTracker(socketInstance);

  // Mirror unread total into favicon + document.title (Discord-style).
  useFaviconBadge();

  useMessageLoader({
    activeChannelId,
    activePostId,
    pendingHighlightRef,
    setMessages,
    setLoadingMessages,
    setMessageCursor,
  });

  // Send message via socket (with optional replyToId)
  const handleSend = useCallback((content: string, replyToId?: string) => {
    const socket = socketRef.current;
    if (!socket || !activeChannelId) return;
    const effectiveReplyToId = replyToId ?? activePostId ?? undefined;
    socket.emit('send-message', { channelId: activeChannelId, content, replyToId: effectiveReplyToId });
    // Auto-follow the post when sending a message in it, unless the user
    // explicitly unfollowed it this session.
    if (activePostId) {
      const state = useChatStore.getState();
      const followedPostIds = Array.isArray(state.followedPostIds) ? state.followedPostIds : [];
      const suppressedPostIds = Array.isArray(state.suppressedAutoFollowPostIds)
        ? state.suppressedAutoFollowPostIds
        : [];
      const alreadyFollowing = followedPostIds.includes(activePostId);
      const suppressed = suppressedPostIds.includes(activePostId);
      if (!alreadyFollowing && !suppressed) {
        const ch = state.categories
          .flatMap((c) => c.channels)
          .concat(state.pinnedChannels)
          .find((c) => c.id === activeChannelId);
        void state.toggleFollowPost(activePostId, {
          title: '',
          channelId: activeChannelId,
          channelName: ch?.name ?? '',
          serverId: state.activeServerId ?? '',
        });
      }
    }
  }, [activeChannelId, activePostId, socketRef]);

  // Edit message via socket
  const handleEdit = useCallback((messageId: string, content: string) => {
    const socket = socketRef.current;
    if (!socket || !activeChannelId) return;
    socket.emit('edit-message', { messageId, channelId: activeChannelId, content });
    setEditingMessage(null);
  }, [activeChannelId, setEditingMessage, socketRef]);

  // Toggle reaction via socket
  const handleToggleReaction = useCallback((messageId: string, emoji: string) => {
    const socket = socketRef.current;
    if (!socket || !activeChannelId) return;
    socket.emit('toggle-reaction', { messageId, channelId: activeChannelId, emoji });
  }, [activeChannelId, socketRef]);

  // Delete own message via socket
  const handleDelete = useCallback((messageId: string) => {
    const socket = socketRef.current;
    if (!socket || !activeChannelId) return;
    socket.emit('delete-message', { messageId, channelId: activeChannelId });
  }, [activeChannelId, socketRef]);

  // Typing indicator emit
  const handleTyping = useCallback(() => {
    const socket = socketRef.current;
    if (socket && activeChannelId) {
      socket.emit('typing', activeChannelId);
    }
  }, [activeChannelId, socketRef]);

  // Voice channel handlers
  const handleJoinVoice = useCallback(async (channelId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    const voiceStore = useVoiceStore.getState();
    voiceStore.setConnecting(true);
    voiceStore.setConnectionState('connecting');
    voiceStore.setError(null);
    try {
      // Pick the backend based on how the admin configured this channel.
      // Both clients expose the same public surface (methods + on* callbacks),
      // so downstream wiring is identical.
      const chatState = useChatStore.getState();
      const ch = [
        ...chatState.pinnedChannels,
        ...chatState.categories.flatMap((c) => c.channels),
      ].find((c) => c.id === channelId);
      const useSfu = ch?.voiceMode === 'sfu';
      const client: WebSocketVoiceClient | LiveKitVoiceClient = useSfu
        ? new LiveKitVoiceClient({ tokenFetcher: fetchVoiceToken })
        : new WebSocketVoiceClient(socket);
      client.onConnectionStateChange = (state) => {
        useVoiceStore.getState().setConnectionState(
          state === 'connected' ? 'connected' : state === 'failed' ? 'failed' : 'connecting',
        );
      };
      client.onError = (error) => {
        useVoiceStore.getState().setError(error);
      };
      client.onRemoteVideoElement = (pubkey, element) => {
        const vs = useVoiceStore.getState();
        if (element) vs.addRemoteVideo(pubkey, element);
        else vs.removeRemoteVideo(pubkey);
      };
      client.onRemoteScreenElement = (pubkey, element) => {
        const vs = useVoiceStore.getState();
        if (element) vs.addRemoteScreen(pubkey, element);
        else vs.removeRemoteScreen(pubkey);
      };
      client.onLocalCameraStream = (stream) => {
        useVoiceStore.getState().setLocalCameraStream(stream);
      };
      client.onLocalScreenStream = (stream) => {
        useVoiceStore.getState().setLocalScreenStream(stream);
      };
      client.onForceMute = (reason) => {
        const vs = useVoiceStore.getState();
        vs.setMuted(true);
        vs.setLimitNotice(reason);
      };
      client.onForceCameraOff = (reason) => {
        const vs = useVoiceStore.getState();
        vs.setCameraOn(false);
        vs.setLimitNotice(reason);
      };
      client.onForceScreenOff = (reason) => {
        const vs = useVoiceStore.getState();
        vs.setScreenSharing(false);
        vs.setLimitNotice(reason);
      };
      // Drive the real "green orb" from actual audio levels (mesh client uses
      // SpeakingDetector; LiveKit client forwards its ActiveSpeakersChanged).
      client.onSpeakingChange = (pubkey, speaking) => {
        useVoiceStore.getState().setSpeaking(pubkey, speaking);
      };
      voiceStore.setVoiceChannel(channelId);
      const myPubkey = useAuthStore.getState().profile?.pubkey;
      if (!myPubkey) throw new Error('Not authenticated');
      await client.join(channelId, myPubkey);
      voiceClientRef.current = client;
      // Expose to the persistent status bar in the sidebar so the user can
      // toggle mic/deafen/leave from anywhere in the app while a call is live.
      setActiveVoiceClient(client);
      // Mirror store `localMutedPubkeys` into the client's per-peer silencer.
      // Subscribed after join() so the initial state is pushed as diffs.
      const unsubscribeLocalMute = useVoiceStore.subscribe((state, prev) => {
        if (state.localMutedPubkeys === prev.localMutedPubkeys) return;
        for (const pk of state.localMutedPubkeys) {
          if (!prev.localMutedPubkeys.has(pk)) client.setPeerMuted(pk, true);
        }
        for (const pk of prev.localMutedPubkeys) {
          if (!state.localMutedPubkeys.has(pk)) client.setPeerMuted(pk, false);
        }
      });
      (client as unknown as { __unsubscribeLocalMute?: () => void }).__unsubscribeLocalMute = unsubscribeLocalMute;
      // Mic is deferred — reflect that in UI (muted until user unmutes).
      voiceStore.setMuted(true);
      if (socket) socket.emit('voice-mute', { channelId, muted: true });
      voiceStore.setConnectionState('connected');
    } catch (err: any) {
      console.error('Failed to join voice:', err);
      voiceStore.setError(err?.message || 'Failed to join voice channel');
      voiceStore.setConnectionState('failed');
      voiceStore.setVoiceChannel(null);
    } finally {
      voiceStore.setConnecting(false);
    }
  }, [socketRef]);

  const handleLeaveVoice = useCallback(() => {
    const socket = socketRef.current;
    const voiceStore = useVoiceStore.getState();
    const channelId = voiceStore.currentVoiceChannelId;

    if (voiceClientRef.current) {
      const client = voiceClientRef.current;
      (client as unknown as { __unsubscribeLocalMute?: () => void }).__unsubscribeLocalMute?.();
      client.leave();
      voiceClientRef.current = null;
      setActiveVoiceClient(null);
    }
    if (socket && channelId) {
      socket.emit('leave-voice', channelId);
    }
    voiceStore.leaveVoice();
  }, [socketRef]);

  const handleToggleVoiceMute = useCallback(async () => {
    const socket = socketRef.current;
    const voiceStore = useVoiceStore.getState();
    const channelId = voiceStore.currentVoiceChannelId;
    const newMuted = !voiceStore.isMuted;
    const client = voiceClientRef.current;

    if (client) {
      if (newMuted) {
        client.mute();
      } else {
        try {
          await client.unmute();
        } catch (err: any) {
          useVoiceStore.getState().setError(err?.message || 'Failed to enable microphone');
          return;
        }
      }
    }
    voiceStore.setMuted(newMuted);
    if (socket && channelId) {
      socket.emit('voice-mute', { channelId, muted: newMuted });
    }
  }, [socketRef]);

  const handleToggleVoiceDeafen = useCallback(() => {
    const socket = socketRef.current;
    const voiceStore = useVoiceStore.getState();
    const channelId = voiceStore.currentVoiceChannelId;
    const newDeafened = !voiceStore.isDeafened;
    voiceStore.setDeafened(newDeafened);
    if (newDeafened) {
      voiceStore.setMuted(true);
      if (voiceClientRef.current) voiceClientRef.current.mute();
    }
    if (voiceClientRef.current) {
      voiceClientRef.current.setDeafened(newDeafened);
    }
    if (socket && channelId) {
      socket.emit('voice-deafen', { channelId, deafened: newDeafened });
    }
  }, [socketRef]);

  const handleToggleCamera = useCallback(async () => {
    const client = voiceClientRef.current;
    if (!client) return;
    const voiceStore = useVoiceStore.getState();
    try {
      if (voiceStore.isCameraOn) {
        await client.stopCamera();
        voiceStore.setCameraOn(false);
      } else {
        await client.startCamera();
        voiceStore.setCameraOn(true);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to start camera';
      console.error('Camera error:', err);
      if (/limit|already sharing/i.test(msg)) {
        useVoiceStore.getState().setLimitNotice(msg);
      } else {
        useVoiceStore.getState().setError(msg);
      }
    }
  }, []);

  const handleToggleScreenShare = useCallback(async () => {
    const client = voiceClientRef.current;
    if (!client) return;
    const voiceStore = useVoiceStore.getState();
    try {
      if (voiceStore.isScreenSharing) {
        await client.stopScreenShare();
        voiceStore.setScreenSharing(false);
      } else {
        await client.startScreenShare();
        voiceStore.setScreenSharing(true);
      }
    } catch (err: any) {
      // User cancelled screen share picker — not an error
      if (err?.name === 'NotAllowedError') return;
      const msg = err?.message || 'Failed to share screen';
      console.error('Screen share error:', err);
      if (/limit|already sharing/i.test(msg)) {
        useVoiceStore.getState().setLimitNotice(msg);
      } else {
        useVoiceStore.getState().setError(msg);
      }
    }
  }, []);

  const myRoleForVoice = useChatStore((s) => s.myRole);
  const canModerateVoice = myRoleForVoice === 'owner' || myRoleForVoice === 'admin' || myRoleForVoice === 'mod';

  const handleVoiceModAction = useCallback((targetPubkey: string, action: 'mute' | 'camera-off' | 'screen-off') => {
    const socket = socketRef.current;
    const channelId = useVoiceStore.getState().currentVoiceChannelId;
    if (!socket || !channelId) return;
    socket.emit('voice-mod-action', { channelId, targetPubkey, action }, (res: any) => {
      if (res?.error) useVoiceStore.getState().setError(res.error);
    });
  }, [socketRef]);

  // Find active channel name for top bar
  const allChannels = [
    ...pinnedChannels,
    ...categories.flatMap(c => c.channels),
  ];
  const activeChannel = allChannels.find(c => c.id === activeChannelId);
  const isVoiceChatOpen = useVoiceStore((s) => s.isVoiceChatOpen);
  const fullscreenGameId = useGamesStore((s) => s.fullscreenGameId);
  const fullscreenGame = useGamesStore((s) => (s.fullscreenGameId ? s.games[s.fullscreenGameId] : null));
  const isGameChatOpen = useGamesStore((s) => s.isGameChatOpen);
  const setGameChatOpen = useGamesStore((s) => s.setGameChatOpen);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChannelTopic, setShowChannelTopic] = useState(false);
  const [showMemberList, setShowMemberList] = useState(() => {
    if (typeof window === 'undefined') return true;
    // Default closed on mobile (<768px), open on desktop
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChannelNotifyMenu, setShowChannelNotifyMenu] = useState(false);
  const channelNotifPrefs = useNotificationPrefsStore((s) => s.prefs);

  useEffect(() => {
    if (!showChannelNotifyMenu) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[role="dialog"]') || target.closest('[data-testid="channel-bell"]')) return;
      setShowChannelNotifyMenu(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showChannelNotifyMenu]);

  const voiceMainRef = useRef<HTMLDivElement>(null);
  const { voiceChatWidth, onVoiceChatResize } = useVoiceChatPane(isVoiceChatOpen, voiceMainRef);

  // No valid session — show login modal with matrix background.
  // Also covers the case where session was checked but profile failed to
  // hydrate (e.g. /api/auth/me returned a pubkey but the profile fetch
  // didn't populate the store): treat that as "not signed in" rather than
  // rendering chat with `profile === null`.
  if (sessionInvalid || (sessionChecked && !profile?.pubkey)) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black lc-grid-bg relative">
        <ShootingStars />
        <LoginModal
          isOpen={true}
          transparentBackdrop
          onClose={() => router.push('/')}
          onSuccess={() => {
            setSessionInvalid(false);
            sessionCheckStartedRef.current = false;
            restoreSession().then((valid) => {
              if (valid) setSessionChecked(true);
            });
          }}
        />
      </div>
    );
  }

  // Loading: session check is in flight or the profile hasn't hydrated
  // yet. NDK + signer reattachment runs in the background — components
  // that need the signer (DMList, voice, etc.) render their own
  // "connecting…" states off the reactive `signerReady` flag instead of
  // blocking the entire chat shell here.
  if (!sessionChecked || !profile?.pubkey) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="flex flex-col items-center gap-3">
          <div className="lc-spinner" style={{ width: 32, height: 32 }} />
          <span className="text-sm text-lc-muted">Loading...</span>
        </div>
      </div>
    );
  }

  // Standalone full-screen empty state when not in any servers and not in DM mode
  if (serversLoaded && servers.length === 0 && (!DM_FEATURE_ENABLED || !isDMMode)) {
    return (
      <div className="h-dvh flex items-center justify-center bg-lc-black lc-grid-bg relative overflow-hidden">
        <ShootingStars />
        <div className="lc-card p-8 max-w-sm w-full mx-4 text-center relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-lc-black border border-lc-border flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-lc-muted">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-lc-white mb-2">No servers yet</h2>
          <p className="text-lc-muted text-sm leading-relaxed mb-6">
            You&apos;re not a member of any server. Ask a server admin for an invite link to get started.
          </p>
          <div className="flex flex-col gap-3 w-full">
            {hasDefaultServer && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/servers/join-default', { method: 'POST' });
                    if (res.ok) {
                      window.location.reload();
                    } else {
                      const data = await res.json();
                      pushErrorToast('Failed to join default server', data.error, 'Join failed');
                    }
                  } catch {
                    pushErrorToast('Error joining default server', null, 'Join failed');
                  }
                }}
                className="lc-pill-primary text-sm px-5 py-2.5 w-full"
              >
                Join Default Server
              </button>
            )}
            {DM_FEATURE_ENABLED && (
              <button
                onClick={() => useDMStore.getState().setDMMode(true)}
                className="lc-pill-secondary text-sm px-5 py-2.5 w-full"
              >
                Open Direct Messages
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const activeServerForTopBar = servers.find((s) => s.id === activeServerId);

  return (
    <div className="h-dvh flex flex-col bg-black relative overflow-hidden">
      {/* Top-top bar — app/server title on the left, inbox + help on the right */}
      <div
        className="h-10 px-3 bg-lc-black shrink-0"
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div className="flex items-center gap-2 min-w-0 max-w-[60%]">
          {activeServerForTopBar?.icon ? (
            <img src={activeServerForTopBar.icon} alt="" className="w-5 h-5 rounded-full shrink-0" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-[10px] font-bold shrink-0">
              {activeServerForTopBar?.name?.[0]?.toUpperCase() || 'O'}
            </div>
          )}
          <span className="text-xs font-semibold text-lc-white truncate">
            {activeServerForTopBar?.name || 'Obelisk'}
          </span>
        </div>
        <div
          className="flex items-center gap-1 shrink-0 z-10"
          style={{ position: 'absolute', right: 12, top: 0, bottom: 0 }}
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNotifications((v) => {
                  const next = !v;
                  if (next) useNotificationStore.getState().markInboxRead();
                  return next;
                });
              }}
              className="relative p-1.5 rounded-lg text-lc-muted hover:text-lc-white hover:bg-lc-border/40 transition-colors"
              title={t('inbox.title')}
              aria-label={t('inbox.title')}
              aria-expanded={showNotifications}
              data-testid="top-notifications-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
              {unreadInboxCount > 0 && (
                <span
                  className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-lc-green text-lc-black text-[9px] font-bold flex items-center justify-center"
                  data-testid="top-notifications-badge"
                >
                  {unreadInboxCount > 99 ? '99+' : unreadInboxCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div
                  className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] bg-lc-dark border border-lc-border rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col"
                  data-testid="top-notifications-panel"
                >
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-lc-border">
                    <div className="flex items-center gap-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-green">
                        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                      </svg>
                      <span className="text-sm font-semibold text-lc-white">{t('inbox.title')}</span>
                    </div>
                    {inboxEvents.length > 0 && (
                      <button
                        type="button"
                        onClick={() => useNotificationStore.getState().clearInboxEvents()}
                        aria-label={t('inbox.markAllRead')}
                        className="text-[11px] text-lc-muted hover:text-lc-white transition-colors"
                        data-testid="top-notifications-clear"
                      >
                        {t('inbox.markAllRead')}
                      </button>
                    )}
                  </div>
                  {inboxEvents.length === 0 ? (
                    <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                      <p className="text-sm text-lc-muted">{t('inbox.empty')}</p>
                    </div>
                  ) : (
                    <div className="overflow-y-auto flex-1" data-testid="top-notifications-list">
                      {inboxEvents.map((evt) => {
                        const member = evt.senderPubkey
                          ? memberList.find((m) => m.pubkey === evt.senderPubkey)
                          : undefined;
                        const cached = evt.senderPubkey ? profileCache.get(evt.senderPubkey) : undefined;
                        const senderName = evt.senderPubkey
                          ? (member?.displayName || cached?.name || shortNpub(evt.senderPubkey))
                          : null;
                        return (
                          <InboxRow
                            key={evt.id}
                            evt={evt}
                            onActivate={() => {
                              setShowNotifications(false);
                              navigateToInboxEvent(evt);
                            }}
                            typeLabel={t(`inbox.type.${evt.type}`)}
                            senderName={senderName}
                            members={memberList}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <a
            href="/"
            className="p-1.5 rounded-lg text-lc-muted hover:text-lc-white hover:bg-lc-border/40 transition-colors inline-flex"
            title="Ayuda"
            aria-label="Ayuda"
            data-testid="top-help-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </a>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
      {/* Mobile sidebar overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebars — always visible on desktop, slide-out drawer on mobile.
          Flex-col so the UserPanel bar can span across ServerBar + ChannelSidebar
          (Discord-style), instead of being nested inside ChannelSidebar. */}
      <div className={`
        fixed inset-y-0 left-0 z-50 flex flex-col
        transform transition-transform duration-200 ease-in-out
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex flex-1 min-h-0">
          <ServerBar />
          {DM_FEATURE_ENABLED && isDMMode ? (
            <DMList onNewDM={() => setShowNewDMModal(true)} />
          ) : serversLoaded && servers.length === 0 ? null : (
            <ChannelSidebar onChannelSelect={() => setSidebarOpen(false)} />
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <SoftPromptBanner />
        {DM_FEATURE_ENABLED && isDMMode && profile?.pubkey ? (
          <DMSessionProvider myPubkey={profile.pubkey}>
            {/* DM top bar with mobile hamburger */}
            <div className="h-12 px-3 flex items-center gap-3 border-b border-lc-border shrink-0 bg-lc-dark md:hidden">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg text-lc-muted hover:text-lc-white hover:bg-lc-border/50 transition-colors"
                aria-label="Open sidebar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              <span className="text-sm font-semibold text-lc-white">Direct Messages</span>
            </div>
            <DMChat profileCache={profileCache} />
            <ProtocolPrompt />
            {showNewDMModal && (
              <NewDMModal
                onClose={() => setShowNewDMModal(false)}
                profileCache={profileCache}
              />
            )}
          </DMSessionProvider>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top bar — spans across chat + member list so toggling the
                member list doesn't shift the search bar / action icons. */}
            <div className="h-12 px-3 md:px-4 flex items-center justify-between border-t border-b border-lc-border shrink-0 bg-lc-dark">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-1.5 rounded-lg text-lc-muted hover:text-lc-white hover:bg-lc-border/50 transition-colors md:hidden shrink-0"
                    aria-label="Open sidebar"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="3" y1="6" x2="21" y2="6"/>
                      <line x1="3" y1="12" x2="21" y2="12"/>
                      <line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                  </button>
                  {activeChannel ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lc-muted font-bold shrink-0">
                        {activeChannel.type === 'forum' ? '💬' : activeChannel.type === 'voice' ? '🎙' : '#'}
                      </span>
                      {activeChannel.emoji && <ChannelEmoji value={activeChannel.emoji} className="text-sm shrink-0" />}
                      {activeChannel.type === 'forum' && activePostId ? (
                        <button
                          onClick={() => setActivePostId(null)}
                          className="font-semibold text-sm text-lc-muted hover:text-lc-white truncate shrink-0 transition-colors"
                          data-testid="post-breadcrumb-parent"
                        >
                          {activeChannel.name}
                        </button>
                      ) : (
                        <h3 className="font-semibold text-lc-white text-sm truncate shrink-0">{activeChannel.name}</h3>
                      )}
                      {(() => {
                        const channelPref = channelNotifPrefs.find(
                          (p) => p.scopeType === 'channel' && p.scopeId === activeChannel.id,
                        );
                        const isMuted = !!(
                          channelPref?.mutedUntil && new Date(channelPref.mutedUntil) > new Date()
                        );
                        const bellIcon = isMuted ? '🔕' : '🔔';
                        const bellTitle = (() => {
                          if (isMuted && channelPref?.mutedUntil) {
                            const until = new Date(channelPref.mutedUntil);
                            if (until.getFullYear() > 9000) return 'Muted';
                            return `Muted until ${until.toLocaleString()}`;
                          }
                          if (channelPref?.notifyLevel === 'all') return 'Notify on all messages';
                          if (channelPref?.notifyLevel === 'nothing') return 'Notifications off';
                          return 'Notifications: mentions only (default)';
                        })();
                        return (
                          <span className="relative shrink-0">
                            <button
                              type="button"
                              className="text-lc-muted hover:text-lc-white text-sm leading-none"
                              title={bellTitle}
                              onClick={() => setShowChannelNotifyMenu((v) => !v)}
                              aria-label="Channel notification settings"
                              data-testid="channel-bell"
                            >
                              {bellIcon}
                            </button>
                            {showChannelNotifyMenu && (
                              <span className="absolute right-0 top-6 z-50">
                                <NotifyMenu
                                  scope={{ type: 'channel', id: activeChannel.id }}
                                  title={activeChannel.name}
                                  onClose={() => setShowChannelNotifyMenu(false)}
                                />
                              </span>
                            )}
                          </span>
                        );
                      })()}
                      {activeChannel.type === 'forum' && activePostId && (
                        <ActivePostCrumb />
                      )}
                      {!(activeChannel.type === 'forum' && activePostId) && activeChannel.description && (
                        <>
                          <span className="text-lc-border shrink-0">|</span>
                          <button
                            onClick={() => setShowChannelTopic(true)}
                            className="text-xs text-lc-muted hover:text-lc-white truncate text-left transition-colors min-w-0"
                            title="Ver tema del canal"
                            data-testid="channel-topic-btn"
                          >
                            {activeChannel.description}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-lc-muted">Select a channel</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {activeChannel && activeChannelId && activeChannel.type !== 'forum' && activeChannel.type !== 'voice' && !isSearchOpen && (
                    <PinnedMessagesPanel
                      channelId={activeChannelId}
                      profileCache={profileCache}
                      onJumpToMessage={async (id) => {
                        const loaded = useChatStore.getState().messages;
                        if (loaded.some((m) => m.id === id)) {
                          useChatStore.setState({ highlightedMessageId: id });
                          return;
                        }
                        try {
                          const r = await fetch(`/api/channels/${activeChannelId}/messages?around=${encodeURIComponent(id)}`);
                          if (!r.ok) return;
                          const d = await r.json();
                          useChatStore.getState().setMessages(d.messages);
                          useChatStore.getState().setMessageCursor(d.nextCursor ?? null, !!d.nextCursor);
                          if (d.messages.some((x: Message) => x.id === id)) {
                            useChatStore.setState({ highlightedMessageId: id });
                          }
                        } catch { /* ignore */ }
                      }}
                    />
                  )}
                  <button
                    onClick={() => setShowMemberList((v) => !v)}
                    className="p-1.5 rounded-lg hover:bg-lc-border/40 text-lc-muted hover:text-lc-white transition-colors inline-flex"
                    title={showMemberList ? 'Ocultar lista de miembros' : 'Mostrar lista de miembros'}
                    aria-label={showMemberList ? 'Ocultar lista de miembros' : 'Mostrar lista de miembros'}
                    data-testid="member-list-toggle"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </button>
                  <SearchBar serverId={activeServerId} profileCache={profileCache} />
                </div>
              </div>

            <div className="flex-1 flex min-h-0">
              {fullscreenGameId && fullscreenGame ? (
                <>
                  <GameFullscreenView game={fullscreenGame} />
                  {isGameChatOpen && (
                    <aside
                      className="
                        flex flex-col min-h-0 overflow-hidden border border-lc-border bg-lc-dark shadow-xl
                        fixed inset-0 z-50 rounded-none my-0 mr-0 w-auto
                        md:relative md:inset-auto md:z-auto md:rounded-xl md:my-2 md:mr-2 md:shrink-0
                        md:w-[var(--game-chat-w)]
                      "
                      // CSS variable consumed by the width utility below;
                      // on <md the `w-auto` override wins so inset-0 stretches full-screen.
                      style={{ ['--game-chat-w' as string]: `${voiceChatWidth}px` } as React.CSSProperties}
                      data-testid="game-chat-rail"
                    >
                      <header className="h-12 px-3 md:px-4 flex items-center justify-between border-b border-lc-border bg-lc-dark shrink-0">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-lc-muted shrink-0">#</span>
                          <span className="text-sm font-semibold text-lc-white truncate">
                            {[...pinnedChannels, ...categories.flatMap((c) => c.channels)].find((c) => c.id === fullscreenGame.channelId)?.name || '…'}
                          </span>
                          <span className="text-lc-border shrink-0">·</span>
                          <span className="text-xs text-lc-muted truncate">
                            🎮 {fullscreenGame.type === 'tic-tac-toe' ? 'Tic-Tac-Toe' : fullscreenGame.type === 'chain-reaction' ? 'Chain Reaction' : fullscreenGame.type}
                          </span>
                        </span>
                        <button
                          onClick={() => setGameChatOpen(false)}
                          className="text-lc-muted hover:text-lc-white p-1 shrink-0"
                          title="Ocultar chat"
                          data-testid="game-chat-close"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </header>
                      <MessageArea profileCache={profileCache} onDelete={handleDelete} onToggleReaction={handleToggleReaction} />
                      {messageError && (
                        <div className="px-4 py-2 bg-red-600/20 border-t border-red-600/30">
                          <p className="text-sm text-red-400">{messageError}</p>
                        </div>
                      )}
                      <TypingIndicator profileCache={profileCache} />
                      <MessageInput onSend={handleSend} onEditSave={handleEdit} onTyping={handleTyping} />
                    </aside>
                  )}
                </>
              ) : (
                <>
              <div ref={voiceMainRef} className="flex-1 flex flex-col min-h-0 min-w-0 relative">
              {showSearchPane && (
                <div className="absolute inset-0 z-30 flex flex-col bg-lc-black" data-testid="search-pane-overlay">
                  <SearchResultsPane
                    serverId={activeServerId}
                    profileCache={profileCache}
                    onRequery={(append) => {
                      window.dispatchEvent(new CustomEvent('obelisk:search:requery', { detail: { append } }));
                    }}
                  />
                </div>
              )}
              {showChannelTopic && activeChannel?.description && (
                <ChannelTopicModal
                  channelName={activeChannel.name}
                  channelType={activeChannel.type}
                  channelEmoji={activeChannel.emoji}
                  description={activeChannel.description}
                  onClose={() => setShowChannelTopic(false)}
                />
              )}

              {/* Forum, Voice, or Chat */}
              {activeChannel?.type === 'forum' ? (
                <>
                  {/* ForumView stays mounted even when a thread is open so
                      its post list doesn't re-fetch / flash on close.
                      Thread view overlays via its own stack of components. */}
                  <div className={activePostId ? 'hidden' : 'flex flex-col flex-1 min-h-0'}>
                    <ForumView
                      channelId={activeChannel.id}
                      channelName={activeChannel.name}
                      profileCache={profileCache}
                      availableTags={activeChannel.forumTags}
                      initialPostId={initialForumPostId}
                    />
                  </div>
                  {activePostId && (
                    <>
                      <PostChatHeader
                        postId={activePostId}
                        parentChannelName={activeChannel.name}
                        parentChannelEmoji={activeChannel.emoji}
                        profileCache={profileCache}
                        onClose={() => {
                          setActivePostId(null);
                        }}
                      />
                      <MessageArea profileCache={profileCache} onDelete={handleDelete} onToggleReaction={handleToggleReaction} />
                      {messageError && (
                        <div className="px-4 py-2 bg-red-600/20 border-t border-red-600/30">
                          <p className="text-sm text-red-400">{messageError}</p>
                        </div>
                      )}
                      <TypingIndicator profileCache={profileCache} />
                      <MessageInput onSend={handleSend} onEditSave={handleEdit} onTyping={handleTyping} />
                    </>
                  )}
                </>
              ) : activeChannel?.type === 'voice' ? (
                <VoiceChannel
                  channelId={activeChannel.id}
                  channelName={activeChannel.name}
                  profileCache={profileCache}
                  onJoin={handleJoinVoice}
                  onLeave={handleLeaveVoice}
                  onToggleMute={handleToggleVoiceMute}
                  onToggleDeafen={handleToggleVoiceDeafen}
                  onToggleCamera={handleToggleCamera}
                  onToggleScreenShare={handleToggleScreenShare}
                  canModerate={canModerateVoice}
                  onModAction={handleVoiceModAction}
                  chatSlot={(
                    <>
                      <MessageArea profileCache={profileCache} onDelete={handleDelete} onToggleReaction={handleToggleReaction} />
                      {messageError && (
                        <div className="px-4 py-2 bg-red-600/20 border-t border-red-600/30">
                          <p className="text-sm text-red-400">{messageError}</p>
                        </div>
                      )}
                      <TypingIndicator profileCache={profileCache} />
                      <MessageInput onSend={handleSend} onEditSave={handleEdit} onTyping={handleTyping} />
                    </>
                  )}
                />
              ) : (
                <>
                  <MessageArea profileCache={profileCache} onDelete={handleDelete} onToggleReaction={handleToggleReaction} />
                  {messageError && (
                    <div className="px-4 py-2 bg-red-600/20 border-t border-red-600/30">
                      <p className="text-sm text-red-400">{messageError}</p>
                    </div>
                  )}
                  <TypingIndicator profileCache={profileCache} />
                  <MessageInput onSend={handleSend} onEditSave={handleEdit} onTyping={handleTyping} />
                </>
              )}
            </div>

            {/* Voice channel chat rail — rendered as a sibling of the main
                column so its h-12 header visually lines up with the outer
                channel title bar. Only shown for voice channels where the
                user has toggled it open via the speech-bubble button. */}
            {activeChannel?.type === 'voice' && isVoiceChatOpen && (
              <aside
                id="voice-chat-rail"
                style={{ width: voiceChatWidth }}
                className="hidden md:flex relative my-2 mr-2 rounded-xl overflow-hidden border border-lc-border bg-lc-dark shadow-xl flex-col min-h-0 shrink-0"
                data-testid="voice-chat-rail"
              >
                <div
                  onMouseDown={onVoiceChatResize}
                  role="separator"
                  aria-orientation="vertical"
                  data-testid="voice-chat-resize-handle"
                  className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-lc-green/40 active:bg-lc-green/60 transition-colors z-20"
                />
                <header className="h-12 px-3 md:px-4 flex items-center justify-between border-b border-lc-border bg-lc-dark shrink-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-muted shrink-0">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span className="text-sm font-semibold text-lc-white truncate">Channel chat</span>
                  </span>
                  <button
                    onClick={() => useVoiceStore.getState().setVoiceChatOpen(false)}
                    className="text-lc-muted hover:text-lc-white p-1 shrink-0"
                    title="Hide chat"
                    data-testid="voice-chat-close"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </header>
                <MessageArea profileCache={profileCache} onDelete={handleDelete} onToggleReaction={handleToggleReaction} />
                {messageError && (
                  <div className="px-4 py-2 bg-red-600/20 border-t border-red-600/30">
                    <p className="text-sm text-red-400">{messageError}</p>
                  </div>
                )}
                <TypingIndicator profileCache={profileCache} />
                <MessageInput onSend={handleSend} onEditSave={handleEdit} onTyping={handleTyping} />
              </aside>
            )}
            {/* Member list — inline panel on md+. Mobile drawer rendered at
                the top level below so it can't be clipped by flex ancestors. */}
            {showMemberList && activeChannel?.type !== 'voice' && (
              <div className="hidden md:flex h-full">
                <MemberList profileCache={profileCache} />
              </div>
            )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
      {/* Mobile member list drawer — slides in from the right, mirrors
          ChannelSidebar animation. Rendered at top level so no ancestor
          transform/overflow can clip it. Hidden on md+ (inline panel used). */}
      {activeChannel?.type !== 'voice' && (
        <>
          {showMemberList && (
            <div
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              onClick={() => setShowMemberList(false)}
              aria-hidden
            />
          )}
          <div
            className={`
              fixed inset-y-0 right-0 z-50 flex md:hidden
              transform transition-transform duration-200 ease-in-out
              ${showMemberList ? 'translate-x-0' : 'translate-x-full'}
            `}
          >
            <MemberList profileCache={profileCache} />
          </div>
        </>
      )}
      <GlobalProfilePopover />
      <GameDock />
      <ActivitiesPanel />
      <GamePickerModal />
      <SettingsModal />
    </div>
  );
}

function ActivePostCrumb() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activePostId = useChatStore((s) => s.activePostId);
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!activeChannelId || !activePostId) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/channels/${activeChannelId}/posts/${encodeURIComponent(activePostId)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!aborted) setTitle(data.post?.title ?? null);
      } catch { /* ignore */ }
    })();
    return () => { aborted = true; };
  }, [activeChannelId, activePostId]);
  return (
    <>
      <span className="text-lc-muted shrink-0">›</span>
      <h3 className="font-semibold text-lc-white text-sm truncate min-w-0">
        {title ?? '...'}
      </h3>
    </>
  );
}

function GlobalProfilePopover() {
  const pubkey = useChatStore((s) => s.profilePopupPubkey);
  const close = useChatStore((s) => s.closeProfilePopup);
  if (!pubkey) return null;
  return <ProfilePopover pubkey={pubkey} onClose={close} />;
}
