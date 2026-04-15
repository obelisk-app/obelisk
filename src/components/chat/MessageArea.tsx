'use client';

import { useEffect, useRef, useCallback, useState, Fragment } from 'react';
import { useChatStore, Message } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notification';
import { formatPubkey } from '@/lib/nostr';
import MessageContent from './MessageContent';
import EmojiPicker from './EmojiPicker';
import ProfilePopover from './ProfilePopover';
import MessageReactions from './MessageReactions';
import { slugify } from '@/lib/slug';

function ReplyPreview({ replyTo, profileCache }: {
  replyTo: { id: string; content: string; authorPubkey: string };
  profileCache: Map<string, { name?: string; picture?: string }>;
}) {
  const profile = profileCache.get(replyTo.authorPubkey);
  const name = profile?.name || formatPubkey(replyTo.authorPubkey);

  return (
    <div className="flex items-center gap-1.5 mb-1 pl-11 text-xs">
      <div className="w-0.5 h-4 bg-lc-green/40 rounded-full" />
      <span className="text-lc-green/70 font-medium">{name}</span>
      <span className="text-lc-muted truncate max-w-xs">{replyTo.content}</span>
    </div>
  );
}

const DEFAULT_QUICK_EMOJIS = ['❤️', '🔥', '😂'];
const RECENT_EMOJIS_KEY = 'obelisk:recent-reaction-emojis';
const MAX_RECENT = 3;

function getRecentEmojis(): string[] {
  if (typeof window === 'undefined') return DEFAULT_QUICK_EMOJIS;
  try {
    const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      if (parsed.length >= MAX_RECENT) return parsed.slice(0, MAX_RECENT);
    }
  } catch { /* ignore */ }
  return DEFAULT_QUICK_EMOJIS;
}

