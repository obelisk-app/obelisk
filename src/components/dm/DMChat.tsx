'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';
import { sendDM, fetchDMHistory, detectNip04InRecent } from '@/lib/dm';
import type { DMMessage, DMProtocol } from '@/lib/dm';
import { formatPubkey } from '@/lib/nostr';

interface DMChatProps {
  profileCache: Map<string, { name?: string; picture?: string }>;
}

export default function DMChat({ profileCache }: DMChatProps) {
  const {
    activeDMPubkey,
    messages,
    isLoadingMessages,
    hasMoreHistory,
    setMessages,
    addMessage,
    prependMessages,
    replaceMessage,
    markMessageFailed,
    protocolOverrides,
    setShowProtocolPrompt,
    setHasMoreHistory,
    updateThread,
  } = useDMStore();
  const { profile } = useAuthStore();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  const otherProfile = activeDMPubkey ? profileCache.get(activeDMPubkey) : null;
  const otherName = otherProfile?.name || (activeDMPubkey ? formatPubkey(activeDMPubkey) : '');

  // Determine send protocol for active conversation. Default NIP-17; respect
  // a persisted override set via the ProtocolPrompt.
  const sendProtocol: DMProtocol = activeDMPubkey
    ? protocolOverrides[activeDMPubkey] || 'nip17'
    : 'nip17';

  // Fetch DM history when active DM changes (cache-first via lib/dm).
  useEffect(() => {
    if (!activeDMPubkey || !profile?.pubkey) return;
    let cancelled = false;

    fetchDMHistory(profile.pubkey, activeDMPubkey).then((result) => {
      if (cancelled) return;
      setMessages(result.messages);
      setHasMoreHistory(result.hasMore);
    });

    return () => {
      cancelled = true;
    };
  }, [activeDMPubkey, profile?.pubkey, setMessages, setHasMoreHistory]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Infinite scroll: when the top sentinel becomes visible, fetch older history.
  useEffect(() => {
    if (!activeDMPubkey || !profile?.pubkey) return;
    if (!hasMoreHistory) return;
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting || loadingOlder) return;
        setLoadingOlder(true);
        const oldest = useDMStore.getState().messages[0]?.createdAt;
        const result = await fetchDMHistory(profile.pubkey!, activeDMPubkey, {
          before: oldest,
          limit: 50,
        });
        if (result.messages.length > 0) {
          prependMessages(result.messages);
        }
        setHasMoreHistory(result.hasMore);
        setLoadingOlder(false);
      },
      { root: sentinel.parentElement, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeDMPubkey, profile?.pubkey, hasMoreHistory, loadingOlder, prependMessages, setHasMoreHistory]);

  /**
   * Core optimistic send: inject a pending message, publish in the background,
   * then replace with the real event or mark the pending row as failed.
   */
  const doSend = useCallback(
    async (text: string, protocol: DMProtocol) => {
      if (!activeDMPubkey || !profile?.pubkey) return;
      const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: DMMessage = {
        id: pendingId,
        senderPubkey: profile.pubkey,
        recipientPubkey: activeDMPubkey,
        content: text,
        createdAt: Math.floor(Date.now() / 1000),
        protocol,
        isPending: true,
      };
      addMessage(optimistic);
      updateThread(activeDMPubkey, { lastMessage: text, lastMessageAt: optimistic.createdAt });

      try {
        const event = await sendDM(activeDMPubkey, text, protocol, profile.pubkey);
        replaceMessage(pendingId, {
          id: event.id || pendingId,
          senderPubkey: profile.pubkey,
          recipientPubkey: activeDMPubkey,
          content: text,
          createdAt: event.created_at ?? optimistic.createdAt,
          protocol,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'failed to send';
        markMessageFailed(pendingId, message);
      }
    },
    [activeDMPubkey, profile?.pubkey, addMessage, replaceMessage, markMessageFailed, updateThread],
  );

  const handleSend = async () => {
    if (!content.trim() || !activeDMPubkey || sending) return;
    setSending(true);
    const text = content.trim();
    setContent('');

    // Protocol prompt kicks in only when there's no stored override and the
    // thread has recent NIP-04 history. Mirrors nostrito-app's send-attempt
    // decision model — never prompt on thread-open, only on actual send.
    const existingOverride = protocolOverrides[activeDMPubkey];
    if (!existingOverride && detectNip04InRecent(useDMStore.getState().messages)) {
      // Defer the actual send until the user picks a protocol. Stash the
      // text back into the input so they don't lose it if they cancel.
      setContent(text);
      setShowProtocolPrompt(activeDMPubkey);
      setSending(false);
      return;
    }

    await doSend(text, sendProtocol);
    setSending(false);
  };

  const handleRetry = async (msg: DMMessage) => {
    if (!activeDMPubkey || !profile?.pubkey) return;
    // Remove the failed bubble by replacing its id — doSend will create a new
    // pending bubble with a fresh id.
    const { messages: current } = useDMStore.getState();
    useDMStore.setState({ messages: current.filter((m) => m.id !== msg.id) });
    await doSend(msg.content, msg.protocol);
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
        <span className="text-xs text-lc-muted ml-auto" title={`Sending via ${sendProtocol.toUpperCase()}`}>
          {sendProtocol === 'nip17' ? '🔒 NIP-17' : '⚠️ NIP-04'}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {/* Top sentinel for infinite scroll — observed only when hasMoreHistory */}
        {hasMoreHistory && (
          <div ref={topSentinelRef} className="h-8 flex items-center justify-center" data-testid="dm-top-sentinel">
            {loadingOlder ? <span className="lc-spinner" /> : null}
          </div>
        )}

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
            const failed = !!msg.sendError;
            const pending = !!msg.isPending;

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 px-4 py-1.5 hover:bg-lc-border/20 transition-colors ${pending ? 'opacity-60' : ''} ${failed ? 'bg-red-950/20' : ''}`}
                data-testid={failed ? 'dm-msg-failed' : pending ? 'dm-msg-pending' : 'dm-msg'}
              >
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
                    {pending && <span className="text-xs text-lc-muted italic">sending…</span>}
                    {failed && (
                      <button
                        onClick={() => handleRetry(msg)}
                        className="text-xs text-red-400 hover:text-red-300 underline"
                        data-testid="dm-retry"
                      >
                        failed — retry
                      </button>
                    )}
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
