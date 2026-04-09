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
import VoiceChannel from '@/components/chat/VoiceChannel';
import { useDMStore } from '@/store/dm';
import { useVoiceStore } from '@/store/voice';
import { getLocalAudioStream, stopLocalAudioStream, setLocalMuted } from '@/lib/voice';
import MemberList from '@/components/chat/MemberList';

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
  const prevChannelRef = useRef<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const [profileCache] = useState(() => new Map<string, { name?: string; picture?: string }>());
  const [sessionChecked, setSessionChecked] = useState(false);
  const sessionCheckStarted = useRef(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const { isDMMode } = useDMStore();
  const [showNewDMModal, setShowNewDMModal] = useState(false);

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

  // Fetch channels for the active server
  useEffect(() => {
    if (!sessionChecked || !activeServerId) return;

    const fetchChannels = async () => {
      try {
        const res = await fetch(`/api/channels?serverId=${activeServerId}`);
        if (!res.ok) return;
        const data = await res.json();

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
        for (const member of data.members) {
          profileCache.set(member.pubkey, {
            name: member.displayName || undefined,
            picture: member.picture || undefined,
          });
          memberInfoList.push({
            pubkey: member.pubkey,
            displayName: member.displayName || member.pubkey.slice(0, 8) + '...',
            picture: member.picture || undefined,
          });
        }
        setMemberList(memberInfoList);
      } catch {
        // Silently fail — profiles will show pubkey fallback
      }
    };

    fetchMembers();
  }, [profileSynced, profileCache]);

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
      if (voiceStore.currentVoiceChannelId === channelId) {
        voiceStore.setParticipants(participants);
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
    try {
      await getLocalAudioStream();
      socket.emit('join-voice', channelId);
      voiceStore.setVoiceChannel(channelId);
    } catch (err) {
      console.error('Failed to get microphone:', err);
    } finally {
      voiceStore.setConnecting(false);
    }
  }, []);

  const handleLeaveVoice = useCallback(() => {
    const socket = socketRef.current;
    const voiceStore = useVoiceStore.getState();
    const channelId = voiceStore.currentVoiceChannelId;
    if (socket && channelId) {
      socket.emit('leave-voice', channelId);
    }
    stopLocalAudioStream();
    voiceStore.leaveVoice();
  }, []);

  const handleToggleVoiceMute = useCallback(() => {
    const socket = socketRef.current;
    const voiceStore = useVoiceStore.getState();
    const channelId = voiceStore.currentVoiceChannelId;
    const newMuted = !voiceStore.isMuted;
    voiceStore.setMuted(newMuted);
    setLocalMuted(newMuted);
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
      setLocalMuted(true);
    }
    if (socket && channelId) {
      socket.emit('voice-deafen', { channelId, deafened: newDeafened });
    }
  }, []);

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

      {/* DM or Channel view */}
      {isDMMode ? (
        <>
          <DMList onNewDM={() => setShowNewDMModal(true)} />
          <DMChat profileCache={profileCache} />
          {showNewDMModal && (
            <NewDMModal
              onClose={() => setShowNewDMModal(false)}
              profileCache={profileCache}
            />
          )}
        </>
      ) : (
        <>
          {/* Channel sidebar */}
          <ChannelSidebar />

          {/* Main chat area + member list */}
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 flex flex-col min-h-0">
              {/* Top bar — channel info */}
              <div className="h-12 px-4 flex items-center justify-between border-b border-lc-border shrink-0 bg-lc-dark">
                {activeChannel ? (
                  <div className="flex items-center gap-2">
                    <span className="text-lc-muted font-bold">
                      {activeChannel.type === 'forum' ? '💬' : activeChannel.type === 'voice' ? '🎙' : '#'}
                    </span>
                    {activeChannel.emoji && <span className="text-sm">{activeChannel.emoji}</span>}
                    <h3 className="font-semibold text-lc-white text-sm">{activeChannel.name}</h3>
                  </div>
                ) : (
                  <span className="text-sm text-lc-muted">Select a channel</span>
                )}
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

            {/* Member list sidebar */}
            <MemberList profileCache={profileCache} />
          </div>
        </>
      )}
    </div>
  );
}
