'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore, Category, Channel } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notification';
import ProfilePanel from './ProfilePanel';
import MemberInviteCard from '../invites/MemberInviteCard';
import { canWriteInChannel } from '@/lib/roles';
import ChannelEmoji from './ChannelEmoji';
import { slugify } from '@/lib/slug';

function ChannelTypeIcon({ type }: { type: string }) {
  if (type === 'forum') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-lc-muted/60">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    );
  }
  if (type === 'voice') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-lc-muted/60">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
        <path d="M19 10v2a7 7 0 01-14 0v-2"/>
      </svg>
    );
  }
  return <span className="shrink-0 text-lc-muted/60 font-bold text-xs">#</span>;
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
      aria-label="Write-locked channel"
      data-testid="channel-write-lock-icon"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
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

  return (
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
    </div>
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
    openMenuAt(rect.right, rect.bottom);
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
        className="pointer-events-none absolute left-3 top-1/2 w-2 h-px bg-lc-border"
      />
      <button
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-1.5 pl-5 pr-8 py-1 rounded-md text-sm text-left transition-colors ${
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

  return (
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
    </div>
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
  const unreadCount = useNotificationStore((s) => s.channelUnreads[channel.id] || 0);
  const hasMention = useNotificationStore((s) => s.channelMentions[channel.id] || false);
  const hasUnread = unreadCount > 0;
  const myRole = useChatStore((s) => s.myRole);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const isWriteLocked = !canWriteInChannel(myRole ?? 'member', {
    writePermission: channel.writePermission ?? null,
  });
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
    openMenuAt(rect.right, rect.bottom);
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
      {canExpand && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          aria-label={expanded ? 'Contraer publicaciones' : 'Expandir publicaciones'}
          data-testid={`channel-expand-${channel.id}`}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-0.5 text-lc-muted hover:text-lc-white z-10"
        >
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="currentColor"
            className={`transition-transform ${expanded ? '' : '-rotate-90'}`}
            aria-hidden="true"
          >
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </button>
      )}
      <button
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-1.5 py-1 pr-8 rounded-md text-sm transition-colors ${canExpand ? 'pl-5' : 'pl-2'} ${
          isActive
            ? 'bg-lc-border text-lc-white font-medium'
            : hasUnread
              ? 'text-lc-white font-semibold hover:bg-lc-border/50'
              : 'text-lc-muted hover:text-lc-white hover:bg-lc-border/50'
        }`}
      >
        <ChannelTypeIcon type={channel.type} />
        {channel.emoji && <ChannelEmoji value={channel.emoji} />}
        <span className="truncate">{channel.name}</span>
        {isWriteLocked && <LockIcon />}
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
      className="relative mt-0.5 space-y-0.5 before:content-[''] before:absolute before:left-3 before:top-0 before:bottom-2 before:w-px before:bg-lc-border"
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
          className="w-full pl-5 pr-8 py-1 text-xs text-left text-lc-muted hover:text-lc-white transition-colors"
          data-testid={`channel-followed-posts-more-${channelId}`}
        >
          + {hiddenCount} more
        </button>
      )}
      {expanded && sorted.length > LIMIT && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full pl-5 pr-8 py-1 text-xs text-left text-lc-muted hover:text-lc-white transition-colors"
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
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="currentColor"
          className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
        >
          <path d="M7 10l5 5 5-5z"/>
        </svg>
        ──── [ {category.name} ] ────
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

function UserPanel() {
  const router = useRouter();
  const { profile, logout } = useAuthStore();
  const [showProfile, setShowProfile] = useState(false);

  const handleLogout = () => {
    logout();
    setShowProfile(false);
    router.push('/');
  };

  return (
    <div className="p-2 border-t border-lc-border bg-lc-black/50 shrink-0 relative">
      <button
        onClick={() => setShowProfile(!showProfile)}
        className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-lc-border/30 transition"
      >
        {profile?.picture ? (
          <img src={profile.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
            {(profile?.name || profile?.displayName || 'A')[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium text-lc-white truncate">
            {profile?.displayName || profile?.name || 'Anon'}
          </div>
          <div className="text-[10px] text-lc-muted truncate font-mono">
            {profile?.npub ? `${profile.npub.slice(0, 16)}...` : ''}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-muted shrink-0">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>

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
  const followedPostIds = useChatStore((s) => s.followedPostIds);
  const followedPostMeta = useChatStore((s) => s.followedPostMeta);
  const loadFollowedPosts = useChatStore((s) => s.loadFollowedPosts);
  const [showInviteCard, setShowInviteCard] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
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

  // Track ?p= in the URL so the active post row highlights.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      const sp = new URLSearchParams(window.location.search);
      setActivePostId(sp.get('p'));
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

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
    setActivePostId(postId);
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
      <aside ref={asideRef} style={{ width }} className="relative bg-lc-dark border-r border-lc-border flex flex-col shrink-0">
        <div className="p-4 border-b border-lc-border">
          <div className="lc-skeleton h-6 w-32" />
        </div>
        <div className="flex-1 p-3 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="lc-skeleton h-5 w-full" />
          ))}
        </div>
        <UserPanel />
        <ResizeHandle onResize={handleResize} />
      </aside>
    );
  }

  return (
    <aside ref={asideRef} style={{ width }} className="relative bg-lc-dark border-r border-lc-border flex flex-col shrink-0">
      {/* Server header with banner */}
      <div className="relative shrink-0">
        {activeServer?.banner && (
          <div className="h-24 overflow-hidden">
            <img
              src={activeServer.banner}
              alt=""
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-lc-dark" />
          </div>
        )}
        <div className={`${activeServer?.banner ? 'absolute bottom-0 left-0 right-0' : ''} p-3 flex items-center gap-2 border-b border-lc-border`}>
          {activeServer?.icon ? (
            <img src={activeServer.icon} alt={activeServer.name} className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-bold">
              {activeServer?.name?.[0] || 'O'}
            </div>
          )}
          <h2 className="font-semibold text-lc-white truncate text-sm">{activeServer?.name || 'Server'}</h2>
          <button
            onClick={() => setShowInviteCard(true)}
            className="ml-auto shrink-0 p-1 rounded hover:bg-lc-border/50 text-lc-muted hover:text-lc-green transition-colors"
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
        </div>
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

      {/* User panel — always visible at bottom */}
      <UserPanel />
      <ResizeHandle onResize={handleResize} />
    </aside>
  );
}
