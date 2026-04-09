'use client';

import { useEffect, useRef, useState } from 'react';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';
import { sendDM, fetchDMHistory } from '@/lib/dm';
import { formatPubkey } from '@/lib/nostr';

interface DMChatProps {
  profileCache: Map<string, { name?: string; picture?: string }>;
}

export default function DMChat({ profileCache }: DMChatProps) {
  const { activeDMPubkey, messages, isLoadingMessages, setMessages, addMessage } = useDMStore();
  const { profile } = useAuthStore();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const otherProfile = activeDMPubkey ? profileCache.get(activeDMPubkey) : null;
  const otherName = otherProfile?.name || (activeDMPubkey ? formatPubkey(activeDMPubkey) : '');

  // Fetch DM history when active DM changes
  useEffect(() => {
    if (!activeDMPubkey || !profile?.pubkey) return;

    fetchDMHistory(profile.pubkey, activeDMPubkey).then((msgs) => {
      setMessages(msgs);
    });
  }, [activeDMPubkey, profile?.pubkey, setMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!content.trim() || !activeDMPubkey || sending) return;
    setSending(true);
    const text = content.trim();
    setContent('');

    const event = await sendDM(activeDMPubkey, text);
    if (event && profile) {
      addMessage({
        id: event.id,
        senderPubkey: profile.pubkey,
        recipientPubkey: activeDMPubkey,
        content: text,
        createdAt: Math.floor(Date.now() / 1000),
      });
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeDMPubkey) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-lc-muted">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 opacity-30">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <p className="text-lg font-medium">Select a conversation</p>
          <p className="text-sm">Pick a conversation or start a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="dm-chat">
      {/* Header */}
      <div className="h-12 px-4 flex items-center gap-3 border-b border-lc-border shrink-0 bg-lc-dark">
        {otherProfile?.picture ? (
          <img src={otherProfile.picture} alt="" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold">
            {otherName[0]?.toUpperCase() || '?'}
          </div>
        )}
        <span className="text-sm font-semibold text-lc-white">{otherName}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {isLoadingMessages ? (
          <div className="px-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="lc-skeleton-circle w-8 h-8" />
                <div className="space-y-1 flex-1">
                  <div className="lc-skeleton h-4 w-24" />
                  <div className="lc-skeleton h-4 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-lc-muted">No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderPubkey === profile?.pubkey;
            const senderProfile = profileCache.get(msg.senderPubkey);
            const senderName = senderProfile?.name || formatPubkey(msg.senderPubkey);
            const time = new Date(msg.createdAt * 1000);
            const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={msg.id} className="flex items-start gap-3 px-4 py-1.5 hover:bg-lc-border/20 transition-colors">
                {senderProfile?.picture ? (
                  <img src={senderProfile.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0 mt-0.5">
                    {senderName[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-semibold ${isMe ? 'text-lc-green' : 'text-lc-white'}`}>
                      {senderName}
                    </span>
                    <span className="text-xs text-lc-muted">{timeStr}</span>
                  </div>
                  <p className="text-sm text-lc-white/90 break-words whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="bg-lc-border/50 flex items-end gap-2 px-4 py-2 rounded-xl">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${otherName}`}
            rows={1}
            className="flex-1 bg-transparent text-sm text-lc-white placeholder-lc-muted resize-none outline-none max-h-[200px] py-1.5"
            data-testid="dm-input"
          />
          <button
            onClick={handleSend}
            disabled={!content.trim() || sending}
            className="p-1.5 rounded-lg text-lc-muted hover:text-lc-green disabled:opacity-30 transition-colors shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
