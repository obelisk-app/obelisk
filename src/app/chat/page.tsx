'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth';
import { useChatStore, Message, MemberInfo } from '@/store/chat';
import ServerBar from '@/components/chat/ServerBar';
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
import { useSearchStore } from '@/store/search';
import DMList from '@/components/dm/DMList';
import DMChat from '@/components/dm/DMChat';
import NewDMModal from '@/components/dm/NewDMModal';
import ProtocolPrompt from '@/components/dm/ProtocolPrompt';
import VoiceChannel from '@/components/chat/VoiceChannel';
import { useDMStore } from '@/store/dm';
import { useVoiceStore } from '@/store/voice';
import { WebSocketVoiceClient } from '@/lib/voice';
import { discoverDMThreads, subscribeDMs, computeUnreadCounts } from '@/lib/dm';
import type { DMMessage } from '@/lib/dm';
import { publishInboxRelays } from '@/lib/dm-inbox';
import { formatPubkey, getNDK, connectNDK, addDMInboxRelays, restoreRemoteSigner } from '@/lib/nostr';
import { DM_FEATURE_ENABLED } from '@/lib/feature-flags';
import { shortNpub } from '@/lib/mentions';
import {
  isUserWatchingChannel,
  handleIncomingChannelMessage,
  handleIncomingDM,
} from '@/lib/read-gates';
import MemberList from '@/components/chat/MemberList';
import LoginModal from '@/components/LoginModal';
import ShootingStars from '@/components/ShootingStars';
import { useNotificationStore } from '@/store/notification';
import { requestNotificationPermission, showBrowserNotification } from '@/lib/browser-notifications';
import { useReadTracker } from '@/hooks/useReadTracker';
import { useFaviconBadge } from '@/hooks/useFaviconBadge';
import { subscribeBroadcast } from '@/lib/notification-broadcast';
import { clearBadge } from '@/lib/favicon-badge';

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
  const { isConnected, profile, logout, restoreSession } = useAuthStore();
  const isSearchOpen = useSearchStore((s) => s.isOpen);
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
    setMemberList,
    setMyRole,
    setServerEmojis,
    setServerGifs,
  } = useChatStore();
  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const voiceClientRef = useRef<WebSocketVoiceClient | null>(null);
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

  // Fetch initial unread counts
  useEffect(() => {
    if (!sessionChecked) return;
    fetch('/api/unread')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          useNotificationStore.getState().setBulkUnreads(data);
        }
      })
      .catch(() => {});
  }, [sessionChecked]);

  // Request browser notification permission after login
  useEffect(() => {
    if (!sessionChecked) return;
    requestNotificationPermission().then((granted) => {
      useNotificationStore.getState().setPermission(granted);
    });
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
          if (!initialUrlAppliedRef.current.channel) {
            let restoreId: string | null = initialUrlRef.current?.m ?? null;
            if (!restoreId && typeof window !== 'undefined') {
              try {
                restoreId = localStorage.getItem(`chat:lastSeen:${chosenChannel}`);
              } catch {
                restoreId = null;
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

    const socket = io();

    socket.on('connect', () => {
      console.log('Socket connected');
      // Snapshot currently-online pubkeys
      socket.emit('presence-sync', (pubkeys: string[]) => {
        useChatStore.getState().setOnlinePubkeys(pubkeys);
      });
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
      if (incremented && document.hidden) {
        const title = hasMention ? 'New mention' : 'New message';
        showBrowserNotification(title, message.content.slice(0, 140));
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
    socket.on('notification', (data: { type: string; channelId?: string; postId?: string; serverId?: string; senderPubkey: string; preview?: string }) => {
      const notifStore = useNotificationStore.getState();
      const isMentionLike = data.type === 'mention' || data.type === 'reply' || data.type === 'everyone';
      if (isMentionLike && data.channelId) {
        // Skip flag set if the user is actively watching this channel AND
        // (for forum posts) the specific post — otherwise the mention dot
        // would stick around until the next unread flush.
        const watchingChannel = isUserWatchingChannel(data.channelId);
        const watchingPost = data.postId
          ? useChatStore.getState().activePostId === data.postId
          : false;
        if (watchingChannel && (!data.postId || watchingPost)) return;
        // Set mention flag on the channel without touching the count.
        notifStore.setChannelUnread(
          data.channelId,
          notifStore.channelUnreads[data.channelId] || 0,
          true,
        );
        // Also flag the thread row when this mention came from a forum post.
        // Flag-only: count is bumped by the paired `post-unread` event.
        if (data.postId) {
          notifStore.setPostMention(data.postId, true);
        }
        if (document.hidden) {
          const title = data.type === 'reply' ? 'New reply' : 'New mention';
          const fallback = data.type === 'reply'
            ? 'Someone replied to your message'
            : 'You were mentioned in a message';
          showBrowserNotification(title, data.preview || fallback);
        }
      } else if (data.type === 'dm') {
        notifStore.setDMUnread(data.senderPubkey, (notifStore.dmUnreads[data.senderPubkey] || 0) + 1);
        if (document.hidden) {
          showBrowserNotification('New DM', data.preview || 'You have a new direct message');
        }
      }
    });

    // Cross-device / other-tab read sync. Fired by server.ts after it
    // persists a `mark-read` or `dm-read` from any of this user's other
    // sockets. Clears the local unread state without another DB round-trip.
    socket.on('read-update', ({ channelId }: { channelId: string }) => {
      useNotificationStore.getState().clearChannelUnread(channelId);
    });

    socket.on('dm-read-update', ({ pubkey: otherPubkey }: { pubkey: string }) => {
      useNotificationStore.getState().clearDMUnread(otherPubkey);
      useDMStore.getState().updateThread(otherPubkey, { unreadCount: 0 });
    });

    socket.on('unread-update', (data: { channelId: string; serverId: string; hasMention: boolean; preview?: string }) => {
      const notifStore = useNotificationStore.getState();
      notifStore.incrementChannelUnread(data.channelId, data.hasMention);
      // Update channel-server mapping
      if (data.serverId) {
        notifStore.setChannelServerMap({
          ...notifStore.channelServerMap,
          [data.channelId]: data.serverId,
        });
      }
      // Toast non-mention messages too (mentions are handled by the
      // `notification` event above with richer copy). Only when hidden so
      // the foreground tab isn't spammed.
      if (document.hidden && !data.hasMention) {
        showBrowserNotification('New message', data.preview || 'You have a new message');
      }
    });

    socket.on('post-unread', (data: { postId: string; messageId: string; authorPubkey: string; hasMention?: boolean }) => {
      if (data.postId === useChatStore.getState().activePostId) return;
      useNotificationStore.getState().incrementPostUnread(data.postId, data.hasMention);
    });

    // Fired when the server auto-subscribes the viewer to a forum post
    // (e.g. because they were @-mentioned in it). Thread the post meta
    // straight into followedPostIds/Meta so the thread row appears under
    // its forum channel in the sidebar without a refetch.
    socket.on('post-subscribed', (data: { postId: string; title: string; channelId: string; channelName: string; serverId: string }) => {
      const state = useChatStore.getState();
      if (state.followedPostIds.includes(data.postId)) return;
      useChatStore.setState({
        followedPostIds: [...state.followedPostIds, data.postId],
        followedPostMeta: {
          ...state.followedPostMeta,
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

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
    });

    socketRef.current = socket;
    setSocketInstance(socket);

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
      useChatStore.getState().setOnlinePubkeys([]);
    };
  }, [sessionChecked, addMessage, removeMessage, updateMessage, updateReactions, logout, router]);

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

  // Same-browser multi-tab sync: mirror clear events posted by sibling
  // tabs into this tab's notification + DM store. (scenario 11, same
  // browser.) Cross-device sync is handled by the Socket.io read-update
  // events above.
  useEffect(() => {
    const unsub = subscribeBroadcast((msg) => {
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
      const alreadyFollowing = state.followedPostIds.includes(activePostId);
      const suppressed = state.suppressedAutoFollowPostIds.includes(activePostId);
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
      const client = new WebSocketVoiceClient(socket);
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
      voiceStore.setVoiceChannel(channelId);
      await client.join(channelId);
      voiceClientRef.current = client;
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
      voiceClientRef.current.leave();
      voiceClientRef.current = null;
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

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChannelTopic, setShowChannelTopic] = useState(false);

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

  return (
    <div className="h-dvh flex bg-lc-black relative overflow-hidden">
      {/* Mobile sidebar overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebars — always visible on desktop, slide-out drawer on mobile */}
      <div className={`
        fixed inset-y-0 left-0 z-50 flex
        transform transition-transform duration-200 ease-in-out
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <ServerBar />
        {DM_FEATURE_ENABLED && isDMMode ? (
          <DMList onNewDM={() => setShowNewDMModal(true)} />
        ) : (
          <ChannelSidebar onChannelSelect={() => setSidebarOpen(false)} />
        )}
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
        ) : serversLoaded && servers.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-lc-black">
            <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-lc-dark border border-lc-border flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-lc-muted">
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-lc-white">No servers yet</h2>
              <p className="text-lc-muted text-sm leading-relaxed">
                You&apos;re not a member of any server. Ask a server admin for an invite link to get started.
              </p>
              {DM_FEATURE_ENABLED && (
                <button
                  onClick={() => useDMStore.getState().setDMMode(true)}
                  className="lc-pill-secondary text-sm px-5 py-2"
                >
                  Open Direct Messages
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {/* Top bar — channel info with mobile hamburger */}
              <div className="h-12 px-3 md:px-4 flex items-center justify-between border-b border-lc-border shrink-0 bg-lc-dark">
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
                      onJumpToMessage={(id) => {
                        /* handled by MessageArea scroll */
                      }}
                    />
                  )}
                  <SearchBar serverId={activeServerId} profileCache={profileCache} />
                </div>
              </div>

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
              {activeChannel?.type === 'forum' && activePostId ? (
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
              ) : activeChannel?.type === 'forum' ? (
                <ForumView
                  channelId={activeChannel.id}
                  channelName={activeChannel.name}
                  profileCache={profileCache}
                  availableTags={activeChannel.forumTags}
                  initialPostId={initialForumPostId}
                />
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

            {/* Member list sidebar — hidden on mobile */}
            <div className="hidden md:flex h-full">
              <MemberList profileCache={profileCache} />
            </div>
          </div>
        )}
      </div>
      <GlobalProfilePopover />
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
