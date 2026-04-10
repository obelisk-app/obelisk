'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth';
import { useChatStore, Message, MemberInfo } from '@/store/chat';
import ServerBar from '@/components/chat/ServerBar';
import ChannelSidebar from '@/components/chat/ChannelSidebar';
import MessageArea from '@/components/chat/MessageArea';
import MessageInput from '@/components/chat/MessageInput';
import ForumView from '@/components/chat/ForumView';
import SearchBar from '@/components/chat/SearchBar';
import DMList from '@/components/dm/DMList';
import DMChat from '@/components/dm/DMChat';
import NewDMModal from '@/components/dm/NewDMModal';
import ProtocolPrompt from '@/components/dm/ProtocolPrompt';
import VoiceChannel from '@/components/chat/VoiceChannel';
import { useDMStore } from '@/store/dm';
import { useVoiceStore } from '@/store/voice';
import { WebSocketVoiceClient } from '@/lib/voice';
import { discoverDMThreads, subscribeDMs } from '@/lib/dm';
import type { DMMessage } from '@/lib/dm';
import { formatPubkey, getNDK, connectNDK } from '@/lib/nostr';
import MemberList from '@/components/chat/MemberList';
import { useNotificationStore } from '@/store/notification';
import { requestNotificationPermission, showBrowserNotification } from '@/lib/browser-notifications';