function trackRecentEmoji(emoji: string) {
  // Only track native unicode emojis, not custom shortcodes
  if (emoji.startsWith(':') && emoji.endsWith(':')) return;
  try {
    const current = getRecentEmojis();
    const updated = [emoji, ...current.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}


function ContextMenu({ isMe, canModerate, canPin, isPinned, openBelow, onReply, onReport, onEdit, onDelete, onCopyText, onCopyLink, copyLinkLabel, onAddReaction, onTogglePin, onClose }: {
  isMe: boolean;
  canModerate: boolean;
  canPin: boolean;
  isPinned: boolean;
  openBelow?: boolean;
  onReply: () => void;
  onReport: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyText: () => void;
  onCopyLink: () => void;
  copyLinkLabel: string;
  onAddReaction: () => void;
  onTogglePin: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const itemClass = "w-full text-left px-3 py-1.5 text-sm hover:bg-lc-border/40 transition-colors flex items-center gap-2";

  return (
    <div
      ref={menuRef}
      className={`absolute right-0 z-50 bg-lc-dark border border-lc-border rounded-xl shadow-lg py-1 min-w-[180px] ${openBelow ? 'top-full mt-1' : 'bottom-full mb-1'}`}
      data-testid="context-menu"
    >
      <button onClick={() => { onAddReaction(); }} className={`${itemClass} text-lc-white`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        Añadir reacción
      </button>
      <button onClick={() => { onReply(); onClose(); }} className={`${itemClass} text-lc-white`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
        Responder
      </button>
      {isMe && (
        <button onClick={() => { onEdit(); onClose(); }} className={`${itemClass} text-lc-white`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </button>
      )}
      <button onClick={() => { onCopyText(); onClose(); }} className={`${itemClass} text-lc-white`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copiar texto
      </button>
      <button
        onClick={() => { onCopyLink(); }}
        className={`${itemClass} text-lc-white`}
        data-testid="copy-message-link-btn"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        {copyLinkLabel}
      </button>
      {canPin && (
        <button onClick={() => { onTogglePin(); onClose(); }} className={`${itemClass} text-lc-white`} data-testid="pin-menu-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2l8 8-5 1-4 4-1 5-4-4-5 5v-3l5-5-4-4 5-1 4-4z"/></svg>
          {isPinned ? 'Desfijar mensaje' : 'Fijar mensaje'}
        </button>
      )}
      {(isMe || canModerate) && (
        <button onClick={() => { onDelete(); onClose(); }} className={`${itemClass} text-red-400`} data-testid="delete-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          Eliminar mensaje
        </button>
      )}
      {!isMe && (
        <button onClick={() => { onReport(); onClose(); }} className={`${itemClass} text-red-400`} data-testid="report-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          Denunciar mensaje
        </button>
      )}
    </div>
  );
}

// Utility to format day separators
const getDaySeparator = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatMessageTimestamp = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === today.toDateString()) return timeStr;
  if (date.toDateString() === yesterday.toDateString()) return `ayer a las ${timeStr}`;
  return `${date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las ${timeStr}`;
};

function MessageBubble({ message, profileCache, canPin, canModerate, onReply, onReport, onDelete, onToggleReaction, onTogglePin }: {
  message: Message & { replyTo?: { id: string; content: string; authorPubkey: string } | null };
  profileCache: Map<string, { name?: string; picture?: string }>;
  canPin: boolean;
  canModerate: boolean;
  onReply: (msg: Message) => void;
  onReport: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onTogglePin: (msg: Message) => void;
}) {
  const profile = profileCache.get(message.authorPubkey);
  const displayName = profile?.name || formatPubkey(message.authorPubkey);
  const time = new Date(message.createdAt);
  const timeStr = formatMessageTimestamp(time);
  const { profile: myProfile } = useAuthStore();
  const isMe = myProfile?.pubkey === message.authorPubkey;
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [popupBelow, setPopupBelow] = useState(false);
  const [quickEmojis, setQuickEmojis] = useState(DEFAULT_QUICK_EMOJIS);
  const rowRef = useRef<HTMLDivElement>(null);
  const openProfilePopup = useChatStore((s) => s.openProfilePopup);
  const { setEditingMessage, serverEmojis } = useChatStore();

  useEffect(() => {
    setQuickEmojis(getRecentEmojis());
  }, []);

  const handleReaction = useCallback((messageId: string, emoji: string) => {
    trackRecentEmoji(emoji);
    setQuickEmojis(getRecentEmojis());
    onToggleReaction(messageId, emoji);
  }, [onToggleReaction]);

  // Determine if popups should open below (message is in top half of viewport)
  const shouldOpenBelow = useCallback(() => {
    if (!rowRef.current) return false;
    const rect = rowRef.current.getBoundingClientRect();
    return rect.top < window.innerHeight / 2;
  }, []);

  const { activeServerId } = useChatStore();
  const [copyLinkLabel, setCopyLinkLabel] = useState('Copiar enlace');

  const handleCopyText = () => {
    navigator.clipboard.writeText(message.content);
  };

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    const { pinnedChannels, categories } = useChatStore.getState();
    const all = [
      ...pinnedChannels,
      ...categories.flatMap((c) => c.channels),
    ];
    const ch = all.find((c) => c.id === message.channelId);
    if (!ch) return;
    const slug = slugify(ch.name);
    const url = `${window.location.origin}/chat?c=${slug}&m=${message.id}`;
    try {
      navigator.clipboard.writeText(url);
      setCopyLinkLabel('Copiado ✓');
      setTimeout(() => setCopyLinkLabel('Copiar enlace'), 1200);
    } catch {
      setCopyLinkLabel('Error');
      setTimeout(() => setCopyLinkLabel('Copiar enlace'), 1200);
    }
  };

  return (
    <div className="group">
      {/* Reply context */}
      {message.replyTo && (
        <ReplyPreview replyTo={message.replyTo} profileCache={profileCache} />
      )}

      <div ref={rowRef} className="flex items-start gap-2 md:gap-3 px-2 md:px-4 py-1.5 hover:bg-lc-border/20 transition-colors relative">
        {/* Avatar */}
        <button
          type="button"
          onClick={() => openProfilePopup(message.authorPubkey)}
          className="shrink-0 mt-0.5 rounded-full focus:outline-none focus:ring-2 focus:ring-lc-green/50"
          aria-label={`Ver perfil de ${displayName}`}
          data-testid="message-avatar-btn"
        >
          {profile?.picture ? (
            <img
              src={profile.picture}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold">
              {displayName[0]?.toUpperCase() || '?'}
            </div>
          )}
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={() => openProfilePopup(message.authorPubkey)}
              className={`text-sm font-semibold hover:underline focus:outline-none focus:underline ${isMe ? 'text-lc-green' : 'text-lc-white'}`}
              data-testid="message-author-btn"
            >
              {displayName}
            </button>
            <span className="text-xs text-lc-muted">{timeStr}</span>
            {message.editedAt && (
              <span className="text-xs text-lc-muted italic" data-testid="edited-indicator">(editado)</span>
            )}
            {message.pinnedAt && (
              <span
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-lc-green/90"
                title="Mensaje fijado"
                data-testid="pinned-indicator"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M14 2l8 8-5 1-4 4-1 5-4-4-5 5v-3l5-5-4-4 5-1 4-4z" />
                </svg>
                fijado
              </span>
            )}
          </div>
          <div className="text-sm text-lc-white/90 break-words whitespace-pre-wrap">
            <MessageContent content={message.content} />
          </div>
        </div>

        {/* Action toolbar + popups — anchored to top-right of row */}
        <div
          className={`absolute right-2 top-1 z-20 ${showMenu || showEmojiPicker ? 'opacity-100' : 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100'} transition-opacity`}
        >
          <div className="flex gap-0.5 bg-lc-dark border border-lc-border rounded-lg p-0.5 shadow-lg" data-testid="message-toolbar">
            {/* Quick reaction emojis */}
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(message.id, emoji)}
                className="p-1 rounded hover:bg-lc-border/60 text-sm transition-all [@media(hover:none)]:hidden"
                title={`React ${emoji}`}
                data-testid={`quick-react-${emoji}`}
              >
                {emoji}
              </button>
            ))}
            {/* Reply (non-owner) or Edit (owner) */}
            {isMe ? (
              <button
                onClick={() => setEditingMessage(message)}
                className="p-1 rounded hover:bg-lc-border/60 text-lc-muted hover:text-lc-green transition-all [@media(hover:none)]:hidden"
                title="Editar"
                data-testid="edit-btn"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={() => onReply(message)}
                className="p-1 rounded hover:bg-lc-border/60 text-lc-muted hover:text-lc-green transition-all [@media(hover:none)]:hidden"
                title="Responder"
                data-testid="reply-btn"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 17 4 12 9 7"/>
                  <path d="M20 18v-2a4 4 0 00-4-4H4"/>
                </svg>
              </button>
            )}
            {/* Pin toggle — admin/owner only */}
            {canPin && (
              <button
                onClick={() => onTogglePin(message)}
                className={`p-1 rounded hover:bg-lc-border/60 transition-all [@media(hover:none)]:hidden ${
                  message.pinnedAt ? 'text-lc-green' : 'text-lc-muted hover:text-lc-green'
                }`}
                title={message.pinnedAt ? 'Desfijar mensaje' : 'Fijar mensaje'}
                data-testid="pin-btn"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={message.pinnedAt ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2l8 8-5 1-4 4-1 5-4-4-5 5v-3l5-5-4-4 5-1 4-4z" />
                </svg>
              </button>
            )}
            {/* Three dots menu */}
            <button
              onClick={() => { if (!showMenu) setPopupBelow(shouldOpenBelow()); setShowMenu(!showMenu); }}
              className="p-1 rounded hover:bg-lc-border/60 text-lc-muted hover:text-lc-white transition-all"
              title="Más opciones"
              data-testid="menu-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5"/>
                <circle cx="12" cy="12" r="1.5"/>
                <circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
          </div>

          {/* Context menu dropdown — anchored to toolbar */}
          {showMenu && (
            <ContextMenu
              isMe={isMe}
              canModerate={canModerate}
              canPin={canPin}
              isPinned={!!message.pinnedAt}
              openBelow={popupBelow}
              onReply={() => onReply(message)}
              onReport={() => onReport(message)}
              onEdit={() => setEditingMessage(message)}
              onDelete={() => onDelete(message)}
              onCopyText={handleCopyText}
              onCopyLink={handleCopyLink}
              copyLinkLabel={copyLinkLabel}
              onAddReaction={() => { setShowMenu(false); setShowEmojiPicker(true); }}
              onTogglePin={() => onTogglePin(message)}
              onClose={() => setShowMenu(false)}
            />
          )}

          {/* Emoji picker — anchored to toolbar */}
          {showEmojiPicker && (
            <EmojiPicker
              className={`absolute right-0 z-50 ${popupBelow ? 'top-full mt-1' : 'bottom-full mb-1'}`}
              onSelect={(emoji) => handleReaction(message.id, emoji)}
              onClose={() => setShowEmojiPicker(false)}
              serverEmojis={serverEmojis}
            />
          )}
        </div>
      </div>

      {/* Reactions display */}
      <div className="pl-11 mt-1">
        <MessageReactions
          reactions={message.reactions}
          myPubkey={myProfile?.pubkey}
          onToggle={(emoji) => handleReaction(message.id, emoji)}
          serverEmojis={serverEmojis}
          profileCache={profileCache}
        />
      </div>

    </div>
  );
}

export default function MessageArea({ profileCache, onDelete, onToggleReaction }: {
  profileCache: Map<string, { name?: string; picture?: string }>;
  onDelete: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const { messages, isLoadingMessages, activeChannelId, activePostId, pinnedChannels, categories, hasMoreMessages, messageCursor, prependMessages, setMessageCursor, highlightedMessageId, setIsNearBottom, myRole, updatePinState } = useChatStore();
  const canPin = myRole === 'owner' || myRole === 'admin';
  const canModerate = myRole === 'owner' || myRole === 'admin' || myRole === 'mod';

  const handleTogglePin = useCallback(async (msg: Message) => {
    if (!activeChannelId) return;
    // Optimistic toggle — rollback on error.
    const wasPinned = !!msg.pinnedAt;
    updatePinState(msg.id, wasPinned ? null : new Date().toISOString(), null);
    try {
      const res = await fetch(
        `/api/channels/${activeChannelId}/messages/${msg.id}/pin`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error('pin failed');
      // Server broadcasts message-pinned, which will overwrite with the
      // authoritative pinnedAt/pinnedByPubkey for all other clients. For
      // the current client, the socket echo will also fire and reconcile.
    } catch {
      // Revert optimistic change.
      updatePinState(msg.id, wasPinned ? msg.pinnedAt ?? null : null, msg.pinnedByPubkey ?? null);
    }
  }, [activeChannelId, updatePinState]);
  const { setReplyingTo } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isNearBottomRef = useRef(true);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportSending, setReportSending] = useState(false);

  // Anchor the "New messages" separator at the server-authored `lastReadAt`
  // boundary, snapshotted when the channel is first opened so subsequent
  // mark-read sweeps don't make it jump.
  //
  // Using the timestamp — instead of `messages.length - unreadCount` — is
  // what prevents the viewer's own messages from rendering below the red
  // line. `channelUnreads` excludes self on the server, but the local
  // `messages` array doesn't, so an index derived from the count places the
  // separator too far back and traps own messages beneath it.
  //
  // Fallback: when we don't know `lastReadAt` yet (first load race, offline
  // cache miss), fall back to walking back `count` *other-authored*
  // messages, which still matches the server's counting semantics.
  const { profile: viewerProfile } = useAuthStore();
  const viewerPubkey = viewerProfile?.pubkey ?? null;
  const separatorLastReadAtRef = useRef<number | null>(null);
  const separatorCountRef = useRef<number>(0);
  const separatorChannelRef = useRef<string | null>(null);
  if (activeChannelId && separatorChannelRef.current !== activeChannelId) {
    separatorChannelRef.current = activeChannelId;
    const notif = useNotificationStore.getState();
    separatorCountRef.current = notif.channelUnreads[activeChannelId] || 0;
    const lastRead = notif.channelLastReadAt[activeChannelId];
    separatorLastReadAtRef.current = typeof lastRead === 'number' ? lastRead : null;
  }
  const separatorIndex = (() => {
    if (messages.length === 0) return -1;
    const count = separatorCountRef.current;
    if (count <= 0) return -1;
    const lastRead = separatorLastReadAtRef.current;
    if (lastRead !== null) {
      // First message strictly newer than the read cursor — if it's the
      // viewer's own message we still anchor above it; that means an own
      // message can render below the line, but only if the viewer sent it
      // post-read (rare in practice; mark-read fires on send when the
      // channel is in view).
      for (let i = 0; i < messages.length; i++) {
        const ts = new Date(messages[i].createdAt).getTime();
        if (ts > lastRead && messages[i].authorPubkey !== viewerPubkey) {
          return i;
        }
      }
      return -1;
    }
    // Count-based fallback.
    let remaining = count;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].authorPubkey !== viewerPubkey) {
        remaining--;
        if (remaining === 0) return i;
      }
    }
    return -1;
  })();

  const allChannels = [
    ...pinnedChannels,
    ...categories.flatMap(c => c.channels),
  ];
  const activeChannel = allChannels.find(c => c.id === activeChannelId);

  // Track scroll position. Also push into the chat store so useReadTracker
  // can gate mark-as-read on "the user is actually near the bottom".
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 150;
    const near = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    if (isNearBottomRef.current !== near) {
      isNearBottomRef.current = near;
      setIsNearBottom(near);
    }
  }, [setIsNearBottom]);

  // Only auto-scroll if user is near the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Jump to highlighted message from search
  useEffect(() => {
    if (!highlightedMessageId) return;
    const el = messageRefs.current.get(highlightedMessageId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('search-highlight');
      const timer = setTimeout(() => {
        el.classList.remove('search-highlight');
        useChatStore.setState({ highlightedMessageId: null });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightedMessageId, messages]);

  // Track the bottom-most visible message and persist it as the per-channel
  // "last seen" anchor. On a browser refresh, `src/app/chat/page.tsx` reads
  // this value (via URL ?m= or localStorage) and queues it as the
  // `highlightedMessageId` so the user lands on the same spot they left off.
  //
  // Implementation notes:
  //  - IntersectionObserver is guarded because jsdom (our test env) does not
  //    implement it — the effect no-ops there, which is fine.
  //  - Writes are debounced (500ms) so scroll gestures don't spam
  //    localStorage / history.replaceState.
  //  - We clear `visible` across channel switches via the effect deps so the
  //    bottom-most calculation is always relative to the current channel.
  useEffect(() => {
    if (!activeChannelId || messages.length === 0) return;
    if (typeof window === 'undefined') return;
    if (typeof (window as any).IntersectionObserver === 'undefined') return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const visible = new Set<string>();
    let saveTimeout: number | null = null;

    const persist = (id: string) => {
      if (saveTimeout !== null) clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(() => {
        try {
          localStorage.setItem(`chat:lastSeen:${activeChannelId}`, id);
          const sp = new URLSearchParams(window.location.search);
          // Only rewrite the URL if we're still on this channel — guards
          // against a stale debounced write firing after a channel switch.
          if (sp.get('c') === activeChannelId) {
            sp.set('m', id);
            window.history.replaceState(
              null,
              '',
              `${window.location.pathname}?${sp.toString()}`,
            );
          }
        } catch {
          // localStorage / history may be unavailable (private mode,
          // sandboxed iframes) — fail silently, restoration is best-effort.
        }
      }, 500);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.messageId;
          if (!id) continue;
          if (e.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // Bottom-most = largest index in the `messages` array.
        let bottomId: string | null = null;
        let bottomIdx = -1;
        visible.forEach((id) => {
          const idx = messages.findIndex((m) => m.id === id);
          if (idx > bottomIdx) {
            bottomIdx = idx;
            bottomId = id;
          }
        });
        if (bottomId) persist(bottomId);
      },
      { root: container, threshold: 0.5 },
    );

    messageRefs.current.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      if (saveTimeout !== null) clearTimeout(saveTimeout);
    };
  }, [activeChannelId, messages]);

  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
  }, [setReplyingTo]);

  const handleDeleteMessage = useCallback((msg: Message) => {
    onDelete(msg.id);
  }, [onDelete]);

  const [loadingOlder, setLoadingOlder] = useState(false);
  const handleLoadOlder = useCallback(async () => {
    if (!activeChannelId || !messageCursor || loadingOlder) return;
    setLoadingOlder(true);
    const container = scrollContainerRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    try {
      const postParam = activePostId ? `&postId=${encodeURIComponent(activePostId)}` : '';
      const res = await fetch(`/api/channels/${activeChannelId}/messages?cursor=${messageCursor}${postParam}`);
      if (res.ok) {
        const data = await res.json();
        prependMessages(data.messages);
        setMessageCursor(data.nextCursor, !!data.nextCursor);
        // Maintain scroll position after prepending
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevHeight;
          }
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [activeChannelId, activePostId, messageCursor, loadingOlder, prependMessages, setMessageCursor]);

  const handleReport = useCallback((msg: Message) => {
    setReportTarget(msg);
    setReportReason('');
  }, []);

  const submitReport = async () => {
    if (!reportTarget || !reportReason.trim()) return;
    setReportSending(true);
    await fetch('/api/moderation/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: reportTarget.id, reason: reportReason.trim() }),
    });
    setReportSending(false);
    setReportTarget(null);
  };

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-lc-muted">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 opacity-30">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <p className="text-lg font-medium">Select a channel</p>
          <p className="text-sm">Pick a channel from the sidebar to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" data-testid="report-modal">
          <div className="lc-card p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-lc-white mb-2">Report Message</h3>
            <div className="bg-lc-black/50 rounded-lg p-3 mb-3 border border-lc-border">
              <p className="text-sm text-lc-white truncate">{reportTarget.content}</p>
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Reason for report..."
              className="w-full px-3 py-2 rounded-lg bg-lc-dark border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none resize-none h-20"
            />
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 rounded-full text-sm text-lc-muted border border-lc-border hover:border-lc-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                disabled={!reportReason.trim() || reportSending}
                className="px-4 py-2 rounded-full text-sm text-white font-medium bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {reportSending ? 'Sending...' : 'Report'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Messages — scrollable */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4"
      >
        {isLoadingMessages ? (
          <div className="px-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="lc-skeleton-circle w-8 h-8" />
                <div className="flex-1 space-y-1">
                  <div className="lc-skeleton h-4 w-24" />
                  <div className="lc-skeleton h-4 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-lc-muted">
              <p className="text-lg font-medium mb-1">No messages yet</p>
              <p className="text-sm">Be the first to say something in #{activeChannel?.name}!</p>
            </div>
          </div>
        ) : (
          <>
            {hasMoreMessages && (
              <div className="flex justify-center py-2">
                <button
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                  className="text-sm text-lc-muted hover:text-lc-green transition-colors disabled:opacity-50"
                  data-testid="load-older-btn"
                >
                  {loadingOlder ? 'Loading...' : 'Load earlier messages'}
                </button>
              </div>
            )}
            {messages.map((msg, idx) => {
                const currentDate = new Date(msg.createdAt);
                const prevDate = idx > 0 ? new Date(messages[idx - 1].createdAt) : null;
                // Force a separator if it's the first message or if the date changes
                const showDate = !prevDate || currentDate.toDateString() !== prevDate.toDateString();
                
                // For debugging: log to console if separators are being triggered
                if (showDate) {
                  console.log(`Rendering date separator for date: ${currentDate.toDateString()}`);
                }

                return (
                    <Fragment key={msg.id}>
                        {showDate && (
                            <div className="sticky top-0 z-20 flex items-center gap-2 px-4 py-3 bg-lc-black/90 backdrop-blur-sm">
                                <div className="flex-1 h-px bg-lc-border" />
                                <span className="text-xs text-lc-muted uppercase tracking-wider font-semibold">
                                    {getDaySeparator(currentDate)}
                                </span>
                                <div className="flex-1 h-px bg-lc-border" />
                            </div>
                        )}
                        {idx === separatorIndex && (
                            <div
                                className="flex items-center gap-2 px-4 py-1 my-1"
                                data-testid="new-messages-separator"
                            >
                                <div className="flex-1 h-px bg-red-500/60" />
                                <span className="text-[10px] uppercase tracking-wider text-red-400 font-semibold">
                                    New messages
                                </span>
                                <div className="flex-1 h-px bg-red-500/60" />
                            </div>
                        )}
                        <div
                            ref={(el) => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }}
                            data-message-id={msg.id}
                            className={highlightedMessageId === msg.id ? 'bg-lc-green/10 transition-colors duration-1000' : ''}
                        >
                            <MessageBubble
                                message={activePostId && msg.replyTo?.id === activePostId ? { ...msg, replyTo: null } : msg}
                                profileCache={profileCache}
                                canPin={canPin}
                                canModerate={canModerate}
                                onReply={handleReply}
                                onReport={handleReport}
                                onDelete={handleDeleteMessage}
                                onToggleReaction={onToggleReaction}
                                onTogglePin={handleTogglePin}
                            />
                        </div>
                    </Fragment>
                );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  );
}
