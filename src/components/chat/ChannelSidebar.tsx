'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useChatStore, Category, Channel } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { useVoiceStore } from '@/store/voice';
import { useNotificationStore } from '@/store/notification';
import ProfilePanel from './ProfilePanel';
import MemberInviteCard from '../invites/MemberInviteCard';
import { canWriteInChannel } from '@/lib/roles';
import ChannelEmoji from './ChannelEmoji';
import { slugify } from '@/lib/slug';
import { getActiveVoiceClient } from '@/lib/voice-active-client';

const EMPTY_FOLLOWED_POST_IDS: string[] = [];
const EMPTY_FOLLOWED_POST_META: Record<string, { id: string; title: string; channelId: string; channelName: string; serverId: string }> = {};

function ChannelTypeIcon({ type }: { type: string }) {
  const wrapperClass = "shrink-0 w-4 h-4 flex items-center justify-center text-lc-muted/60";
  if (type === 'forum') {
    return (
      <span className={wrapperClass}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      </span>
    );
  }
  if (type === 'voice') {
    return (
      <span className={wrapperClass}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
          <path d="M19 10v2a7 7 0 01-14 0v-2"/>
        </svg>
      </span>
    );
  }
  return <span className={`${wrapperClass} font-bold text-xs`}>#</span>;
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-lc-muted"
      aria-label="Private channel (write access)"
      data-testid="channel-write-lock-icon"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
}

