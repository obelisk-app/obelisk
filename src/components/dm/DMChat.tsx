'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';
import { sendDM as sendDMNew, detectNip04InRecent, type DMMessage, type DMProtocol } from '@/lib/dm/dm';
import { getCachedEvents, getSecret, putSecret, type CachedDMEvent } from '@/lib/dm/dm-cache';
import { useDMSession } from './DMSessionProvider';
import { formatPubkey, getNDK } from '@/lib/nostr';

interface DMChatProps {
  profileCache: Map<string, { name?: string; picture?: string }>;
}

/**
 * Maximum number of cached events to decrypt and load into the Zustand store
 * on thread-open. Older events stay encrypted-at-rest in `dm-cache` and are
 * only decrypted if the user scrolls them into view (Task-14-or-later).
 */
const VIEWPORT_DECRYPT_LIMIT = 50;

/**
 * Wire format for the AES-GCM-wrapped plaintext blob in the secrets cache.
 * Storing the full envelope (not just `content`) lets us answer NIP-17
 * "who is this from?" questions without re-running giftUnwrap on every
 * thread open — the partner is part of the cache hit.
 */
interface SecretEnvelope {
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  createdAt: number;
  protocol: DMProtocol;
}

function partnerOfNip04(ev: CachedDMEvent, myPubkey: string): string {
  if (ev.pubkey === myPubkey) {
    const pTag = ev.tags.find((t) => t[0] === 'p');
    return pTag?.[1] ?? '';
  }
  return ev.pubkey;
}

/**
 * Try the secrets cache first (AES-GCM unwrap, no signer touch); on miss,
 * signer-decrypt the wire event and write the plaintext envelope back to the
 * secrets cache for next time.
 */
async function decryptToEnvelope(
  myPubkey: string,
  cacheKey: CryptoKey,
  ev: CachedDMEvent,
): Promise<SecretEnvelope | null> {
  // Phase 1: secrets-cache hit. Costs zero signer prompts.
  const cached = await getSecret(myPubkey, cacheKey, ev.id);
  if (cached) {
    try {
      return JSON.parse(cached) as SecretEnvelope;
    } catch {
      // Corrupt blob — fall through to signer fallback.
    }
  }

  // Phase 2: signer fallback. NIP-04 is the cheap path; NIP-17 unwraps a
  // gift wrap which is more expensive but still one sig per event.
  const ndk = getNDK();
  if (!ndk.signer) return null;

  if (ev.kind === 4) {
    try {
      const { NDKEvent: NDKEventClass, NDKUser } = await import('@nostr-dev-kit/ndk');
      const counter = partnerOfNip04(ev, myPubkey);
      if (!counter) return null;
      const senderPk = ev.pubkey === myPubkey ? counter : ev.pubkey;
      const otherUser = new NDKUser({ pubkey: senderPk });
      otherUser.ndk = ndk;
      const target = new NDKEventClass(ndk, {
        id: ev.id,
        pubkey: ev.pubkey,
        kind: 4,
        content: ev.content,
        tags: ev.tags,
        created_at: ev.created_at,
        sig: ev.sig ?? '',
      } as any);
      await target.decrypt(otherUser, ndk.signer, 'nip04');
      const pTag = ev.tags.find((t) => t[0] === 'p');
      const env: SecretEnvelope = {
        senderPubkey: ev.pubkey,
        recipientPubkey: pTag?.[1] ?? '',
        content: target.content,
        createdAt: ev.created_at,
        protocol: 'nip04',
      };
      await putSecret(myPubkey, cacheKey, ev.id, JSON.stringify(env));
      return env;
    } catch {
      return null;
    }
  }

  if (ev.kind === 1059) {
    try {
      const { NDKEvent: NDKEventClass, giftUnwrap } = await import('@nostr-dev-kit/ndk');
      const wrap = new NDKEventClass(ndk, {
        id: ev.id,
        pubkey: ev.pubkey,
        kind: 1059,
        content: ev.content,
        tags: ev.tags,
        created_at: ev.created_at,
        sig: ev.sig ?? '',
      } as any);
      const rumor: any = await giftUnwrap(wrap, undefined, ndk.signer);
      if (rumor.kind !== 14) return null;
      const recipientTag = (rumor.tags as string[][]).find((t) => t[0] === 'p');
      const env: SecretEnvelope = {
        senderPubkey: rumor.pubkey,
        recipientPubkey: recipientTag?.[1] ?? '',
        content: rumor.content,
        createdAt: rumor.created_at ?? ev.created_at,
        protocol: 'nip17',
      };
      await putSecret(myPubkey, cacheKey, ev.id, JSON.stringify(env));
      return env;
    } catch {
      return null;
    }
  }

  return null;
}

