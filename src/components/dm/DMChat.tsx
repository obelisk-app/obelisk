'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';
import { sendDM as sendDMNew, detectNip04InRecent, type DMMessage, type DMProtocol } from '@/lib/dm/dm';
import { getCachedEvents } from '@/lib/dm/dm-cache';
import { partnerOfNip04 } from '@/lib/dm/decrypt';
import { loadOlder } from '@/lib/dm/dm';
import { useProfile } from '@/components/ProfileProvider';
import { useDMSession, useDMThread } from './DMSessionProvider';
import { formatPubkey, getNDK } from '@/lib/nostr';

// `profileCache` was the prop-drilled bridge between server-side member
// profiles (chat) and relay-side kind 0 (DMs). It's no longer needed —
// every DM-side consumer reads from the ProfileProvider via `useProfile`.
// The prop is kept as an unused parameter so the chat page's existing
// `<DMChat profileCache={...} />` mount keeps working without a chat-side
// edit; remove it once the chat page's prop site migrates too.
interface DMChatProps {
  profileCache?: Map<string, { name?: string; picture?: string }>;
}

/**
 * Render plain text into React nodes, turning bare URLs into anchor tags.
 * Conservative regex: matches http(s) and ws(s) schemes followed by at least
 * one non-whitespace char. Trailing punctuation that's typically NOT part of
 * a URL (`.,;:!?)`) is stripped back into the surrounding text — matches the
 * Discord/Telegram convention so "see https://x.com." doesn't include the
 * dot in the link.
 */