function ReadOnlyIcon() {
  return (
    <svg
      width="14"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-lc-muted"
      aria-label="Read-only channel"
      data-testid="channel-read-only-icon"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function ChannelContextMenu({ anchor, onCopyLink, copyLabel, onClose }: {
  anchor: { x: number; y: number };
  onCopyLink: () => void;
  copyLabel: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      style={{ top: anchor.y, left: anchor.x }}
      className="fixed z-50 bg-lc-dark border border-lc-border rounded-xl shadow-lg py-1 min-w-[180px]"
      data-testid="channel-context-menu"
    >
      <button
        onClick={onCopyLink}
        className="w-full text-left px-3 py-1.5 text-sm text-lc-white hover:bg-lc-border/40 transition-colors flex items-center gap-2"
        data-testid="copy-channel-link-btn"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        {copyLabel}
      </button>
    </div>,
    document.body
  );
}

function ForumPostRow({
  post,
  isActive,
  onClick,
}: {
  post: { id: string; title: string; channelName: string };
  isActive: boolean;
  onClick: () => void;
}) {
  const toggleFollowPost = useChatStore((s) => s.toggleFollowPost);
  const unreadCount = useNotificationStore((s) => s.postUnreads[post.id] || 0);
  const hasMention = useNotificationStore((s) => s.postMentions[post.id] || false);
  const hasUnread = unreadCount > 0;
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copiar enlace');

  const openMenuAt = (x: number, y: number) => {
    setCopyLabel('Copiar enlace');
    setMenuAnchor({ x, y });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  };

  const handleDotsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Right-align the menu to the dots button so it stays inside the sidebar
    // instead of overflowing into the message area.
    const MENU_WIDTH = 200;
    openMenuAt(Math.max(8, rect.right - MENU_WIDTH), rect.bottom);
  };

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    const slug = slugify(post.channelName);
    const url = `${window.location.origin}/chat?c=${slug}&p=${post.id}`;
    try {
      navigator.clipboard.writeText(url);
      setCopyLabel('Copiado ✓');
    } catch {
      setCopyLabel('Error');
    }
    setTimeout(() => setMenuAnchor(null), 600);
  };

  const handleUnfollow = () => {
    void toggleFollowPost(post.id);
    setMenuAnchor(null);
  };

  return (
    <div className="group relative">
      {/* Tree-connector: horizontal stub from the vertical rail to this row */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 w-6 h-px bg-lc-border"
      />
      <button
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-1.5 pl-12 pr-8 py-1 rounded-md text-[15px] text-left transition-colors ${
          isActive
            ? 'bg-lc-border text-lc-white font-medium'
            : hasUnread
              ? 'text-lc-white font-semibold hover:bg-lc-border/50'
              : 'text-lc-muted hover:text-lc-white hover:bg-lc-border/50'
        }`}
        data-testid={`sidebar-post-row-${post.id}`}
      >
        <span className="truncate flex-1 text-left">{post.title?.trim() || '…'}</span>
        {(hasUnread || hasMention) && !isActive && (
          <span className={`shrink-0 text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 gap-0.5 ${
            hasMention ? 'bg-red-500 text-white' : 'bg-lc-muted/30 text-lc-white'
          }`}>
            {hasMention && <span aria-label="mentioned">@</span>}
            {hasUnread && <span>{unreadCount}</span>}
          </span>
        )}
      </button>
      <button
        onClick={handleDotsClick}
        onContextMenu={handleContextMenu}
        title="Más opciones"
        aria-label="Más opciones"
        data-testid={`sidebar-post-dots-${post.id}`}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-lc-muted hover:text-lc-white hover:bg-lc-border/60 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>
      {menuAnchor && (
        <ForumPostContextMenu
          anchor={menuAnchor}
          copyLabel={copyLabel}
          onCopyLink={handleCopyLink}
          onUnfollow={handleUnfollow}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </div>
  );
}

function ForumPostContextMenu({
  anchor,
  copyLabel,
  onCopyLink,
  onUnfollow,
  onClose,
}: {
  anchor: { x: number; y: number };
  copyLabel: string;
  onCopyLink: () => void;
  onUnfollow: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      style={{ top: anchor.y, left: anchor.x }}
      className="fixed z-50 bg-lc-dark border border-lc-border rounded-xl shadow-lg py-1 min-w-[180px]"
      data-testid="forum-post-context-menu"
    >
      <button
        onClick={onCopyLink}
        className="w-full text-left px-3 py-1.5 text-sm text-lc-white hover:bg-lc-border/40 transition-colors flex items-center gap-2"
        data-testid="forum-post-row-copy-link"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        {copyLabel}
      </button>
      <button
        onClick={onUnfollow}
        className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
        data-testid="forum-post-row-unfollow"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Dejar de seguir
      </button>
    </div>,
    document.body
  );
}

function ChannelItem({ channel, isActive, onClick, followedPosts, activePostId, onSelectPost }: {
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
  followedPosts?: Array<{ id: string; title: string; channelName: string }>;
  activePostId?: string | null;
  onSelectPost?: (postId: string, channelName: string) => void;
}) {
  const hasFollowedPosts = (followedPosts?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(true);
  const canExpand = channel.type === 'forum' && hasFollowedPosts;
  const channelUnread = useNotificationStore((s) => s.channelUnreads[channel.id] || 0);
  const channelMention = useNotificationStore((s) => s.channelMentions[channel.id] || false);
  const postUnreadsMap = useNotificationStore((s) => s.postUnreads);
  const postMentionsMap = useNotificationStore((s) => s.postMentions);
  // Forum channels use their followed-thread tallies as the source of truth
  // for the parent badge. `channelUnreads` double-counts what's already in
  // `postUnreads` (every forum reply bumps both), so aggregating them would
  // inflate the number the user sees. Mentions: a non-follower view can't
  // get a forum mention today — we auto-subscribe on mention — so the
  // channel-level flag just mirrors one of the post flags anyway.
  //
  // Plain text channels have no sub-threads and use the raw channel tallies.
  const [unreadCount, hasMention] = (() => {
    if (channel.type !== 'forum') {
      return [channelUnread, channelMention] as const;
    }
    let sum = 0;
    let mention = false;
    if (followedPosts) {
      for (const p of followedPosts) {
        sum += postUnreadsMap[p.id] || 0;
        if (postMentionsMap[p.id]) mention = true;
      }
    }
    // A mention flagged on the channel (e.g. from legacy hydration paths)
    // still counts — don't drop it on the floor.
    if (channelMention) mention = true;
    return [sum, mention] as const;
  })();
  const hasUnread = unreadCount > 0;
  const myRole = useChatStore((s) => s.myRole);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const isWriteLocked = !canWriteInChannel(myRole ?? 'member', {
    writePermission: channel.writePermission ?? null,
  });
  const hasRestrictedWrite =
    !!channel.writePermission && channel.writePermission !== 'everyone';
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copiar enlace');

  const openMenuAt = (x: number, y: number) => {
    setCopyLabel('Copiar enlace');
    setMenuAnchor({ x, y });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  };

  const handleDotsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const MENU_WIDTH = 200;
    openMenuAt(Math.max(8, rect.right - MENU_WIDTH), rect.bottom);
  };

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    // Short link: just the channel slug. The chat page resolves the slug
    // across the viewer's accessible servers, so no server id is needed.
    // Channel.name is already constrained to [a-z0-9_-], but slugify guards
    // against any drift in the future.
    const slug = slugify(channel.name);
    const url = `${window.location.origin}/chat?c=${slug}`;
    try {
      navigator.clipboard.writeText(url);
      setCopyLabel('Copiado ✓');
    } catch {
      setCopyLabel('Error');
    }
    setTimeout(() => {
      setMenuAnchor(null);
    }, 600);
  };

  return (
    <div>
    <div className="group relative">
      <button
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-1.5 py-1 pl-2 pr-8 rounded-md text-[15px] transition-colors ${
          isActive
            ? 'bg-lc-border text-lc-white font-medium'
            : hasUnread
              ? 'text-lc-white font-semibold hover:bg-lc-border/50'
              : 'text-lc-muted hover:text-lc-white hover:bg-lc-border/50'
        }`}
      >
        <ChannelTypeIcon type={channel.type} />
        <span className="shrink-0 w-5 h-5 flex items-center justify-center text-base leading-none">
          {channel.emoji ? <ChannelEmoji value={channel.emoji} /> : null}
        </span>
        <span className="truncate">{channel.name}</span>
        {canExpand && (
          <span
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpanded((v) => !v); }}
            role="button"
            aria-label={expanded ? 'Contraer publicaciones' : 'Expandir publicaciones'}
            data-testid={`channel-expand-${channel.id}`}
            className="shrink-0 ml-1 p-1 rounded text-lc-muted hover:text-lc-white hover:bg-lc-border/60 cursor-pointer flex items-center justify-center"
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
              className={`transition-transform ${expanded ? '' : '-rotate-90'}`}
              aria-hidden="true"
            >
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </span>
        )}
        {isWriteLocked ? <ReadOnlyIcon /> : hasRestrictedWrite ? <LockIcon /> : null}
        {(hasUnread || hasMention) && !isActive && (
          <span className={`ml-auto shrink-0 text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 gap-0.5 ${
            hasMention ? 'bg-red-500 text-white' : 'bg-lc-muted/30 text-lc-white'
          }`}>
            {hasMention && <span aria-label="mentioned">@</span>}
            {hasUnread && <span>{unreadCount}</span>}
          </span>
        )}
      </button>
      <button
        onClick={handleDotsClick}
        onContextMenu={handleContextMenu}
        title="Más opciones"
        aria-label="Más opciones"
        data-testid={`channel-dots-${channel.id}`}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-lc-muted hover:text-lc-white hover:bg-lc-border/60 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="19" cy="12" r="1.5"/>
        </svg>
      </button>
      {menuAnchor && (
        <ChannelContextMenu
          anchor={menuAnchor}
          copyLabel={copyLabel}
          onCopyLink={handleCopyLink}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </div>
    {canExpand && expanded && followedPosts && (
      <FollowedPostsList
        followedPosts={followedPosts}
        activePostId={activePostId ?? null}
        onSelectPost={onSelectPost}
        channelId={channel.id}
      />
    )}
    </div>
  );
}