export default function DMChat({ profileCache }: DMChatProps) {
  const session = useDMSession();
  const myPubkey = session.myPubkey;

  const {
    activeDMPubkey,
    messages,
    isLoadingMessages,
    hasMoreHistory,
    setMessages,
    addMessage,
    replaceMessage,
    markMessageFailed,
    protocolOverrides,
    setShowProtocolPrompt,
    setLoadingMessages,
    updateThread,
  } = useDMStore();
  const { profile } = useAuthStore();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  const otherProfile = activeDMPubkey ? profileCache.get(activeDMPubkey) : null;
  const otherName = otherProfile?.name || (activeDMPubkey ? formatPubkey(activeDMPubkey) : '');

  // Determine send protocol for active conversation. Default NIP-17; respect
  // a persisted override set via the ProtocolPrompt.
  const sendProtocol: DMProtocol = activeDMPubkey
    ? protocolOverrides[activeDMPubkey] || 'nip17'
    : 'nip17';

  // Viewport decryption: when the active partner changes, hydrate the message
  // window from the local DM cache. Only the last N events get their plaintext
  // loaded into the Zustand store — older cached wire events stay encrypted at
  // rest. This keeps RAM-resident plaintext bounded (audit row #9) and limits
  // signer prompts to one cache-key unwrap per session (audit row #20).
  useEffect(() => {
    if (!activeDMPubkey || !myPubkey) return;
    if (!session.cacheKey) return;
    let cancelled = false;
    setLoadingMessages(true);
    setMessages([]);

    (async () => {
      // 1. Pull NIP-04 events whose partner is the active thread. NIP-17 wraps
      //    don't expose their partner without unwrapping, so we include all
      //    wraps in the candidate window and let the post-decrypt filter sort
      //    them out.
      const allCached = getCachedEvents(myPubkey);
      const candidates = allCached.filter((ev) => {
        if (ev.kind === 4) return partnerOfNip04(ev, myPubkey) === activeDMPubkey;
        if (ev.kind === 1059) return true; // partner unknown until unwrap
        return false;
      });

      // Newest first, then take the head N. Reverse at the end so the rendered
      // message list is oldest-on-top, matching the existing UX.
      candidates.sort((a, b) => b.created_at - a.created_at);
      const window = candidates.slice(0, VIEWPORT_DECRYPT_LIMIT);

      const decrypted: DMMessage[] = [];
      for (const ev of window) {
        if (cancelled) return;
        const env = await decryptToEnvelope(myPubkey, session.cacheKey!, ev);
        if (!env) continue;
        // Drop NIP-17 messages that turn out to be for a different partner.
        const partner = env.senderPubkey === myPubkey ? env.recipientPubkey : env.senderPubkey;
        if (partner !== activeDMPubkey) continue;
        decrypted.push({
          id: ev.id,
          senderPubkey: env.senderPubkey,
          recipientPubkey: env.recipientPubkey,
          content: env.content,
          createdAt: env.createdAt,
          protocol: env.protocol,
        });
      }

      if (cancelled) return;
      decrypted.sort((a, b) => a.createdAt - b.createdAt);
      setMessages(decrypted);

      // Kick the relay-side history fetch via the session — coalesced, so
      // re-runs on partner-change are deduped at the request layer.
      session.loadThread(activeDMPubkey);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDMPubkey, myPubkey, session, setMessages, setLoadingMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  /**
   * Core optimistic send: inject a pending message, publish in the background,
   * then replace with the real event or mark the pending row as failed.
   */
  const doSend = useCallback(
    async (text: string, protocol: DMProtocol) => {
      if (!activeDMPubkey || !myPubkey) return;
      const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: DMMessage = {
        id: pendingId,
        senderPubkey: myPubkey,
        recipientPubkey: activeDMPubkey,
        content: text,
        createdAt: Math.floor(Date.now() / 1000),
        protocol,
        isPending: true,
      };
      addMessage(optimistic);
      updateThread(activeDMPubkey, { lastMessage: text, lastMessageAt: optimistic.createdAt });

      try {
        const event = await sendDMNew({
          myPubkey,
          recipientPubkey: activeDMPubkey,
          content: text,
          protocol,
        });
        replaceMessage(pendingId, {
          id: event.id || pendingId,
          senderPubkey: myPubkey,
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
    [activeDMPubkey, myPubkey, addMessage, replaceMessage, markMessageFailed, updateThread],
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
    if (!activeDMPubkey || !myPubkey) return;
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
        {/* Top sentinel reserved for future load-older support — Task-14-or-later
            will wire `until` cursors into loadHistory so this can decrypt the
            next page on intersect. */}
        {hasMoreHistory && (
          <div ref={topSentinelRef} className="h-8 flex items-center justify-center" data-testid="dm-top-sentinel" />
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
            const isMe = msg.senderPubkey === (profile?.pubkey ?? myPubkey);
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
