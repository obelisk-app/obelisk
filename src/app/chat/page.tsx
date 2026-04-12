'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth';
import { useChatStore, Message, MemberInfo } from '@/store/chat';
import ServerBar from '@/components/chat/ServerBar';
import ChannelSidebar from '@/components/chat/ChannelSidebar';
import MessageArea from '@/components/chat/MessageArea';
import PinnedMessagesPanel from '@/components/chat/PinnedMessagesPanel';
import MessageInput from '@/components/chat/MessageInput';
import ForumView from '@/components/chat/ForumView';
import ChannelTopicModal from '@/components/chat/ChannelTopicModal';
import ChannelEmoji from '@/components/chat/ChannelEmoji';
import SearchBar from '@/components/chat/SearchBar';
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
  const {
    servers,
    activeServerId,
    activeChannelId,
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
  const initialUrlRef = useRef<{ s: string | null; c: string | null; m: string | null } | null>(null);
  if (initialUrlRef.current === null) {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      initialUrlRef.current = { s: sp.get('s'), c: sp.get('c'), m: sp.get('m') };
    } else {
      initialUrlRef.current = { s: null, c: null, m: null };
    }
  }
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

    // nsec login stores the private key only in memory — on page reload the
    // signer is gone and cannot be restored. Log out and show the login modal
    // so the user can re-enter their nsec (or pick another method).
    if (loginMethod === 'nsec' && !ndk.signer) {
      logout();
      setSessionChecked(false);
      setSessionInvalid(true);
      return;
    }

    connectNDK().then(async () => {
      if (!ndk.signer && loginMethod === 'extension' && typeof window !== 'undefined' && window.nostr) {
        const { NDKNip07Signer } = await import('@nostr-dev-kit/ndk');
        ndk.signer = new NDKNip07Signer(4000, ndk);
      }
      // Bunker / NostrConnect: rebuild the signer from the payload stashed
      // in localStorage at login. Without this the signer dies on every
      // reload and DMs silently fail.
      if (!ndk.signer && loginMethod === 'bunker') {
        const ok = await restoreRemoteSigner();
        if (!ok) console.warn('[chat] bunker signer restore failed');
      }
      setNdkReady(true);
    }).catch((err) => {
      console.warn('Failed to restore NDK connection:', err);
      setNdkReady(true); // still mark ready so DM UI doesn't hang
    });
  }, [sessionChecked, logout]);

  // Add own profile to cache
  useEffect(() => {
    if (profile) {
      profileCache.set(profile.pubkey, {
        name: profile.displayName || profile.name,
        picture: profile.picture,
      });
      profilePubkeyRef.current = profile.pubkey;
    } else {
      profilePubkeyRef.current = null;
    }
  }, [profile, profileCache]);

  // `restoreSession` in the auth store already triggers the canonical
  // server-side profile sync via `/api/members/me/sync-nostr`. No client-side
  // PATCH is needed here — previously this component re-sent Zustand-cached
  // profile values (which could be stale) and caused write drift.
  const profileSynced = sessionChecked;

  // Fetch user's servers on mount
  useEffect(() => {
    if (!sessionChecked) return;

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
  }, [sessionChecked, setServers, setActiveServer]);

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
      addMessage(message);

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
    socket.on('notification', (data: { type: string; channelId?: string; serverId?: string; senderPubkey: string; preview?: string }) => {
      const notifStore = useNotificationStore.getState();
      const isMentionLike = data.type === 'mention' || data.type === 'reply';
      if (isMentionLike && data.channelId) {
        // Skip flag set if the user is actively watching this channel —
        // otherwise the mention dot would stick around until the next
        // unread flush, which won't re-trigger because the count is 0.
        if (isUserWatchingChannel(data.channelId)) return;
        // Set mention flag without touching the count.
        notifStore.setChannelUnread(
          data.channelId,
          notifStore.channelUnreads[data.channelId] || 0,
          true,
        );
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
    const qs = sp.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [activeServerId, activeChannelId]);

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

  // Fetch messages when channel changes
  useEffect(() => {
    if (!activeChannelId) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/channels/${activeChannelId}/messages`);
        if (!res.ok) return;
        const data = await res.json();
        setMessages(data.messages);
        setMessageCursor(data.nextCursor ?? null, !!data.nextCursor);

        // Refresh-restore: if a highlight was queued for this channel (from
        // URL ?m= or per-channel localStorage), and the target message is in
        // the freshly-loaded batch, kick MessageArea into scrolling there.
        // Messages outside the latest page are silently skipped — the user
        // just lands at the bottom, which is the same behavior as today.
        const pending = pendingHighlightRef.current;
        if (pending && pending.channelId === activeChannelId) {
          pendingHighlightRef.current = null;
          if (data.messages.some((m: any) => m.id === pending.messageId)) {
            useChatStore.setState({ highlightedMessageId: pending.messageId });
          }
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
        setLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [activeChannelId, setMessages, setLoadingMessages, setMessageCursor]);

  // Send message via socket (with optional replyToId)
  const handleSend = useCallback((content: string, replyToId?: string) => {
    const socket = socketRef.current;
    if (!socket || !activeChannelId) return;
    socket.emit('send-message', { channelId: activeChannelId, content, replyToId });
  }, [activeChannelId]);

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
      voiceStore.setVoiceChannel(channelId);
      await client.join(channelId);
      voiceClientRef.current = client;
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

  const handleToggleVoiceMute = useCallback(() => {
    const socket = socketRef.current;
    const voiceStore = useVoiceStore.getState();
    const channelId = voiceStore.currentVoiceChannelId;
    const newMuted = !voiceStore.isMuted;
    voiceStore.setMuted(newMuted);

    if (voiceClientRef.current) {
      if (newMuted) voiceClientRef.current.mute();
      else voiceClientRef.current.unmute();
    }
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
      console.error('Camera error:', err);
      useVoiceStore.getState().setError(err?.message || 'Failed to start camera');
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
      if (err?.name !== 'NotAllowedError') {
        console.error('Screen share error:', err);
        useVoiceStore.getState().setError(err?.message || 'Failed to share screen');
      }
    }
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
                      <h3 className="font-semibold text-lc-white text-sm truncate shrink-0">{activeChannel.name}</h3>
                      {activeChannel.description && (
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
                  {activeChannel && activeChannelId && activeChannel.type !== 'forum' && activeChannel.type !== 'voice' && (
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
              {activeChannel?.type === 'forum' ? (
                <ForumView
                  channelId={activeChannel.id}
                  channelName={activeChannel.name}
                  profileCache={profileCache}
                  availableTags={activeChannel.forumTags}
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
    </div>
  );
}