function FollowedPostsList({
  followedPosts,
  activePostId,
  onSelectPost,
  channelId,
}: {
  followedPosts: Array<{ id: string; title: string; channelName: string }>;
  activePostId: string | null;
  onSelectPost?: (postId: string, channelName: string) => void;
  channelId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const unreadMap = useNotificationStore((s) => s.postUnreads);
  const LIMIT = 5;

  // Sort: unread (desc by count) first, then the rest in original order.
  const sorted = [...followedPosts].sort((a, b) => {
    const ua = unreadMap[a.id] || 0;
    const ub = unreadMap[b.id] || 0;
    if (ua === ub) return 0;
    return ub - ua;
  });

  const visible = expanded ? sorted : sorted.slice(0, LIMIT);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div
      className="relative mt-1 mb-1 space-y-1 before:content-[''] before:absolute before:left-3 before:top-0 before:bottom-2 before:w-px before:bg-lc-border"
      data-testid={`channel-followed-posts-${channelId}`}
    >
      {visible.map((post) => (
        <ForumPostRow
          key={post.id}
          post={post}
          isActive={activePostId === post.id}
          onClick={() => onSelectPost?.(post.id, post.channelName)}
        />
      ))}
      {hiddenCount > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full pl-12 pr-8 py-1 text-xs text-left text-lc-muted hover:text-lc-white transition-colors"
          data-testid={`channel-followed-posts-more-${channelId}`}
        >
          + {hiddenCount} more
        </button>
      )}
      {expanded && sorted.length > LIMIT && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full pl-12 pr-8 py-1 text-xs text-left text-lc-muted hover:text-lc-white transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  );
}

