'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
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
import { discoverDMThreads, subscribeDMs, computeUnreadCounts } from '@/lib/dm';
import type { DMMessage } from '@/lib/dm';
import { publishInboxRelays } from '@/lib/dm-inbox';
import { formatPubkey, getNDK, connectNDK, addDMInboxRelays, restoreRemoteSigner } from '@/lib/nostr';
import { DM_FEATURE_ENABLED } from '@/lib/feature-flags';
import { shortNpub, parseMentions } from '@/lib/mentions';
import { playMentionSound } from '@/lib/mentionSound';
import {
  isUserWatchingChannel,
  handleIncomingChannelMessage,
  handleIncomingDM,
} from '@/lib/read-gates';
import MemberList from '@/components/chat/MemberList';
import LoginModal from '@/components/LoginModal';
import ShootingStars from '@/components/ShootingStars';
import { useNotificationStore } from '@/store/notification';
import { useToastStore } from '@/store/toast';
import { useReadTracker } from '@/hooks/useReadTracker';
import { useFaviconBadge } from '@/hooks/useFaviconBadge';
import { subscribeBroadcast } from '@/lib/notification-broadcast';
import { clearBadge } from '@/lib/favicon-badge';
import { useTranslation } from '@/i18n/context';
import type { InboxEvent } from '@/store/notification';

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
  const { isConnected, profile, logout, restoreSession } = useAuthStore();
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
    setTyping,
    memberList,
    setMemberList,
    setMyRole,
    setServerEmojis,
    setServerGifs,
  } = useChatStore();
  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  // Union: mesh and SFU clients expose the same public surface so the rest
  // of the voice handler code doesn't care which backend is running.
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
  const initialUrlRef = useRef<{ s: string | null; c: string | null; m: string | null; p: string | null } | null>(null);
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
  // Slug share-links (e.g. /chat?c=plaza-publica&m=<id>) are resolved via
  // /api/channels/resolve-slug before the server/channel auto-select kicks
  // in, so the user lands on the right server + channel. If the incoming
  // `c` is a cuid, this is a no-op.
  // Gated: server auto-select (below) waits until slug resolution finishes
  // so `?c=plaza-publica` lands on the right server instead of the first
  // server in the list.
  const [slugResolutionDone, setSlugResolutionDone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const c = initialUrlRef.current?.c;
    if (!c) return true;
    const looksLikeId = /^[a-z0-9]{20,32}$/i.test(c) && !c.includes('-');
    return looksLikeId;
  });
  const slugResolvedRef = useRef(false);
  useEffect(() => {
    if (slugResolvedRef.current) return;
    const c = initialUrlRef.current?.c;
    const s = initialUrlRef.current?.s;
    if (!c) { setSlugResolutionDone(true); return; }
    const looksLikeId = /^[a-z0-9]{20,32}$/i.test(c) && !c.includes('-');
    if (looksLikeId) { setSlugResolutionDone(true); return; }
    slugResolvedRef.current = true;
    const qs = new URLSearchParams({ c });
    if (s) qs.set('s', s);
    fetch(`/api/channels/resolve-slug?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.serverId && data.channelId) {
          initialUrlRef.current = {
            ...(initialUrlRef.current ?? { s: null, c: null, m: null, p: null }),
            s: data.serverId,
            c: data.channelId,
          };
        }
      })
      .catch(() => {})
      .finally(() => setSlugResolutionDone(true));
  }, []);
  const initialUrlAppliedRef = useRef({ server: false, channel: false });
  const pendingHighlightRef = useRef<{ channelId: string; messageId: string } | null>(null);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const sessionCheckStarted = useRef(false);
  const [ndkReady, setNdkReady] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [serversLoaded, setServersLoaded] = useState(false);
  const { isDMMode } = useDMStore();
  const [showNewDMModal, setShowNewDMModal] = useState(false);

  const [hasDefaultServer, setHasDefaultServer] = useState(false);

  useEffect(() => {
    fetch('/api/servers/default')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.defaultServer) setHasDefaultServer(true);
      })
      .catch(() => {});
  }, []);

  // If the user disconnects mid-session (Navbar → Disconnect clears the auth
  // store), bounce them to the landing page instead of leaving them on /chat
  // where unauthenticated calls (e.g. Join Default Server) would 401.
  useEffect(() => {
    if (!sessionChecked) return;
    if (!profile?.pubkey) {
      router.push('/');
    }
  }, [sessionChecked, profile?.pubkey, router]);

  // On mount, validate session with backend. If no valid session, redirect to landing.
  useEffect(() => {
    if (sessionCheckStarted.current) return;
    sessionCheckStarted.current = true;

    restoreSession().then(async (valid) => {
      if (!valid) {
        setSessionInvalid(true);
        return;
      }
      // Let the page render immediately — NDK connects in background
      setSessionChecked(true);
    });
  }, [restoreSession, router]);

  // Restore NDK connection + signer in background (non-blocking)
  useEffect(() => {
    if (!sessionChecked) return;

    const loginMethod = useAuthStore.getState().loginMethod;
    const ndk = getNDK();

    connectNDK().then(async () => {
      if (!ndk.signer && loginMethod === 'extension' && typeof window !== 'undefined' && window.nostr) {
        const { NDKNip07Signer } = await import('@nostr-dev-kit/ndk');
        ndk.signer = new NDKNip07Signer(4000, ndk);
      }
      // nsec / bunker / NostrConnect: rebuild the signer from the payload
      // stashed in localStorage at login. Without this the signer dies on
      // every reload (or mobile background eviction) and the user gets
      // silently logged out.
      if (!ndk.signer && (loginMethod === 'nsec' || loginMethod === 'bunker')) {
        const ok = await restoreRemoteSigner();
        if (!ok) {
          console.warn(`[chat] ${loginMethod} signer restore failed`);
          if (loginMethod === 'nsec') {
            logout();
            setSessionChecked(false);
            setSessionInvalid(true);
            return;
          }
        }
      }
      setNdkReady(true);
    }).catch((err) => {
      console.warn('Failed to restore NDK connection:', err);
      setNdkReady(true); // still mark ready so DM UI doesn't hang
    });
  }, [sessionChecked, logout]);

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

  // Fetch user's servers on mount
  useEffect(() => {
    if (!sessionChecked) return;
    // Wait for `?c=<slug>` resolution so the initial-server picker can see
    // the resolved `s` id. Without this gate, the first server in the list
    // gets selected before the resolver returns and the slug link lands on
    // the wrong server.
    if (!slugResolutionDone) return;

    const fetchServers = async () => {
      try {
        const res = await fetch('/api/servers');
        if (!res.ok) return;
        const data = await res.json();
        setServers(data.servers);
        setServersLoaded(true);
        if (data.servers.length > 0 && !activeServerId) {
          // Prefer the server encoded in the URL (?s=) on the initial mount —
          // this is what makes a browser refresh land on the same server the
          // user was viewing. Fall back to the first server otherwise.
          let chosen: string = data.servers[0].id;
          if (!initialUrlAppliedRef.current.server && initialUrlRef.current?.s) {
            const urlS = initialUrlRef.current.s;
            if (data.servers.some((s: any) => s.id === urlS)) {
              chosen = urlS;
            }
          }
          initialUrlAppliedRef.current.server = true;
          setActiveServer(chosen);
        }
      } catch (err) {
        console.error('Failed to fetch servers:', err);
        setServersLoaded(true);
      }
    };

    fetchServers();
  }, [sessionChecked, slugResolutionDone, setServers, setActiveServer]);

  // Fetch unread counts on mount, tab focus, and socket reconnect.
  //
  // Single-mount fetch used to leave the badge stale forever if the client
  // missed a socket event (disconnect, OS-suspended tab, account-switch
  // race). Refetching on visibility/reconnect makes the server the source
  // of truth for counts whenever the tab has been backgrounded. Debounced
  // so tab-flap or reconnect storms don't hammer the DB.
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

  // Fetch channels for the active server
  useEffect(() => {
    if (!sessionChecked || !activeServerId) return;

    const fetchChannels = async () => {
      try {
        const res = await fetch(`/api/channels?serverId=${activeServerId}`);
        if (!res.ok) return;
        const data = await res.json();

        setChannels(data.pinnedChannels, data.categories);

        // Build channel-server map for notification aggregation
        const allChs = [...data.pinnedChannels, ...data.categories.flatMap((c: any) => c.channels)];
        const map: Record<string, string> = {};
        for (const ch of allChs) map[ch.id] = activeServerId;
        const notifStore = useNotificationStore.getState();
        notifStore.setChannelServerMap({ ...notifStore.channelServerMap, ...map });

        // Choose which channel to auto-select. On the initial mount, prefer
        // the channel encoded in the URL (?c=) so refresh lands the user on
        // the exact channel they were in. Otherwise pick the first pinned
        // channel or the first channel in the first category.
        const allChans = [
          ...data.pinnedChannels,
          ...data.categories.flatMap((c: any) => c.channels),
        ];
        let chosenChannel: string | null = null;
        if (!initialUrlAppliedRef.current.channel && initialUrlRef.current?.c) {
          const urlC = initialUrlRef.current.c;
          if (allChans.some((ch: any) => ch.id === urlC)) {
            chosenChannel = urlC;
          }
        }
        // First-visit landing channel. Only applied when the viewer has never
        // entered this server before (server atomically flips the flag on this
        // same request, so the redirect runs at most once). Explicit URL ?c=
        // still wins above so shared links are honored.
        if (
          !chosenChannel
          && data.viewer?.hasEnteredChat === false
          && data.server?.landingChannelId
          && allChans.some((ch: any) => ch.id === data.server.landingChannelId)
        ) {
          chosenChannel = data.server.landingChannelId;
        }
        if (!chosenChannel) {
          const firstChannel = data.pinnedChannels[0]
            || data.categories[0]?.channels[0];
          if (firstChannel) chosenChannel = firstChannel.id;
        }
        if (chosenChannel) {
          // On initial mount, queue a highlight so MessageArea scrolls to the
          // last-viewed message once messages load for this channel. Prefer
          // the URL ?m= param; fall back to the per-channel last-seen stored
          // in localStorage by MessageArea's scroll observer.
          //
          // The localStorage fallback is pubkey-scoped (so a previous account
          // on this browser can't leak its position) and is skipped entirely
          // when the channel already has unread messages — in that case the
          // user wants to see the latest, not their old position. The URL
          // ?m= deep-link still wins regardless.
          if (!initialUrlAppliedRef.current.channel) {
            let restoreId: string | null = initialUrlRef.current?.m ?? null;
            if (!restoreId && typeof window !== 'undefined') {
              const myPk = useAuthStore.getState().profile?.pubkey ?? null;
              const unread = useNotificationStore.getState().channelUnreads[chosenChannel] || 0;
              if (myPk && unread === 0) {
                try {
                  restoreId = localStorage.getItem(`chat:lastSeen:${myPk}:${chosenChannel}`);
                } catch {
                  restoreId = null;
                }
              }
            }
            if (restoreId) {
              pendingHighlightRef.current = {
                channelId: chosenChannel,
                messageId: restoreId,
              };
            }
          }
          initialUrlAppliedRef.current.channel = true;
          setActiveChannel(chosenChannel);
        }
      } catch (err) {
        console.error('Failed to fetch channels:', err);
      }
    };

    fetchChannels();
  }, [sessionChecked, activeServerId, setChannels, setActiveChannel]);

  // popstate: when a rendered #channel-link pill is clicked (or browser
  // back/forward fires), re-read ?c/?m/?p and navigate in-app. The slug is
  // resolved via the same endpoint used on initial mount.
  useEffect(() => {
    if (!sessionChecked) return;
    const onPop = async () => {
      if (typeof window === 'undefined') return;
      const sp = new URLSearchParams(window.location.search);
      const c = sp.get('c');
      const m = sp.get('m');
      const p = sp.get('p');
      if (!c) return;
      const looksLikeCuid = /^[a-z0-9]{20,32}$/i.test(c) && !c.includes('-');
      let serverId: string | null = null;
      let channelId: string | null = null;
      if (looksLikeCuid) {
        channelId = c;
      } else {
        try {
          const res = await fetch(
            `/api/channels/resolve-slug?c=${encodeURIComponent(c)}`,
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.serverId && data?.channelId) {
              serverId = data.serverId;
              channelId = data.channelId;
            }
          }
        } catch { /* ignore */ }
      }
      if (!channelId) return;
      if (serverId && serverId !== useChatStore.getState().activeServerId) {
        setActiveServer(serverId);
      }
      if (channelId !== useChatStore.getState().activeChannelId) {
        if (m) {
          pendingHighlightRef.current = { channelId, messageId: m };
        }
        setActiveChannel(channelId);
      } else if (m) {
        // Already on the right channel — just trigger the highlight if the
        // target message is loaded; otherwise fetch ?around=.
        const msgs = useChatStore.getState().messages;
        if (msgs.some((x) => x.id === m)) {
          useChatStore.setState({ highlightedMessageId: m });
        } else {
          try {
            const r = await fetch(
              `/api/channels/${channelId}/messages?around=${encodeURIComponent(m)}`,
            );
            if (r.ok) {
              const d = await r.json();
              useChatStore.getState().setMessages(d.messages);
              useChatStore.getState().setMessageCursor(d.nextCursor ?? null, !!d.nextCursor);
              if (d.messages.some((x: any) => x.id === m)) {
                useChatStore.setState({ highlightedMessageId: m });
              }
            }
          } catch { /* ignore */ }
        }
      }
      if (p) {
        setInitialForumPostId(p);
        setActivePostId(p);
      } else {
        setActivePostId(null);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sessionChecked, setActiveServer, setActiveChannel, setActivePostId]);

  // Fetch all member profiles for the profileCache. Any members with null
  // profile fields will be filled in automatically by the server's
  // `triggerBackgroundRefreshIfStale` on GET /api/members — no client-side
  // NDK fallback needed.
  useEffect(() => {
    if (!profileSynced || !activeServerId) return;

    const fetchMembers = async () => {
      try {
        const res = await fetch(`/api/members?serverId=${encodeURIComponent(activeServerId)}`);
        if (!res.ok) return;
        const data = await res.json();
        const memberInfoList: MemberInfo[] = [];
        for (const member of data.members) {
          const name = member.nickname || member.displayName || undefined;
          const picture = member.picture || undefined;
          profileCache.set(member.pubkey, { name, picture });
          memberInfoList.push({
            pubkey: member.pubkey,
            displayName: name || shortNpub(member.pubkey),
            picture,
            role: member.role,
            customRoles: member.customRoles?.map((cr: { role: { id: string; name: string; color: string; icon?: string | null; priority: number } }) => cr.role),
            banner: member.banner || undefined,
            nip05: member.nip05 || undefined,
            about: member.about || undefined,
            joinedAt: member.joinedAt,
            isBot: member.isBot,
            botType: member.botType,
            statusText: member.statusText ?? null,
          });
        }
        setMemberList(memberInfoList);
      } catch {
        // Silently fail — profiles will show pubkey fallback
      }
    };

    fetchMembers();
  }, [profileSynced, activeServerId, profileCache, setMemberList]);

  // Fetch the authed user's role on the active server so the UI can gate
  // admin-only affordances (pinning, etc). API enforces auth regardless —
  // this just controls which buttons are visible.
  useEffect(() => {
    if (!sessionChecked || !activeServerId) {
      setMyRole(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/auth/me/role?serverId=${encodeURIComponent(activeServerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.role) setMyRole(data.role);
        else setMyRole('member');
      })
      .catch(() => {
        if (!cancelled) setMyRole('member');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionChecked, activeServerId, setMyRole]);

  // Fetch custom server emojis so `:name:` shortcodes resolve in messages
  // and reactions. Silently fall back to an empty map on error — messages
  // render the raw `:name:` text which is the intended degradation.
  useEffect(() => {
    if (!activeServerId) {
      setServerEmojis({});
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/emojis?serverId=${encodeURIComponent(activeServerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.emojis) return;
        const map: Record<string, string> = {};
        for (const e of data.emojis) map[e.name] = e.url;
        setServerEmojis(map);
      })
      .catch(() => {
        if (!cancelled) setServerEmojis({});
      });
    return () => {
      cancelled = true;
    };
  }, [activeServerId, setServerEmojis]);

  // Fetch the server's GIF library so the composer's GIF picker has content
  // to show. Same fail-soft pattern as emojis — on error, leave the picker
  // empty rather than blocking the UI.
  useEffect(() => {
    if (!activeServerId) {
      setServerGifs([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/gifs?serverId=${encodeURIComponent(activeServerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.gifs) return;
        setServerGifs(data.gifs);
      })
      .catch(() => {
        if (!cancelled) setServerGifs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeServerId, setServerGifs]);

  // Seed the profileCache with the "system bot" entry (all-zero pubkey) using
  // the active server's name + icon. This makes welcome-bot / pinned-system
  // messages render with the server logo instead of a generic placeholder,
  // both for Socket.io messages and REST-loaded history.
  useEffect(() => {
    if (!activeServerId) return;
    const active = servers.find((s) => s.id === activeServerId);
    if (!active) return;
    const SYSTEM_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
    profileCache.set(SYSTEM_PUBKEY, {
      name: active.name,
      picture: active.icon || undefined,
    });
    // Zap Bot: dedicated pseudo-author for `/zap` announcements so the zapper's
    // npub isn't shown as the message author. Rendered with a ⚡ avatar.
    const ZAP_BOT_PUBKEY = '000000000000000000000000000000000000000000000000000000007a617000';
    profileCache.set(ZAP_BOT_PUBKEY, {
      name: 'Zap Bot',
      picture: '/bots/zap.svg',
    });
  }, [activeServerId, servers, profileCache]);

  // Discover DM threads lazily: we only hit relays (and publish our NIP-17
  // inbox relay list) the first time the user enters DM mode, not on chat
  // page mount. Fetching on every chat load would burn signer popups for
  // users who never open DMs during a session. The ref makes repeated
  // sidebar toggles a no-op; the refresh button in DMList calls the helper
  // below directly to force a re-sync.
  const dmDiscoveryRanRef = useRef(false);

  const runDMDiscovery = useCallback(
    async (force = false) => {
      if (!profile?.pubkey) return;
      const myPubkey = profile.pubkey;

      useDMStore.getState().setLoadingThreads(true);

      const threadsFromMap = (threadMap: Map<string, { lastMessage: string; lastMessageAt: number; protocol: 'nip04' | 'nip17' }>) =>
        Array.from(threadMap.entries())
          .sort((a, b) => b[1].lastMessageAt - a[1].lastMessageAt)
          .map(([pubkey, info]) => {
            const cached = profileCache.get(pubkey);
            const existing = useDMStore.getState().threads.find((t) => t.pubkey === pubkey);
            return {
              pubkey,
              displayName: cached?.name || formatPubkey(pubkey),
              picture: cached?.picture,
              lastMessage: info.lastMessage,
              lastMessageAt: info.lastMessageAt,
              unreadCount: existing?.unreadCount ?? 0,
              protocol: info.protocol,
            };
          });

      const recomputeUnreads = () => {
        const { readCursors } = useDMStore.getState();
        const counts = computeUnreadCounts(myPubkey, readCursors);
        useNotificationStore.getState().setDMUnreads(counts);
        const currentThreads = useDMStore.getState().threads;
        useDMStore.getState().setThreads(
          currentThreads.map((t) => ({ ...t, unreadCount: counts[t.pubkey] ?? 0 })),
        );
      };

      try {
        // Phase A returns immediately from the localStorage cache.
        const cachedMap = await discoverDMThreads(myPubkey, {
          forceFullScan: force,
          onUpdate: (updatedMap) => {
            // Phase B (relay sync) finished — re-render with fresh data and
            // flip the spinner off once we have real data.
            useDMStore.getState().setThreads(threadsFromMap(updatedMap));
            useDMStore.getState().setLoadingThreads(false);
            recomputeUnreads();
          },
        });

        const hasCache = cachedMap.size > 0;
        useDMStore.getState().setThreads(threadsFromMap(cachedMap));
        // If Phase A was empty, keep the spinner on — Phase B will clear it
        // via onUpdate once relays respond. Otherwise show the cached view now.
        if (hasCache) {
          useDMStore.getState().setLoadingThreads(false);
          recomputeUnreads();
        }

        // Publish inbox relays lazily, same gate as discovery.
        void publishInboxRelays(myPubkey);
      } catch {
        useDMStore.getState().setLoadingThreads(false);
      }
    },
    [profile?.pubkey, profileCache],
  );

  // Trigger the first discovery pass the moment the user enters DM mode,
  // then keep re-polling every DM_POLL_INTERVAL_MS while the user stays in
  // the DM view so new messages trickle in without a manual refresh.
  // On toggle-off the interval is torn down — we don't want to hold a
  // DM subscription open while the user is in a regular channel.
  useEffect(() => {
    if (!DM_FEATURE_ENABLED) return;
    console.log('[dm] effect fired', {
      isDMMode,
      ndkReady,
      pubkey: profile?.pubkey,
      signer: !!getNDK().signer,
      alreadyRan: dmDiscoveryRanRef.current,
    });
    if (!isDMMode || !ndkReady || !profile?.pubkey) return;

    const myPubkey = profile.pubkey;

    // First-time gate: on initial entry, also register NIP-17 inbox relays
    // (and resolve user's kind 10050 list). This opens AUTH-required relays
    // via the policy set in getNDK(). Subsequent entries skip this work.
    if (!dmDiscoveryRanRef.current) {
      dmDiscoveryRanRef.current = true;
      void addDMInboxRelays(myPubkey).then(() => runDMDiscovery());
    } else {
      void runDMDiscovery();
    }

    const DM_POLL_INTERVAL_MS = 60_000;
    const interval = setInterval(() => {
      // Incremental poll — the sync state inside discoverDMThreads already
      // narrows the filter to `since = lastPollAt`, so this is cheap.
      void runDMDiscovery();
    }, DM_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isDMMode, ndkReady, profile?.pubkey, runDMDiscovery]);

  // Reset the guard whenever the user logs out / switches accounts so the
  // next login re-runs discovery for the new pubkey.
  useEffect(() => {
    dmDiscoveryRanRef.current = false;
  }, [profile?.pubkey]);

  // Subscribe to incoming DMs (NIP-04 + NIP-17). Gated on isDMMode so we
  // don't open a history-replaying subscription (NDK fetches until EOSE
  // before streaming) on every chat page load — the user explicitly wants
  // DM traffic to happen only when they're in the DM view. Notifications
  // while browsing channels are intentionally deferred until they switch.
  useEffect(() => {
    if (!DM_FEATURE_ENABLED) return;
    if (!isDMMode || !ndkReady || !profile?.pubkey) return;

    const cleanup = subscribeDMs(profile.pubkey, (msg: DMMessage) => {
      const dmStore = useDMStore.getState();
      const otherPubkey = msg.senderPubkey === profile.pubkey
        ? msg.recipientPubkey
        : msg.senderPubkey;
      const isOwnMessage = msg.senderPubkey === profile.pubkey;

      // Never increment unread for your own outgoing messages, and never
      // auto-clear on incoming — useReadTracker decides that based on
      // visibility + focus. `handleIncomingDM` also mirrors the count into
      // the notification store so the favicon badge reflects DMs.
      const existingThread = dmStore.threads.find(t => t.pubkey === otherPubkey);
      const currentUnread = existingThread?.unreadCount ?? 0;
      const { nextUnread } = handleIncomingDM(otherPubkey, isOwnMessage, currentUnread);
      if (existingThread) {
        dmStore.updateThread(otherPubkey, {
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unreadCount: nextUnread,
        });
      } else {
        const cached = profileCache.get(otherPubkey);
        dmStore.addThread({
          pubkey: otherPubkey,
          displayName: cached?.name || formatPubkey(otherPubkey),
          picture: cached?.picture,
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unreadCount: nextUnread,
        });
      }

      // Add to active conversation if viewing this thread
      if (dmStore.activeDMPubkey === otherPubkey) {
        // Avoid duplicates
        const exists = dmStore.messages.some(m => m.id === msg.id);
        if (!exists) {
          dmStore.addMessage(msg);
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [isDMMode, ndkReady, profile?.pubkey, profileCache]);

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
      socket.emit('presence-sync', (pubkeys: string[]) => {
        useChatStore.getState().setOnlinePubkeys(pubkeys);
      });
      // Reconnect may have missed events; let the unread-fetch effect
      // reconcile from `/api/unread` as the source of truth.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('obelisk:unread-refresh'));
      }
    });

    socket.on('presence-update', ({ pubkey: pk, online }: { pubkey: string; online: boolean }) => {
      useChatStore.getState().setPresence(pk, online);
    });

    socket.on('bot-updated', (update: { serverId: string; id: string; type: string; displayName?: string; avatarUrl?: string; lastValue?: string }) => {
      const state = useChatStore.getState();
      if (state.activeServerId && update.serverId !== state.activeServerId) return;
      state.applyBotUpdate(update);
    });

    socket.on('new-message', (message: Message) => {
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

    socket.on('message-deleted', ({ messageId }: { messageId: string }) => {
      removeMessage(messageId);
    });

    socket.on('message-edited', (message: Message) => {
      updateMessage(message.id, message.content, message.editedAt!);
    });

    socket.on('reaction-updated', ({ messageId, reactions }: { messageId: string; reactions: any[] }) => {
      updateReactions(messageId, reactions);
    });

    socket.on('message-pinned', (message: Message) => {
      useChatStore.getState().updatePinState(
        message.id,
        message.pinnedAt ?? null,
        message.pinnedByPubkey ?? null,
      );
    });

    socket.on('force-disconnect', ({ reason }: { reason: string }) => {
      alert(reason);
      // Reset title + favicon explicitly in case the layout switch tears
      // down `useFaviconBadge` before its cleanup can run.
      document.title = 'Obelisk';
      void clearBadge();
      logout();
      router.push('/');
    });

    socket.on('user-typing', ({ pubkey: typerPubkey, channelId: ch }: { pubkey: string; channelId: string }) => {
      if (ch === activeChannelIdRef.current && typerPubkey !== profile?.pubkey) {
        setTyping(typerPubkey);
      }
    });

    socket.on('invoice-paid', (data: { paymentHash: string; payerPubkey: string; paidAt: string }) => {
      useChatStore.getState().markInvoicePaid({
        paymentHash: data.paymentHash,
        payerPubkey: data.payerPubkey,
        paidAt: typeof data.paidAt === 'string' ? data.paidAt : new Date(data.paidAt).toISOString(),
      });
    });

    socket.on('message-error', ({ error }: { error: string }) => {
      setMessageError(error);
      setTimeout(() => setMessageError(null), 5000);
    });

    socket.on('voice-state-update', ({ channelId, participants }: { channelId: string; participants: any[] }) => {
      const voiceStore = useVoiceStore.getState();
      // Update if we're in this voice channel OR currently viewing it
      if (voiceStore.currentVoiceChannelId === channelId || activeChannelIdRef.current === channelId) {
        voiceStore.setParticipants(participants);
      }
    });

    // Track remote video/screen state in the store
    socket.on('voice-video-start', ({ pubkey: pk }: { pubkey: string }) => {
      useVoiceStore.getState().addRemoteVideo(pk);
    });
    socket.on('voice-video-stop', ({ pubkey: pk }: { pubkey: string }) => {
      useVoiceStore.getState().removeRemoteVideo(pk);
    });
    socket.on('voice-screen-start', ({ pubkey: pk }: { pubkey: string }) => {
      useVoiceStore.getState().addRemoteScreen(pk);
    });
    socket.on('voice-screen-stop', ({ pubkey: pk }: { pubkey: string }) => {
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
    socket.on('notification', (data: { recipientPubkey?: string; type: string; channelId?: string; postId?: string; serverId?: string; messageId?: string; senderPubkey: string; preview?: string; createdAt?: string }) => {
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
        playMentionSound();
        pushToInbox();
        const watchingChannel = isUserWatchingChannel(data.channelId);
        const watchingPost = data.postId
          ? useChatStore.getState().activePostId === data.postId
          : false;
        if (watchingChannel && (!data.postId || watchingPost)) return;
        notifStore.setChannelMention(data.channelId, true);
        if (data.postId) {
          notifStore.setPostMention(data.postId, true);
        }
      } else if (data.type === 'dm') {
        notifStore.setDMUnread(data.senderPubkey, (notifStore.dmUnreads[data.senderPubkey] || 0) + 1);
        pushToInbox();
      }
    });

    // Cross-device / other-tab read sync. Fired by server.ts after it
    // persists a `mark-read` or `dm-read` from any of this user's other
    // sockets. Clears the local unread state without another DB round-trip.
    socket.on('read-update', (data: { recipientPubkey?: string; channelId: string }) => {
      if (isStaleSession() || isForOtherUser(data)) return;
      useNotificationStore.getState().clearChannelUnread(data.channelId);
    });

    // Sibling tab / device opened the channel and cleared the mention dot.
    // Only clears the mention flag — count stays until a full `read-update`.
    socket.on('mention-read-update', (data: { recipientPubkey?: string; channelId: string }) => {
      if (isStaleSession() || isForOtherUser(data)) return;
      useNotificationStore.getState().clearChannelMention(data.channelId);
    });

    socket.on('dm-read-update', (data: { recipientPubkey?: string; pubkey: string }) => {
      if (isStaleSession() || isForOtherUser(data)) return;
      const otherPubkey = data.pubkey;
      useNotificationStore.getState().clearDMUnread(otherPubkey);
      useDMStore.getState().updateThread(otherPubkey, { unreadCount: 0 });
    });

    socket.on('unread-update', (data: { recipientPubkey?: string; channelId: string; serverId: string; hasMention: boolean; preview?: string }) => {
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

    socket.on('post-unread', (data: { recipientPubkey?: string; postId: string; messageId: string; authorPubkey: string; hasMention?: boolean }) => {
      if (isStaleSession() || isForOtherUser(data)) return;
      if (data.postId === useChatStore.getState().activePostId) return;
      useNotificationStore.getState().incrementPostUnread(data.postId, data.hasMention);
    });

    // Fired when the server auto-subscribes the viewer to a forum post
    // (e.g. because they were @-mentioned in it). Thread the post meta
    // straight into followedPostIds/Meta so the thread row appears under
    // its forum channel in the sidebar without a refetch.
    socket.on('post-subscribed', (data: { postId: string; title: string; channelId: string; channelName: string; serverId: string }) => {
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
    socket.on('game-created', onGameEvent);
    socket.on('game-updated', onGameEvent);
    socket.on('game-finished', onGameEvent);
    socket.on('game-turn', (data: { gameId: string; currentTurn: string; turnDeadline: string; type: string }) => {
      if (data.currentTurn !== profile?.pubkey) return;
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
  }, [sessionChecked, profile?.pubkey, addMessage, removeMessage, updateMessage, updateReactions, logout, router]);

  // Keep URL query params (?s=, ?c=) in sync with active server/channel so
  // that a browser refresh lands the user back on the same spot. The ?m=
  // param (scroll anchor) is managed separately by MessageArea on scroll —
  // we clear it on channel change so the stale message id from the previous
  // channel doesn't leak into the new one.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (activeServerId) sp.set('s', activeServerId);
    else sp.delete('s');
    if (activeChannelId) {
      sp.set('c', activeChannelId);
      sp.delete('m');
    } else {
      sp.delete('c');
      sp.delete('m');
    }
    if (activePostId) sp.set('p', activePostId);
    else sp.delete('p');
    const qs = sp.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [activeServerId, activeChannelId, activePostId]);

  // Join/leave channel rooms. Mark-as-read is deliberately NOT triggered here
  // anymore — useReadTracker below decides when the channel actually becomes
  // "seen" based on visibility + focus + scroll position. Clicking into a
  // channel while backgrounded or scrolled up no longer clears its unread.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    if (prevChannelRef.current) {
      socket.emit('leave-channel', prevChannelRef.current);
    }
    if (activeChannelId) {
      socket.emit('join-channel', activeChannelId);
    }
    prevChannelRef.current = activeChannelId;
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  // When the user enters fullscreen on a game, force the active channel to
  // the game's host channel so the reused MessageArea/MessageInput renders
  // the right chat. If the user later navigates to another channel, drop
  // fullscreen and fall back to the floating dock so they can see normal
  // channel content.
  const fullscreenGameChannelId = useGamesStore((s) => {
    const id = s.fullscreenGameId;
    return id ? s.games[id]?.channelId ?? null : null;
  });
  useEffect(() => {
    if (!fullscreenGameChannelId) return;
    const current = useChatStore.getState().activeChannelId;
    if (current !== fullscreenGameChannelId) {
      useChatStore.getState().setActiveChannel(fullscreenGameChannelId);
    }
  }, [fullscreenGameChannelId]);
  useEffect(() => {
    const fsId = useGamesStore.getState().fullscreenGameId;
    if (!fsId) return;
    const g = useGamesStore.getState().games[fsId];
    if (!g) return;
    if (activeChannelId && activeChannelId !== g.channelId) {
      useGamesStore.getState().setFullscreenGame(null);
      useGamesStore.getState().setOpenGame(fsId);
      useGamesStore.getState().setMinimized(true);
    }
  }, [activeChannelId]);

  // Join the active server room so game-* broadcasts (Actividades panel
  // live updates) reach this socket while this server is the active one.
  const prevServerRef = useRef<string | null>(null);
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (prevServerRef.current) socket.emit('leave-server', prevServerRef.current);
    if (activeServerId) socket.emit('join-server', activeServerId);
    prevServerRef.current = activeServerId;
  }, [activeServerId]);

  // Bridge for the jump-to-latest pill in MessageArea: when the user clicks
  // it and reaches the bottom, the pill clears unread locally and dispatches
  // this event so we can emit `mark-read` over the socket. We can't emit
  // directly from MessageArea — the socket lives in a ref here.
  useEffect(() => {
    const onMarkRead = (e: Event) => {
      const detail = (e as CustomEvent<{ channelId: string; lastMessageId?: string }>).detail;
      if (!detail?.channelId) return;
      const socket = socketRef.current;
      if (!socket) return;
      socket.emit('mark-read', {
        channelId: detail.channelId,
        lastMessageId: detail.lastMessageId,
      });
      const myPk = profilePubkeyRef.current;
      if (myPk) {
        // Mirror to sibling tabs so the same-browser broadcast clears them too.
        import('@/lib/notification-broadcast').then(({ postClearChannel }) => {
          postClearChannel(myPk, detail.channelId);
        });
      }
    };
    window.addEventListener('obelisk:mark-read', onMarkRead);
    return () => window.removeEventListener('obelisk:mark-read', onMarkRead);
  }, []);

  // Same-browser multi-tab sync: mirror clear events posted by sibling
  // tabs into this tab's notification + DM store. (scenario 11, same
  // browser.) Cross-device sync is handled by the Socket.io read-update
  // events above.
  useEffect(() => {
    const unsub = subscribeBroadcast((msg) => {
      // Pubkey scope: drop any clear from a sibling tab logged in as a
      // different user, so cross-account tab switches don't leak reads.
      const myPk = profilePubkeyRef.current;
      if (!myPk || msg.senderPubkey !== myPk) return;
      if (msg.kind === 'clear-channel') {
        useNotificationStore.getState().clearChannelUnread(msg.channelId);
      } else if (msg.kind === 'clear-dm') {
        useNotificationStore.getState().clearDMUnread(msg.pubkey);
        useDMStore.getState().updateThread(msg.pubkey, { unreadCount: 0 });
      }
    });
    return unsub;
  }, []);

  // Centralized mark-as-read gating (visibility + focus + scroll-to-bottom).
  useReadTracker(socketInstance);

  // Mirror unread total into favicon + document.title (Discord-style).
  useFaviconBadge();

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
  }, [activeChannelId, activePostId]);

  // Edit message via socket
  const handleEdit = useCallback((messageId: string, content: string) => {
    const socket = socketRef.current;
    if (!socket || !activeChannelId) return;
    socket.emit('edit-message', { messageId, channelId: activeChannelId, content });
    setEditingMessage(null);
  }, [activeChannelId, setEditingMessage]);

  // Toggle reaction via socket
  const handleToggleReaction = useCallback((messageId: string, emoji: string) => {
    const socket = socketRef.current;
    if (!socket || !activeChannelId) return;
    socket.emit('toggle-reaction', { messageId, channelId: activeChannelId, emoji });
  }, [activeChannelId]);

  // Delete own message via socket
  const handleDelete = useCallback((messageId: string) => {
    const socket = socketRef.current;
    if (!socket || !activeChannelId) return;
    socket.emit('delete-message', { messageId, channelId: activeChannelId });
  }, [activeChannelId]);

  // Typing indicator emit
  const handleTyping = useCallback(() => {
    const socket = socketRef.current;
    if (socket && activeChannelId) {
      socket.emit('typing', activeChannelId);
    }
  }, [activeChannelId]);

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
  }, []);

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
  }, []);

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
  }, []);

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
  }, []);

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
  }, []);

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

  const voiceMainRef = useRef<HTMLDivElement>(null);
  const VOICE_CHAT_MIN = 280;
  const VOICE_CHAT_MAX = 720;
  const [voiceChatWidth, setVoiceChatWidth] = useState(400);
  useEffect(() => {
    const saved = Number(localStorage.getItem('obelisk:voice-chat-width'));
    if (saved >= VOICE_CHAT_MIN && saved <= VOICE_CHAT_MAX) setVoiceChatWidth(saved);
  }, []);
  // On open transition (closed→open), default to half the current voice area width.
  const prevVoiceChatOpenRef = useRef(isVoiceChatOpen);
  useEffect(() => {
    const prev = prevVoiceChatOpenRef.current;
    prevVoiceChatOpenRef.current = isVoiceChatOpen;
    if (!prev && isVoiceChatOpen && voiceMainRef.current) {
      const w = voiceMainRef.current.getBoundingClientRect().width;
      const half = Math.max(VOICE_CHAT_MIN, Math.min(VOICE_CHAT_MAX, Math.round(w / 2)));
      setVoiceChatWidth(half);
      localStorage.setItem('obelisk:voice-chat-width', String(half));
    }
  }, [isVoiceChatOpen]);
  const onVoiceChatResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = voiceChatWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.max(VOICE_CHAT_MIN, Math.min(VOICE_CHAT_MAX, startW + delta));
      setVoiceChatWidth(next);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      localStorage.setItem('obelisk:voice-chat-width', String((document.getElementById('voice-chat-rail') as HTMLElement | null)?.offsetWidth || 0));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [voiceChatWidth]);

  // No valid session — show login modal with matrix background
  if (sessionInvalid) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black lc-grid-bg relative">
        <ShootingStars />
        <LoginModal
          isOpen={true}
          transparentBackdrop
          onClose={() => router.push('/')}
          onSuccess={() => {
            setSessionInvalid(false);
            sessionCheckStarted.current = false;
            restoreSession().then((valid) => {
              if (valid) setSessionChecked(true);
            });
          }}
        />
      </div>
    );
  }

  // Loading state while checking session
  if (!sessionChecked) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="flex flex-col items-center gap-3">
          <div className="lc-spinner" style={{ width: 32, height: 32 }} />
          <span className="text-sm text-lc-muted">Loading...</span>
        </div>
      </div>
    );
  }

  // Logout wipes the auth store and schedules router.push('/') via the effect
  // above — render nothing in the meantime so the chat UI (and especially the
  // "No servers yet" empty state) doesn't flash on the way out.
  if (!profile?.pubkey) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="flex flex-col items-center gap-3">
          <div className="lc-spinner" style={{ width: 32, height: 32 }} />
          <span className="text-sm text-lc-muted">Loading...</span>
        </div>
      </div>
    );
  }

  // Standalone full-screen empty state when not in any servers and not in DM mode.
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
                      alert(data.error || 'Failed to join default server');
                    }
                  } catch {
                    alert('Error joining default server');
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
        {DM_FEATURE_ENABLED && isDMMode ? (
          <>
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
          </>
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
