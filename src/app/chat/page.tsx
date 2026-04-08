'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth';
import { useChatStore, Message } from '@/store/chat';
import ServerBar from '@/components/chat/ServerBar';
import ChannelSidebar from '@/components/chat/ChannelSidebar';
import MessageArea from '@/components/chat/MessageArea';
import MessageInput from '@/components/chat/MessageInput';

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
    setLoadingMessages,
  } = useChatStore();
  const socketRef = useRef<Socket | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const [profileCache] = useState(() => new Map<string, { name?: string; picture?: string }>());
  const [sessionChecked, setSessionChecked] = useState(false);
  const sessionCheckStarted = useRef(false);

  // On mount, validate session with backend. If no valid session, redirect to landing.
  // This doesn't depend on Zustand state at all — it checks the httpOnly cookie directly.
  useEffect(() => {
    if (sessionCheckStarted.current) return;
    sessionCheckStarted.current = true;

    restoreSession().then((valid) => {
      if (!valid) {
        router.push('/');
      } else {
        setSessionChecked(true);
      }
    });
  }, [restoreSession, router]);

  // Add own profile to cache
  useEffect(() => {
    if (profile) {
      profileCache.set(profile.pubkey, {
        name: profile.displayName || profile.name,
        picture: profile.picture,
      });
    }
  }, [profile, profileCache]);

  // Sync own profile to backend Member table
  useEffect(() => {
    if (!sessionChecked || !profile) return;
    fetch('/api/members/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: profile.displayName || profile.name || null,
        picture: profile.picture || null,
        nip05: profile.nip05 || null,
      }),
    }).catch(() => {});
  }, [sessionChecked, profile]);

  // Fetch channels for the active server
  useEffect(() => {
    if (!sessionChecked) return;

    const fetchChannels = async () => {
      try {
        const res = await fetch('/api/channels');
        if (!res.ok) return;
        const data = await res.json();

        setServers([data.server]);
        if (!activeServerId) {
          setActiveServer(data.server.id);
        }
        setChannels(data.pinnedChannels, data.categories);

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
  }, [sessionChecked, activeServerId, setServers, setActiveServer, setChannels, setActiveChannel]);

  // Fetch all member profiles for the profileCache
  useEffect(() => {
    if (!sessionChecked) return;

    const fetchMembers = async () => {
      try {
        const res = await fetch('/api/members');
        if (!res.ok) return;
        const data = await res.json();
        for (const member of data.members) {
          profileCache.set(member.pubkey, {
            name: member.displayName || undefined,
            picture: member.picture || undefined,
          });
        }
      } catch {
        // Silently fail — profiles will show pubkey fallback
      }
    };

    fetchMembers();
  }, [sessionChecked, profileCache]);

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

    socket.on('force-disconnect', ({ reason }: { reason: string }) => {
      alert(reason);
      logout();
      router.push('/');
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionChecked, addMessage, removeMessage, logout, router]);

  // Join/leave channel rooms
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

  // Find active channel name for top bar
  const allChannels = [
    ...pinnedChannels,
    ...categories.flatMap(c => c.channels),
  ];
  const activeChannel = allChannels.find(c => c.id === activeChannelId);

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
    <div className="h-screen flex bg-lc-black">
      {/* Server icon bar */}
      <ServerBar />

      {/* Channel sidebar */}
      <ChannelSidebar />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top bar — channel info */}
        <div className="h-12 px-4 flex items-center border-b border-lc-border shrink-0 bg-lc-dark">
          {activeChannel ? (
            <div className="flex items-center gap-2">
              <span className="text-lc-muted font-bold">#</span>
              {activeChannel.emoji && <span className="text-sm">{activeChannel.emoji}</span>}
              <h3 className="font-semibold text-lc-white text-sm">{activeChannel.name}</h3>
            </div>
          ) : (
            <span className="text-sm text-lc-muted">Select a channel</span>
          )}
        </div>

        {/* Messages + Input */}
        <MessageArea profileCache={profileCache} />
        <MessageInput onSend={handleSend} />
      </div>
    </div>
  );
}