function CategorySection({ category, activeChannelId, onSelectChannel, followedByChannel, activePostId, onSelectPost }: {
  category: Category;
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  followedByChannel?: Record<string, Array<{ id: string; title: string; channelName: string }>>;
  activePostId?: string | null;
  onSelectPost?: (postId: string, channelName: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mt-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1 px-1 mb-1 text-[11px] font-semibold uppercase tracking-wider text-lc-muted hover:text-lc-white transition-colors"
      >
        <span className="flex-1 flex items-center gap-2 min-w-0">
          <span className="flex-1 h-px bg-lc-border" />
          <span className="shrink-0">[ {category.name} ]</span>
          <span className="flex-1 h-px bg-lc-border" />
        </span>
        <span className="shrink-0 p-1 rounded hover:bg-lc-border/60">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
            className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
          >
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-0.5 pl-0.5">
          {category.channels.map((ch) => (
            <ChannelItem
              key={ch.id}
              channel={ch}
              isActive={ch.id === activeChannelId}
              onClick={() => onSelectChannel(ch.id)}
              followedPosts={followedByChannel?.[ch.id]}
              activePostId={activePostId}
              onSelectPost={onSelectPost}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Persistent voice status bar — renders whenever a voice call is active,
 * regardless of which channel is open in the main panel. Lets users
 * mic/deafen/leave without navigating back to the voice channel view.
 */
function VoiceStatusBar() {
  const router = useRouter();
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const pinnedChannels = useChatStore((s) => s.pinnedChannels);
  const categories = useChatStore((s) => s.categories);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  if (!currentVoiceChannelId) return null;

  const channel =
    pinnedChannels.find((c) => c.id === currentVoiceChannelId) ??
    categories.flatMap((c) => c.channels).find((c) => c.id === currentVoiceChannelId);

  const handleMute = () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    const next = !isMuted;
    if (next) client.mute();
    else client.unmute().catch(() => {});
    useVoiceStore.getState().setMuted(next);
  };

  const handleDeafen = () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    const next = !isDeafened;
    client.setDeafened(next);
    useVoiceStore.getState().setDeafened(next);
    // Deafening implies muting (you can't meaningfully speak while not hearing).
    if (next && !isMuted) {
      client.mute();
      useVoiceStore.getState().setMuted(true);
    }
  };

  const handleLeave = () => {
    const client = getActiveVoiceClient();
    client?.leave();
    useVoiceStore.getState().leaveVoice();
  };

  const handleJump = () => {
    if (!channel || !activeServerId) return;
    setActiveChannel(channel.id);
    const sp = new URLSearchParams(window.location.search);
    sp.set('c', channel.id);
    router.replace(`${window.location.pathname}?${sp.toString()}`);
  };

  const activeServer = useChatStore.getState().servers.find((s) => s.id === (useChatStore.getState().activeServerId));

  const handleToggleCamera = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    const store = useVoiceStore.getState();
    try {
      if (store.isCameraOn) {
        await client.stopCamera();
        store.setCameraOn(false);
      } else {
        await client.startCamera();
        store.setCameraOn(true);
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') return;
      const msg = err?.message || 'Failed to toggle camera';
      const s = useVoiceStore.getState();
      if (/limit|already sharing/i.test(msg)) s.setLimitNotice(msg);
      else s.setError(msg);
    }
  };

  const handleToggleScreenShare = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    const store = useVoiceStore.getState();
    try {
      if (store.isScreenSharing) {
        await client.stopScreenShare();
        store.setScreenSharing(false);
      } else {
        await client.startScreenShare();
        store.setScreenSharing(true);
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') return;
      const msg = err?.message || 'Failed to share screen';
      const s = useVoiceStore.getState();
      if (/limit|already sharing/i.test(msg)) s.setLimitNotice(msg);
      else s.setError(msg);
    }
  };

  return (
    <div className="px-2 md:px-4 pt-2 shrink-0" data-testid="voice-status-bar">
      <div className="bg-lc-black/60 border border-lc-border rounded-xl p-2 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleJump}
            className="flex-1 min-w-0 flex items-center gap-2 text-left hover:bg-lc-border/30 rounded-md px-1.5 py-1 transition"
            title="Go to voice channel"
          >
            <span className="shrink-0 w-8 h-8 rounded-md bg-lc-green/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-green">
                <path d="M2 12h2"/><path d="M6 8v8"/><path d="M10 4v16"/><path d="M14 8v8"/><path d="M18 10v4"/><path d="M22 12h-2"/>
              </svg>
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm text-lc-green font-semibold">Detalles de voz</span>
              <span className="block text-xs text-lc-muted truncate">
                {(channel?.name ?? 'Canal de voz') + (activeServer?.name ? ` / ${activeServer.name}` : '')}
              </span>
            </span>
          </button>
          <button
            onClick={handleLeave}
            className="w-7 h-7 rounded-md bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors"
            title="Desconectar"
            data-testid="voice-bar-leave"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-1 w-full">
          <button
            onClick={handleToggleCamera}
            className={`flex-1 h-8 rounded-md flex items-center justify-center transition-colors ${
              isCameraOn
                ? 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30'
                : 'bg-lc-border/40 hover:bg-lc-border/60 text-lc-muted hover:text-lc-white'
            }`}
            title={isCameraOn ? 'Apagar cámara' : 'Encender cámara'}
            data-testid="voice-bar-camera"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isCameraOn ? (
                <>
                  <path d="M23 7l-7 5 7 5V7z"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </>
              ) : (
                <>
                  <path d="M23 7l-7 5 7 5V7z"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  <line x1="2" y1="2" x2="22" y2="22"/>
                </>
              )}
            </svg>
          </button>
          <button
            onClick={handleToggleScreenShare}
            className={`flex-1 h-8 rounded-md flex items-center justify-center transition-colors ${
              isScreenSharing
                ? 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30'
                : 'bg-lc-border/40 hover:bg-lc-border/60 text-lc-muted hover:text-lc-white'
            }`}
            title={isScreenSharing ? 'Dejar de compartir' : 'Compartir pantalla'}
            data-testid="voice-bar-screenshare"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <path d="M12 7v6"/><path d="M9 10l3-3 3 3"/>
            </svg>
          </button>
          <button
            disabled
            className="flex-1 h-8 rounded-md bg-lc-border/40 text-lc-muted/40 flex items-center justify-center cursor-not-allowed"
            title="Actividades (próximamente)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <line x1="7" y1="10" x2="7" y2="14"/>
              <line x1="5" y1="12" x2="9" y2="12"/>
              <circle cx="16" cy="11" r="1"/>
              <circle cx="18" cy="13" r="1"/>
            </svg>
          </button>
          <button
            disabled
            className="flex-1 h-8 rounded-md bg-lc-border/40 text-lc-muted/40 flex items-center justify-center cursor-not-allowed"
            title="Soundboard (próximamente)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function UserPanel() {
  const router = useRouter();
  const { profile, logout } = useAuthStore();
  const [showProfile, setShowProfile] = useState(false);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const voiceActive = !!currentVoiceChannelId;

  const handleLogout = () => {
    logout();
    setShowProfile(false);
    router.push('/');
  };

  const handleMute = () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    const next = !isMuted;
    if (next) client.mute();
    else client.unmute().catch(() => {});
    useVoiceStore.getState().setMuted(next);
  };

  const handleDeafen = () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    const next = !isDeafened;
    client.setDeafened(next);
    useVoiceStore.getState().setDeafened(next);
    if (next && !isMuted) {
      client.mute();
      useVoiceStore.getState().setMuted(true);
    }
  };

  const handleLeave = () => {
    const client = getActiveVoiceClient();
    client?.leave();
    useVoiceStore.getState().leaveVoice();
  };

  return (
    <div className="px-2 md:px-4 pb-3 md:pb-4 pt-2 shrink-0 relative">
      <div className="w-full flex items-center gap-2 bg-lc-border/50 rounded-xl px-3 py-2">
        <button
          onClick={() => setShowProfile(!showProfile)}
          className="flex items-center gap-2 flex-1 min-w-0 rounded-lg hover:bg-lc-border/40 transition -mx-1 px-1 py-0.5"
        >
          <div className="relative shrink-0">
            {profile?.picture ? (
              <img src={profile.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold">
                {(profile?.name || profile?.displayName || 'A')[0].toUpperCase()}
              </div>
            )}
            {voiceActive && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-lc-green border-2 border-lc-dark"
                aria-label="Voice connected"
              />
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium text-lc-white truncate">
              {profile?.displayName || profile?.name || 'Anon'}
            </div>
            {voiceActive ? (
              <div className="text-[10px] text-lc-green truncate flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 010 7.07"/>
                </svg>
                En canal de voz
              </div>
            ) : (
              <div className="text-[10px] text-lc-muted truncate font-mono">
                {profile?.npub ? `${profile.npub.slice(0, 16)}...` : ''}
              </div>
            )}
          </div>
        </button>

        {voiceActive ? (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleMute}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                isMuted ? 'text-red-400 hover:bg-red-600/20' : 'text-lc-muted hover:text-lc-white hover:bg-lc-border/60'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
              data-testid="voice-bar-mute"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isMuted ? (
                  <>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                    <path d="M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .74-.11 1.46-.33 2.13"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                  </>
                ) : (
                  <>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </>
                )}
              </svg>
            </button>
            <button
              onClick={handleDeafen}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                isDeafened ? 'text-red-400 hover:bg-red-600/20' : 'text-lc-muted hover:text-lc-white hover:bg-lc-border/60'
              }`}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
              data-testid="voice-bar-deafen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isDeafened ? (
                  <>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M3 18v-6a9 9 0 0 1 9-9"/>
                    <path d="M21 12v6a2 2 0 0 1-2 2h-1"/>
                  </>
                ) : (
                  <>
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                  </>
                )}
              </svg>
            </button>
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-lc-muted hover:text-lc-white hover:bg-lc-border/60 transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="p-1 rounded-md text-lc-muted hover:text-lc-white hover:bg-lc-border/60 transition-colors shrink-0"
            title="Settings"
            aria-label="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        )}
      </div>

      {showProfile && (
        <ProfilePanel onClose={() => setShowProfile(false)} onLogout={handleLogout} />
      )}
    </div>
  );
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240;
const STORAGE_KEY = 'obelisk:channel-sidebar-width';

function useSidebarWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) setWidth(saved);
  }, []);

  const setAndPersist = useCallback((w: number) => {
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
    setWidth(clamped);
    localStorage.setItem(STORAGE_KEY, String(clamped));
  }, []);

  return [width, setAndPersist] as const;
}

function ResizeHandle({ onResize }: { onResize: (w: number) => void }) {
  const draggingRef = useRef(false);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      onResize(ev.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      data-testid="channel-sidebar-resize-handle"
      className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-lc-green/40 active:bg-lc-green/60 transition-colors z-10"
    />
  );
}

export default function ChannelSidebar({ onChannelSelect }: { onChannelSelect?: () => void } = {}) {
  const { servers, activeServerId, pinnedChannels, categories, activeChannelId, setActiveChannel, isLoadingChannels } = useChatStore();
  const setActivePostIdStore = useChatStore((s) => s.setActivePostId);
  const activePostId = useChatStore((s) => s.activePostId);
  const followedPostIdsRaw = useChatStore((s) => s.followedPostIds);
  const followedPostMetaRaw = useChatStore((s) => s.followedPostMeta);
  const followedPostIds = Array.isArray(followedPostIdsRaw) ? followedPostIdsRaw : EMPTY_FOLLOWED_POST_IDS;
  const followedPostMeta = followedPostMetaRaw && typeof followedPostMetaRaw === 'object'
    ? followedPostMetaRaw
    : EMPTY_FOLLOWED_POST_META;
  const loadFollowedPosts = useChatStore((s) => s.loadFollowedPosts);
  const [showInviteCard, setShowInviteCard] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useSidebarWidth();

  // Load followed post metadata once the session is available. Running
  // before auth restore would hit the endpoint with no cookie and return
  // an empty list, so the sidebar would look "unfollowed" until the user
  // performed another action. Re-run whenever the active server changes.
  const sessionPubkey = useAuthStore((s) => s.profile?.pubkey ?? null);
  useEffect(() => {
    if (!sessionPubkey) return;
    void loadFollowedPosts();
  }, [loadFollowedPosts, activeServerId, sessionPubkey]);

// Group followed posts by channelId, scoped to the active server.
  const followedByChannel = useMemo(() => {
    const out: Record<string, Array<{ id: string; title: string; channelName: string }>> = {};
    for (const id of followedPostIds) {
      const meta = followedPostMeta[id];
      if (!meta) continue;
      if (meta.serverId !== activeServerId) continue;
      if (!out[meta.channelId]) out[meta.channelId] = [];
      out[meta.channelId].push({ id: meta.id, title: meta.title, channelName: meta.channelName });
    }
    return out;
  }, [followedPostIds, followedPostMeta, activeServerId]);

  const handleSelectPost = useCallback((postId: string, channelName: string) => {
    if (typeof window === 'undefined') return;
    const slug = slugify(channelName);
    const url = `/chat?c=${slug}&p=${postId}`;
    window.history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setActivePostIdStore(postId);
    onChannelSelect?.();
  }, [onChannelSelect, setActivePostIdStore]);

  const handleResize = useCallback((clientX: number) => {
    const left = asideRef.current?.getBoundingClientRect().left ?? 0;
    setWidth(clientX - left);
  }, [setWidth]);

  const activeServer = servers.find(s => s.id === activeServerId);

  if (isLoadingChannels) {
    return (
      <aside ref={asideRef} style={{ width, borderTopLeftRadius: 12 }} className="relative bg-lc-dark border-t border-l border-r border-lc-border flex flex-col shrink-0 overflow-hidden">
        <div className="p-4 border-b border-lc-border">
          <div className="lc-skeleton h-6 w-32" />
        </div>
        <div className="flex-1 p-3 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="lc-skeleton h-5 w-full" />
          ))}
        </div>
        <VoiceStatusBar />
        <UserPanel />
        <ResizeHandle onResize={handleResize} />
      </aside>
    );
  }

  return (
    <aside ref={asideRef} style={{ width, borderTopLeftRadius: 12 }} className="relative bg-lc-dark border-t border-l border-r border-lc-border flex flex-col shrink-0 overflow-hidden">
      {/* Server header — compact h-12 strip that always stays at the top,
          aligned with the channel header on the right. Banner (if any)
          renders BELOW this strip so only the channel list shifts down. */}
      <div className="shrink-0 relative">
        {activeServer?.banner && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <img
              src={activeServer.banner}
              alt=""
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-lc-dark" />
          </div>
        )}
        <div className={`relative h-12 px-3 flex items-center gap-2 ${activeServer?.banner ? '' : 'border-b border-lc-border'}`}>
          {activeServer?.icon ? (
            <img src={activeServer.icon} alt={activeServer.name} className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-bold">
              {activeServer?.name?.[0] || 'O'}
            </div>
          )}
          <h2 className="font-semibold text-lc-white truncate text-sm">{activeServer?.name || 'Server'}</h2>
          
          <div className="ml-auto flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setShowInviteCard(true)}
              className="p-1 rounded hover:bg-lc-border/50 text-lc-muted hover:text-lc-green transition-colors"
              title="Invite friends"
              data-testid="invite-friends-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </button>
            {activeServer && activeServer.ownerPubkey !== sessionPubkey && (
              <button
                onClick={async () => {
                  if (!confirm(`Are you sure you want to leave ${activeServer.name}?`)) return;
                  try {
                    const res = await fetch(`/api/servers/${activeServer.id}/leave`, { method: 'POST' });
                    if (res.ok) {
                      window.location.reload();
                    } else {
                      const data = await res.json();
                      alert(data.error || 'Failed to leave server');
                    }
                  } catch (e) {
                    alert('Error leaving server');
                  }
                }}
                className="p-1 rounded hover:bg-red-500/10 text-lc-muted hover:text-red-400 transition-colors"
                title="Leave server"
                data-testid="leave-server-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {activeServer?.banner && (
          <div className="relative h-24 border-b border-lc-border" />
        )}
      </div>

      {/* Invite friends modal */}
      {showInviteCard && activeServerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowInviteCard(false)}>
          <div className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <MemberInviteCard serverId={activeServerId} onClose={() => setShowInviteCard(false)} />
          </div>
        </div>
      )}

      {/* Channel list — scrollable */}
      <nav className="flex-1 overflow-y-auto p-2">
        {/* Pinned channels */}
        {pinnedChannels.length > 0 && (
          <div className="mb-1">
            <div className="px-1 mb-1 text-[11px] font-semibold uppercase tracking-wider text-lc-muted">
              Canales fijados
            </div>
            <div className="space-y-0.5">
              {pinnedChannels.map((ch) => (
                <ChannelItem
                  key={ch.id}
                  channel={ch}
                  isActive={ch.id === activeChannelId}
                  onClick={() => { setActiveChannel(ch.id); onChannelSelect?.(); }}
                  followedPosts={followedByChannel[ch.id]}
                  activePostId={activePostId}
                  onSelectPost={handleSelectPost}
                />
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        {categories.map((cat) => (
          <CategorySection
            key={cat.id}
            category={cat}
            activeChannelId={activeChannelId}
            onSelectChannel={(id) => { setActiveChannel(id); onChannelSelect?.(); }}
            followedByChannel={followedByChannel}
            activePostId={activePostId}
            onSelectPost={handleSelectPost}
          />
        ))}
      </nav>

      {/* Persistent voice call controls — visible while connected, regardless of which channel the user is browsing. */}
      <VoiceStatusBar />
      {/* User panel — always visible at bottom */}
      <UserPanel />
      <ResizeHandle onResize={handleResize} />
    </aside>
  );
}