function TypingIndicator({ profileCache }: { profileCache: Map<string, { name?: string; picture?: string }> }) {
  const { typingUsers } = useChatStore();
  const typingPubkeys = Object.keys(typingUsers);
  if (typingPubkeys.length === 0) return null;

  const names = typingPubkeys.map((pk) => profileCache.get(pk)?.name || pk.slice(0, 8) + '...');
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
  } = useChatStore();
  const socketRef = useRef<Socket | null>(null);
  const voiceClientRef = useRef<WebSocketVoiceClient | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const [profileCache] = useState(() => new Map<string, { name?: string; picture?: string }>());
  const [sessionChecked, setSessionChecked] = useState(false);
  const sessionCheckStarted = useRef(false);
  const [ndkReady, setNdkReady] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const { isDMMode } = useDMStore();
  const [showNewDMModal, setShowNewDMModal] = useState(false);

  // On mount, validate session with backend. If no valid session, redirect to landing.
  useEffect(() => {
    if (sessionCheckStarted.current) return;
    sessionCheckStarted.current = true;

    restoreSession().then(async (valid) => {
      if (!valid) {
        router.push('/');
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
      setNdkReady(true);
    }).catch((err) => {
      console.warn('Failed to restore NDK connection:', err);
      setNdkReady(true); // still mark ready so DM UI doesn't hang
    });
  }, [sessionChecked]);

  // Add own profile to cache
  useEffect(() => {
    if (profile) {
      profileCache.set(profile.pubkey, {
        name: profile.displayName || profile.name,
        picture: profile.picture,
      });
    }
  }, [profile, profileCache]);

  // Sync own profile to backend Member table, then fetch member list
  const [profileSynced, setProfileSynced] = useState(false);
  useEffect(() => {
    if (!sessionChecked) return;
    if (!profile) {
      setProfileSynced(true);
      return;
    }
    fetch('/api/members/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: profile.displayName || profile.name || null,
        picture: profile.picture || null,
        nip05: profile.nip05 || null,
        about: profile.about || null,
        banner: profile.banner || null,
        lud16: profile.lud16 || null,
        website: profile.website || null,
      }),
    })
      .then(() => setProfileSynced(true))
      .catch(() => setProfileSynced(true));
  }, [sessionChecked, profile]);

  // Fetch user's servers on mount
  useEffect(() => {
    if (!sessionChecked) return;

    const fetchServers = async () => {
      try {
        const res = await fetch('/api/servers');
        if (!res.ok) return;
        const data = await res.json();
        setServers(data.servers);
        if (data.servers.length > 0 && !activeServerId) {
          setActiveServer(data.servers[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch servers:', err);
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

        // Auto-select first pinned channel or first category channel
        const firstChannel = data.pinnedChannels[0]
          || data.categories[0]?.channels[0];
        if (firstChannel) {
          setActiveChannel(firstChannel.id);
        }
      } catch (err) {
        console.error('Failed to fetch channels:', err);
      }
    };

    fetchChannels();
  }, [sessionChecked, activeServerId, setChannels, setActiveChannel]);

  // Fetch all member profiles for the profileCache
  useEffect(() => {
    if (!profileSynced) return;

    const fetchMembers = async () => {
      try {
        const res = await fetch('/api/members');
        if (!res.ok) return;
        const data = await res.json();
        const memberInfoList: MemberInfo[] = [];
        const missingProfiles: string[] = [];
        for (const member of data.members) {
          const name = member.nickname || member.displayName || undefined;
          const picture = member.picture || undefined;
          profileCache.set(member.pubkey, { name, picture });
          memberInfoList.push({
            pubkey: member.pubkey,
            displayName: name || member.pubkey.slice(0, 8) + '...',
            picture,
          });
          if (!name && !picture) {
            missingProfiles.push(member.pubkey);
          }
        }
        setMemberList(memberInfoList);

        // Fetch missing profiles from Nostr relays client-side
        if (missingProfiles.length > 0) {
          const ndk = getNDK();
          for (const pubkey of missingProfiles) {
            try {
              const user = ndk.getUser({ pubkey });
              await Promise.race([
                user.fetchProfile(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
              ]);
              if (user.profile) {
                const p = user.profile;
                const name = (p.displayName || (p as Record<string, unknown>).display_name || p.name) as string | undefined;
                const picture = ((p as Record<string, unknown>).image || (p as Record<string, unknown>).picture) as string | undefined;
                if (name || picture) {
                  profileCache.set(pubkey, { name, picture });
                  // Update the member list in real-time
                  const current = useChatStore.getState().memberList;
                  const updated = current.map(m =>
                    m.pubkey === pubkey
                      ? { ...m, displayName: name || m.displayName, picture: picture || m.picture }
                      : m
                  );
                  setMemberList(updated);
                  // Sync to server DB in background
                  fetch('/api/members/sync-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pubkey, name, picture }),
                  }).catch(() => {});
                }
              }
            } catch {
              // Skip this member, relay fetch failed
            }
          }
        }
      } catch {
        // Silently fail — profiles will show pubkey fallback
      }
    };

    fetchMembers();
  }, [profileSynced, profileCache]);

  // Discover existing DM threads from Nostr relays (waits for NDK to be ready)
  useEffect(() => {
    if (!ndkReady || !profile?.pubkey) return;

    const dmStore = useDMStore.getState();
    dmStore.setLoadingThreads(true);

    discoverDMThreads(profile.pubkey).then((threadMap) => {
      const threads = Array.from(threadMap.entries())
        .sort((a, b) => b[1].lastMessageAt - a[1].lastMessageAt)
        .map(([pubkey, info]) => {
          const cached = profileCache.get(pubkey);
          return {
            pubkey,
            displayName: cached?.name || formatPubkey(pubkey),
            picture: cached?.picture,
            lastMessage: info.lastMessage,
            lastMessageAt: info.lastMessageAt,
            unreadCount: 0,
            protocol: info.protocol,
          };
        });
      useDMStore.getState().setThreads(threads);
      useDMStore.getState().setLoadingThreads(false);
    }).catch(() => {
      useDMStore.getState().setLoadingThreads(false);
    });
  }, [ndkReady, profile?.pubkey, profileCache]);

  // Subscribe to incoming DMs (NIP-04 + NIP-17) — waits for NDK to be ready
  useEffect(() => {
    if (!ndkReady || !profile?.pubkey) return;

    const cleanup = subscribeDMs(profile.pubkey, (msg: DMMessage) => {
      const dmStore = useDMStore.getState();
      const otherPubkey = msg.senderPubkey === profile.pubkey
        ? msg.recipientPubkey
        : msg.senderPubkey;

      // Update thread list
      const existingThread = dmStore.threads.find(t => t.pubkey === otherPubkey);
      if (existingThread) {
        dmStore.updateThread(otherPubkey, {
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unreadCount: dmStore.activeDMPubkey === otherPubkey
            ? 0
            : existingThread.unreadCount + 1,
        });
      } else {
        const cached = profileCache.get(otherPubkey);
        dmStore.addThread({
          pubkey: otherPubkey,
          displayName: cached?.name || formatPubkey(otherPubkey),
          picture: cached?.picture,
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unreadCount: dmStore.activeDMPubkey === otherPubkey ? 0 : 1,
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
  }, [ndkReady, profile?.pubkey, profileCache]);

  // Connect Socket.io
  useEffect(() => {
    if (!sessionChecked) return;

    const socket = io();

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('new-message', (message: Message) => {
      addMessage(message);
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

    socket.on('force-disconnect', ({ reason }: { reason: string }) => {
      alert(reason);
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

    // Notification events
    socket.on('notification', (data: { type: string; channelId?: string; serverId?: string; senderPubkey: string; preview?: string }) => {
      const notifStore = useNotificationStore.getState();
      if (data.type === 'mention' && data.channelId) {
        notifStore.incrementChannelUnread(data.channelId, true);
        if (document.hidden) {
          showBrowserNotification('New mention', data.preview || 'You were mentioned in a message');
        }
      } else if (data.type === 'dm') {
        notifStore.setDMUnread(data.senderPubkey, (notifStore.dmUnreads[data.senderPubkey] || 0) + 1);
        if (document.hidden) {
          showBrowserNotification('New DM', data.preview || 'You have a new direct message');
        }
      }
    });

    socket.on('unread-update', (data: { channelId: string; serverId: string; hasMention: boolean }) => {
      const notifStore = useNotificationStore.getState();
      notifStore.incrementChannelUnread(data.channelId, data.hasMention);
      // Update channel-server mapping
      if (data.serverId) {
        notifStore.setChannelServerMap({
          ...notifStore.channelServerMap,
          [data.channelId]: data.serverId,
        });
      }
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionChecked, addMessage, removeMessage, updateMessage, updateReactions, logout, router]);

  // Join/leave channel rooms
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    if (prevChannelRef.current) {
      socket.emit('leave-channel', prevChannelRef.current);
    }
    if (activeChannelId) {
      socket.emit('join-channel', activeChannelId);
      // Mark channel as read and clear unread badge
      socket.emit('mark-read', { channelId: activeChannelId });
      useNotificationStore.getState().clearChannelUnread(activeChannelId);
    }
    prevChannelRef.current = activeChannelId;
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

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
      } catch (err) {
        console.error('Failed to fetch messages:', err);
        setLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [activeChannelId, setMessages, setLoadingMessages]);

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
        {isDMMode ? (
          <DMList onNewDM={() => setShowNewDMModal(true)} />
        ) : (
          <ChannelSidebar onChannelSelect={() => setSidebarOpen(false)} />
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {isDMMode ? (
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
                      {activeChannel.emoji && <span className="text-sm shrink-0">{activeChannel.emoji}</span>}
                      <h3 className="font-semibold text-lc-white text-sm truncate">{activeChannel.name}</h3>
                    </div>
                  ) : (
                    <span className="text-sm text-lc-muted">Select a channel</span>
                  )}
                </div>
                <SearchBar serverId={activeServerId} profileCache={profileCache} />
              </div>

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
                  <MessageArea profileCache={profileCache} onEdit={handleEdit} onDelete={handleDelete} onToggleReaction={handleToggleReaction} />
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