const URL_REGEX = /(https?:\/\/|wss?:\/\/)\S+/gi;
function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    const start = match.index ?? 0;
    let end = start + match[0].length;
    // Pull trailing punctuation back out of the URL.
    let url = match[0];
    while (url.length > 1 && /[.,;:!?)\]]$/.test(url)) {
      url = url.slice(0, -1);
      end -= 1;
    }
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    nodes.push(
      <a
        key={`${start}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        {url}
      </a>
    );
    lastIndex = end;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/**
 * Maximum number of cached events to decrypt and load into the Zustand store
 * on thread-open. Older events stay encrypted-at-rest in `dm-cache` and are
 * only decrypted if the user scrolls them into view (Task-14-or-later).
 */
const VIEWPORT_DECRYPT_LIMIT = 50;
const PAGE_SIZE = 50;

export default function DMChat(_props: DMChatProps) {
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
  const profile = useAuthStore((s) => s.profile);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // Single-source profile read via the ProfileProvider. The hook subscribes
  // (idempotently across the tree), the provider drives the relay query and
  // localStorage cache, and any newer kind 0 fires a re-render here AND in
  // every other consumer (sidebar row, message bubble, NewDM modal).
  // No local Map writes, no manual tick — the context state IS the source.
  const otherProfile = useProfile(activeDMPubkey ?? null);
  const otherName =
    otherProfile?.parsed.displayName
    || otherProfile?.parsed.name
    || (activeDMPubkey ? formatPubkey(activeDMPubkey) : '');
  const otherPicture = otherProfile?.parsed.picture;

  // Local viewport size — grows when the user scrolls up. Resets when the
  // active partner changes.
  const [decryptCount, setDecryptCount] = useState(VIEWPORT_DECRYPT_LIMIT);
  const [cachedCount, setCachedCount] = useState(0);
  const [olderInFlight, setOlderInFlight] = useState(false);

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
  // Reset viewport when the active partner changes.
  useEffect(() => {
    setDecryptCount(VIEWPORT_DECRYPT_LIMIT);
    setOlderInFlight(false);
  }, [activeDMPubkey]);

  // Single-source decrypted messages from the DMSessionProvider. The
  // provider runs the decrypt pipeline globally — switching threads is now
  // a Map lookup, not a fresh decrypt loop. The local `messages` store is
  // kept in sync by mirroring the per-partner slice into it (other code
  // paths — optimistic-send, retry, mark-failed — still read/write that
  // store via `addMessage`/`replaceMessage`/`markMessageFailed`, so we
  // can't drop it yet).
  const providerMessages = useDMThread(activeDMPubkey ?? null);
  useEffect(() => {
    if (!activeDMPubkey || !myPubkey) return;
    if (!session.cacheKey) return;
    // Filter to events that belong to this thread. NIP-04: cheap (partner
    // is in the wire envelope). NIP-17: provider already decrypted, so
    // partner == activeDMPubkey was the bucket key we landed in.
    const filtered = providerMessages;
    setMessages(filtered);
    // Loading spinner is true only when we have NEITHER cached events
    // for this partner NOR provider-decrypted messages. The provider
    // populates the slice incrementally, so a populated `providerMessages`
    // means the cache already had something we could decrypt.
    if (filtered.length > 0) {
      setLoadingMessages(false);
    } else {
      const evs = getCachedEvents(myPubkey);
      const cacheHasAny = evs.some((ev) => {
        if (ev.kind === 4) return partnerOfNip04(ev, myPubkey) === activeDMPubkey;
        return ev.kind === 1059; // partner unknown without decrypt; bias to "show spinner"
      });
      setLoadingMessages(cacheHasAny); // wait on decrypt; no cache → empty state
    }
    setCachedCount(filtered.length);
    setOlderInFlight(false);
    // Kick the relay-side history fetch via the session — coalesced, so
    // re-runs on partner-change are deduped at the request layer.
    session.loadThread(activeDMPubkey);
  }, [activeDMPubkey, myPubkey, session, providerMessages, setMessages, setLoadingMessages]);

  // Infinite-scroll: when the top sentinel is intersecting AND there are more
  // cached events beyond the current decrypt window OR we haven't tried a
  // server-side fetch for older events yet, kick `loadOlder` and grow the
  // window. Throttled by `olderInFlight` so we don't fire repeatedly while the
  // browser is still settling the scroll.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !activeDMPubkey || !myPubkey) return;
    if (typeof IntersectionObserver === 'undefined') return; // jsdom / SSR
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      if (olderInFlight) return;
      // Find the oldest currently-rendered message; ask relays for events
      // strictly older than that.
      const oldest = messages[0];
      if (!oldest) return;
      setOlderInFlight(true);
      loadOlder(myPubkey, activeDMPubkey, { before: Math.floor(oldest.createdAt) });
      // Also widen the local viewport — even if relays return nothing, the
      // user gets to see deeper into existing cached history.
      setDecryptCount((c) => c + PAGE_SIZE);
    }, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeDMPubkey, myPubkey, messages, olderInFlight]);

  const hasMoreLocal = cachedCount > decryptCount;
  const showTopSentinel = hasMoreLocal || hasMoreHistory;

  // ── Read cursor + unread separator ──────────────────────────────────
  // Snapshot the per-thread read cursor at open time so the "New messages"
  // line stays put as the user reads (markThreadRead bumps the live cursor
  // in `useReadTracker`; the snap is what the separator renders against).
  // Reset on thread change.
  const readCursors = useDMStore((s) => s.readCursors);
  const readSnapRef = useRef<number>(0);
  useEffect(() => {
    if (!activeDMPubkey) return;
    readSnapRef.current = readCursors[activeDMPubkey] ?? 0;
    // We deliberately don't depend on `readCursors` here — only on
    // `activeDMPubkey`. We want the value as it was on thread open, not
    // whatever it becomes mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDMPubkey]);

  // Index of the first message that was unread when the thread was opened.
  // -1 if none. The separator renders before this index; if the very first
  // message is already unread (i.e., the whole batch is new), we skip the
  // separator since there's nothing "above the line" to delineate.
  const firstUnreadIndex = useMemo(() => {
    if (!activeDMPubkey || messages.length === 0) return -1;
    const cutoffMs = readSnapRef.current;
    if (!cutoffMs) return -1;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].createdAt * 1000 > cutoffMs) return i;
    }
    return -1;
  }, [messages, activeDMPubkey]);

  // Auto-scroll behavior. On thread open:
  //   - If there's an unread separator → scroll the separator into view at
  //     the top of the viewport. The user lands on "this is what you missed"
  //     instead of being yanked to the latest message past their cursor.
  //   - Otherwise → jump to bottom.
  // On subsequent message arrivals → animate to bottom (existing behavior).
  const firstScrollRef = useRef(true);
  const unreadSeparatorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    firstScrollRef.current = true;
  }, [activeDMPubkey]);
  useEffect(() => {
    if (messages.length === 0) return;
    if (firstScrollRef.current) {
      firstScrollRef.current = false;
      if (firstUnreadIndex > 0 && unreadSeparatorRef.current) {
        unreadSeparatorRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeDMPubkey, firstUnreadIndex]);

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
        // For NIP-17, `event` is the kind 1059 gift wrap whose id and
        // pubkey are ephemeral — they don't match the rumor (kind 14) the
        // recipient eventually sees. Keep the optimistic message in place
        // (just clear isPending) so the UI shows it correctly. For NIP-04,
        // the event IS the message itself, so use the real id+timestamp.
        if (protocol === 'nip04') {
          replaceMessage(pendingId, {
            id: event.id || pendingId,
            senderPubkey: myPubkey,
            recipientPubkey: activeDMPubkey,
            content: text,
            createdAt: event.created_at ?? optimistic.createdAt,
            protocol,
          });
        } else {
          replaceMessage(pendingId, {
            id: pendingId,
            senderPubkey: myPubkey,
            recipientPubkey: activeDMPubkey,
            content: text,
            createdAt: optimistic.createdAt,
            protocol,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'failed to send';
        // Log so the failure is debuggable in the browser console — the
        // failed-pill UI shows only the short message, which can hide
        // the root cause (signer missing, encryption failed, relay rejected).
        console.error('[dm] sendDM failed:', err);
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
    <div className="flex-1 flex flex-col min-h-0 min-w-0" data-testid="dm-chat">
      {/* Header */}
      <div className="h-12 px-4 flex items-center gap-3 border-b border-lc-border shrink-0 bg-lc-dark">
        {otherPicture ? (
          <img src={otherPicture} alt="" className="w-7 h-7 rounded-full object-cover" />
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

      {/* Messages — outer scroller is a flex column; the inner block uses
          `mt-auto` so 2-3 messages stick to the bottom (right above the
          input) instead of floating at the top. When the message list
          grows past the viewport, `mt-auto` is a no-op and the natural
          scrolling takes over. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col py-4 min-w-0">
        {/* Top sentinel: when intersecting, fires `loadOlder` and widens the
            local decrypt window. Visible only when there's more to fetch
            (either older cached events not yet decrypted, or the server may
            have more beyond our current bottom-of-cache cursor). */}
        {showTopSentinel && (
          <div
            ref={topSentinelRef}
            className="h-8 flex items-center justify-center text-xs text-lc-muted"
            data-testid="dm-top-sentinel"
          >
            {olderInFlight ? 'Loading older…' : ''}
          </div>
        )}

        <div className="mt-auto">
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
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-lc-muted">No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <Fragment key={msg.id}>
                {i === firstUnreadIndex && i > 0 && (
                  <div
                    ref={unreadSeparatorRef}
                    className="relative my-3 flex items-center px-4 select-none"
                    data-testid="dm-unread-separator"
                  >
                    <div className="flex-1 h-px bg-lc-green/40" />
                    <span className="px-3 text-[10px] text-lc-green font-semibold uppercase tracking-wider">
                      New messages
                    </span>
                    <div className="flex-1 h-px bg-lc-green/40" />
                  </div>
                )}
                <DMMessageBubble
                  msg={msg}
                  isMe={msg.senderPubkey === (profile?.pubkey ?? myPubkey)}
                  onRetry={() => handleRetry(msg)}
                />
              </Fragment>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
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

/**
 * Single message bubble. Pulls the sender's profile from `useProfile`, so
 * partner avatar/name updates fire a re-render here without prop-drilling.
 * Avatar only renders on the partner side; my own bubbles don't show me to
 * me.
 */
function DMMessageBubble({
  msg,
  isMe,
  onRetry,
}: {
  msg: DMMessage;
  isMe: boolean;
  onRetry: () => void;
}) {
  const senderProfile = useProfile(msg.senderPubkey);
  const senderName =
    senderProfile?.parsed.displayName
    || senderProfile?.parsed.name
    || formatPubkey(msg.senderPubkey);
  const senderPicture = senderProfile?.parsed.picture;
  const time = new Date(msg.createdAt * 1000);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const failed = !!msg.sendError;
  const pending = !!msg.isPending;

  return (
    <div
      className={`flex items-end gap-2 px-4 py-1.5 min-w-0 ${isMe ? 'justify-end' : 'justify-start'} ${pending ? 'opacity-60' : ''}`}
      data-testid={failed ? 'dm-msg-failed' : pending ? 'dm-msg-pending' : 'dm-msg'}
    >
      {!isMe && (
        senderPicture ? (
          <img src={senderPicture} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
            {senderName[0]?.toUpperCase() || '?'}
          </div>
        )
      )}
      <div
        className={`min-w-0 rounded-2xl px-4 py-2.5 ${
          failed
            ? 'bg-red-950/40 border border-red-900'
            : isMe
              ? 'bg-lc-border/60 text-lc-white rounded-br-md'
              : 'bg-lc-green text-lc-black rounded-bl-md'
        }`}
        style={{
          maxWidth: '500px',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {!isMe && (
          <div className="text-xs font-semibold text-lc-black/80 mb-1">{senderName}</div>
        )}
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{linkify(msg.content)}</p>
        <div className={`flex items-center gap-2 mt-1.5 text-[10px] justify-end ${isMe ? 'text-lc-muted' : 'text-lc-black/60'}`}>
          {pending && <span className="italic">sending…</span>}
          {failed && (
            <button
              onClick={onRetry}
              className="text-red-300 hover:text-red-200 underline"
              data-testid="dm-retry"
            >
              failed — retry
            </button>
          )}
          <span title={time.toLocaleString()}>{timeStr}</span>
        </div>
      </div>
    </div>
  );
}

