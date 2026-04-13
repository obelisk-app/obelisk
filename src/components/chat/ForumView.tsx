'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { ForumTag, useChatStore } from '@/store/chat';
import MessageContent from './MessageContent';
import EmojiPicker from './EmojiPicker';
import MessageReactions from './MessageReactions';
import PostEditModal from './PostEditModal';
import TagEditor, { type TagDraft, splitDrafts } from './TagEditor';
import { createPortal } from 'react-dom';
import MessageInput from './MessageInput';
import { slugify } from '@/lib/slug';

// Followed posts are persisted per-user in localStorage under this key so the
// "Siguiendo" toggle sticks across reloads without requiring a DB migration.
// Future: wire this to a PostSubscription table + notification fan-out.
const FOLLOWED_POSTS_KEY = 'obelisk:followed-posts';
function readFollowedPosts(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(FOLLOWED_POSTS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr);
  } catch { /* ignore */ }
  return new Set();
}
function writeFollowedPosts(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FOLLOWED_POSTS_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

// A forum reply row — avatar + name + markdown content + reactions with
// hover-only "+" picker trigger. Mirrors the chat bubble affordance without
// pulling in the full MessageArea/MessageBubble refactor.
function ReplyRow({
  reply,
  channelId,
  myPubkey,
  serverEmojis,
  getName,
  getPicture,
  onReactionsChanged,
  onReply,
}: {
  reply: {
    id: string;
    authorPubkey: string;
    content: string;
    createdAt: string;
    editedAt?: string | null;
    reactions?: Array<{ id: string; messageId: string; authorPubkey: string; emoji: string }>;
    replyTo?: { id: string; content: string; authorPubkey: string } | null;
  };
  channelId: string;
  myPubkey: string | null;
  serverEmojis: Record<string, string>;
  getName: (pubkey: string) => string;
  getPicture: (pubkey: string) => string | undefined;
  onReactionsChanged: (id: string, reactions: Array<{ id: string; messageId: string; authorPubkey: string; emoji: string }>) => void;
  onReply?: (reply: { id: string; content: string; authorPubkey: string }) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  const toggle = async (emoji: string) => {
    setShowPicker(false);
    if (!myPubkey) return;
    const current = reply.reactions ?? [];
    const existing = current.find((r) => r.authorPubkey === myPubkey && r.emoji === emoji);
    const next = existing
      ? current.filter((r) => r.id !== existing.id)
      : [...current, {
          id: `tmp-${Date.now()}`,
          messageId: reply.id,
          authorPubkey: myPubkey,
          emoji,
        }];
    onReactionsChanged(reply.id, next);
    try {
      await fetch(`/api/channels/${channelId}/messages/${reply.id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
    } catch { /* ignore — optimistic update stays */ }
  };

  return (
    <div className="group flex items-start gap-3 px-3 py-2 hover:bg-lc-border/20 rounded-lg transition-colors relative">
      {getPicture(reply.authorPubkey) ? (
        <img src={getPicture(reply.authorPubkey)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs shrink-0 mt-0.5">
          {getName(reply.authorPubkey)[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-lc-white">{getName(reply.authorPubkey)}</span>
          <span className="text-xs text-lc-muted">
            {Math.floor((Date.now() - new Date(reply.createdAt).getTime()) / 60000) < 1
              ? 'just now'
              : `${Math.floor((Date.now() - new Date(reply.createdAt).getTime()) / 60000)}m ago`}
          </span>
          {reply.editedAt && <span className="text-[10px] text-lc-muted">(edited)</span>}
        </div>
        {reply.replyTo && (
          <div
            className="flex items-center gap-1.5 mb-1 text-xs"
            data-testid="forum-reply-preview"
          >
            <div className="w-0.5 h-3 bg-lc-green/40 rounded-full" />
            <span className="text-lc-green/70 font-medium">
              {getName(reply.replyTo.authorPubkey)}
            </span>
            <span className="text-lc-muted truncate max-w-xs">
              {reply.replyTo.content}
            </span>
          </div>
        )}
        <div className="text-sm text-lc-white/90 whitespace-pre-wrap">
          <MessageContent content={reply.content} />
        </div>
        <div className="mt-1">
          <MessageReactions
            reactions={reply.reactions}
            myPubkey={myPubkey}
            serverEmojis={serverEmojis}
            onToggle={(emoji) => toggle(emoji)}
            chipTestId="forum-reply-reaction-chip"
          />
        </div>
      </div>
      <div className="absolute top-1 right-2 flex items-center gap-0.5 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity">
        {onReply && (
          <button
            type="button"
            onClick={() => onReply({ id: reply.id, content: reply.content, authorPubkey: reply.authorPubkey })}
            aria-label="Responder"
            title="Responder"
            data-testid={`forum-reply-reply-${reply.id}`}
            className="p-1 rounded text-lc-muted hover:text-lc-white hover:bg-lc-border/60"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          aria-label="Añadir reacción"
          title="Añadir reacción"
          data-testid={`forum-reply-add-reaction-${reply.id}`}
          className="p-1 rounded text-lc-muted hover:text-lc-white hover:bg-lc-border/60"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </button>
      </div>
      {showPicker && (
        <EmojiPicker
          className="absolute right-2 top-8 z-50"
          serverEmojis={serverEmojis}
          onSelect={(emoji) => toggle(emoji)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// IntersectionObserver-backed sentinel that calls onLoadMore whenever it
// scrolls into view. Used on the forum post detail to paginate replies
// without a "Load more" button.
function RepliesSentinel({ onLoadMore }: { onLoadMore: () => Promise<void> | void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(async (entries) => {
      if (entries[0]?.isIntersecting && !busyRef.current) {
        busyRef.current = true;
        try { await onLoadMore(); } finally { busyRef.current = false; }
      }
    }, { rootMargin: '200px' });
    io.observe(node);
    return () => io.disconnect();
  }, [onLoadMore]);

  return (
    <div
      ref={ref}
      className="flex items-center justify-center py-3 text-xs text-lc-muted"
      data-testid="replies-sentinel"
    >
      Loading more…
    </div>
  );
}

interface PostTag {
  id: string;
  name: string;
  color: string;
}

interface PostReaction {
  id: string;
  messageId: string;
  authorPubkey: string;
  emoji: string;
}

interface ForumPost {
  id: string;
  channelId: string;
  authorPubkey: string;
  title: string | null;
  coverImage?: string | null;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  tags: PostTag[];
  reactions?: PostReaction[];
}

interface ForumReply {
  id: string;
  channelId: string;
  authorPubkey: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  reactions?: PostReaction[];
  replyToId?: string | null;
  replyTo?: { id: string; content: string; authorPubkey: string } | null;
}

interface ForumViewProps {
  channelId: string;
  channelName: string;
  profileCache: Map<string, { name?: string; picture?: string }>;
  availableTags?: ForumTag[];
  initialPostId?: string | null;
}

function shortPubkey(pk: string) {
  return pk.slice(0, 8) + '...' + pk.slice(-4);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function PostHeaderActions({
  postId,
  channelName,
  channelId,
  serverId,
  postTitle,
}: {
  postId: string;
  channelName: string;
  channelId?: string;
  serverId?: string | null;
  postTitle?: string | null;
}) {
  const followedPostIds = useChatStore((s) => s.followedPostIds);
  const toggleFollowPost = useChatStore((s) => s.toggleFollowPost);
  const following = followedPostIds.includes(postId);
  const [copyLabel, setCopyLabel] = useState<'idle' | 'ok'>('idle');

  const toggleFollow = () => {
    // Keep the legacy localStorage key in sync for any UI still reading it.
    const set = readFollowedPosts();
    if (set.has(postId)) set.delete(postId);
    else set.add(postId);
    writeFollowedPosts(set);
    const meta = channelId && serverId
      ? { title: postTitle || 'Untitled', channelId, channelName, serverId }
      : undefined;
    void toggleFollowPost(postId, meta);
  };

  const copyLink = () => {
    if (typeof window === 'undefined') return;
    const slug = slugify(channelName);
    const url = `${window.location.origin}/chat?c=${slug}&p=${postId}`;
    try {
      navigator.clipboard.writeText(url);
      setCopyLabel('ok');
      setTimeout(() => setCopyLabel('idle'), 1200);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={toggleFollow}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          following
            ? 'bg-lc-green/20 text-lc-green border border-lc-green/40'
            : 'bg-lc-dark border border-lc-border text-lc-muted hover:text-lc-white'
        }`}
        data-testid="forum-follow-btn"
        aria-pressed={following}
      >
        {following ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Siguiendo
          </>
        ) : (
          <>Seguir</>
        )}
      </button>
      <button
        type="button"
        onClick={copyLink}
        title="Copiar enlace"
        aria-label="Copiar enlace"
        className="p-1.5 rounded-md text-lc-muted hover:text-lc-white hover:bg-lc-border/50 transition-colors"
        data-testid="forum-copy-link-btn"
      >
        {copyLabel === 'ok' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        )}
      </button>
    </div>
  );
}

function PostCardMenu({ postId, channelName, authorPubkey, title, coverImage, tags, availableTags, onDeleted, onEdited }: { postId: string; channelName: string; authorPubkey: string; title: string | null; coverImage: string | null; tags?: PostTag[]; availableTags?: ForumTag[]; onDeleted?: (id: string) => void; onEdited?: (id: string, update: { title: string; coverImage: string | null; tags: PostTag[] }) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const myRole = useChatStore((s) => s.myRole);
  const myPubkey = useAuthStore((s) => s.profile?.pubkey ?? null);
  const canManage =
    myRole === 'owner' || myRole === 'admin' || myRole === 'mod' || myPubkey === authorPubkey;
  const canDelete = canManage;
  const canEdit = canManage;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this post? This cannot be undone.')) return;
    (async () => {
      const channelId = useChatStore.getState().activeChannelId;
      if (!channelId) return;
      try {
        const res = await fetch(`/api/channels/${channelId}/messages/${postId}`, { method: 'DELETE' });
        if (res.ok) onDeleted?.(postId);
      } finally {
        setOpen(false);
      }
    })();
  };

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window === 'undefined') return;
    const slug = slugify(channelName);
    const url = `${window.location.origin}/chat?c=${slug}&p=${postId}`;
    try {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 900);
    } catch {
      setOpen(false);
    }
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenuPos({ top: rect.bottom + 4, left: rect.right - 180 });
          setOpen((v) => !v);
        }}
        title="Más opciones"
        aria-label="Más opciones"
        data-testid={`forum-post-dots-${postId}`}
        className="p-1 rounded text-lc-muted hover:text-lc-white hover:bg-lc-border/60"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="19" cy="12" r="1.5"/>
        </svg>
      </button>
      {open && menuPos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />
        <div
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 999 }}
          className="bg-lc-dark border border-lc-border rounded-xl shadow-lg py-1 min-w-[170px]"
          data-testid="forum-post-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={copyLink}
            className="w-full text-left px-3 py-1.5 text-sm text-lc-white hover:bg-lc-border/40 transition-colors flex items-center gap-2"
            data-testid="forum-post-copy-link"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            {copied ? 'Copiado ✓' : 'Copiar enlace'}
          </button>
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm text-lc-white hover:bg-lc-border/40 transition-colors flex items-center gap-2"
              data-testid="forum-post-edit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
              data-testid="forum-post-delete"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>
              Delete
            </button>
          )}
        </div>
        </>,
        document.body,
      )}
      {editing && (
        <PostEditModal
          postId={postId}
          channelId={useChatStore.getState().activeChannelId ?? ''}
          initialTitle={title ?? ''}
          initialCoverImage={coverImage ?? null}
          initialTags={tags}
          availableTags={availableTags}
          onClose={() => setEditing(false)}
          onSaved={(u) => onEdited?.(postId, u)}
        />
      )}
    </div>
  );
}

function TagPill({ tag, small }: { tag: PostTag; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${
        small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
      }`}
      style={{
        backgroundColor: tag.color + '20',
        color: tag.color,
        border: `1px solid ${tag.color}40`,
      }}
    >
      {tag.name}
    </span>
  );
}

export default function ForumView({ channelId, channelName, profileCache, availableTags = [], initialPostId = null }: ForumViewProps) {
  const activeServerId = useChatStore((s) => s.activeServerId);
  const myRole = useChatStore((s) => s.myRole);
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);
  const myPubkey = useAuthStore((s) => s.profile?.pubkey ?? null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [repliesHasMore, setRepliesHasMore] = useState(false);
  const [loadingPost, setLoadingPost] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Entry mode: when the user lands with ?p=<id> (from sidebar or share-link),
  // render the post detail full-width. When they click a card from the index,
  // render detail as a right-side panel next to the list.
  const [entryMode, setEntryMode] = useState<'list' | 'deeplink'>(
    initialPostId ? 'deeplink' : 'list',
  );

  // New post form
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCoverImage, setNewCoverImage] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [newTagDrafts, setNewTagDrafts] = useState<TagDraft[]>([]);
  const [posting, setPosting] = useState(false);

  // Edit mode on post detail
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCoverImage, setEditCoverImage] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editUploading, setEditUploading] = useState(false);

  // Reply form
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);

  const fetchPosts = useCallback(async (cursor?: string) => {
    const url = cursor
      ? `/api/channels/${channelId}/posts?cursor=${cursor}`
      : `/api/channels/${channelId}/posts`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (cursor) {
        setPosts((prev) => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts);
      }
      setHasMore(data.hasMore);
    }
    setLoading(false);
  }, [channelId]);

  useEffect(() => {
    setLoading(true);
    setSelectedPostId(null);
    setSelectedPost(null);
    setFilterTag(null);
    fetchPosts();
  }, [channelId, fetchPosts]);

  // Deep-link support: `/chat?c=<forum-slug>&p=<postId>` opens the specific
  // post directly. The parent reads `p` from the URL and passes it down.
  const initialPostAppliedRef = useState({ done: false })[0];
  useEffect(() => {
    if (initialPostAppliedRef.done) return;
    if (!initialPostId) return;
    initialPostAppliedRef.done = true;
    setSelectedPostId(initialPostId);
    setLoadingPost(true);
    fetch(`/api/channels/${channelId}/posts/${initialPostId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setSelectedPost(data.post);
          setReplies(data.replies);
          setRepliesHasMore(data.hasMore);
        }
        setLoadingPost(false);
      })
      .catch(() => setLoadingPost(false));
  }, [initialPostId, channelId, initialPostAppliedRef]);

  const fetchPostDetail = useCallback(async (postId: string) => {
    setLoadingPost(true);
    const res = await fetch(`/api/channels/${channelId}/posts/${postId}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedPost(data.post);
      setReplies(data.replies);
      setRepliesHasMore(data.hasMore);
    }
    setLoadingPost(false);
  }, [channelId]);

  const handleSelectPost = (postId: string) => {
    setReplyingTo(null);
    setEditingMessage(null);
    useChatStore.getState().setActivePostId(postId);
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      sp.set('p', postId);
      const url = `${window.location.pathname}?${sp.toString()}`;
      window.history.pushState(null, '', url);
    }
  };

  const handleBack = () => {
    setSelectedPostId(null);
    setSelectedPost(null);
    setReplies([]);
    setReplyContent('');
    setEditing(false);
    setEntryMode('list');
    fetchPosts();
  };

  // Esc closes the side-panel (only in list-entry mode; in deeplink/full-view
  // mode Esc does nothing because there's nowhere to go back to within the
  // forum — the user would use browser back or the channel sidebar).
  useEffect(() => {
    if (entryMode !== 'list' || !selectedPostId || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entryMode, selectedPostId, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadImage = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('file', file);
    const qs = activeServerId ? `?serverId=${encodeURIComponent(activeServerId)}` : '';
    try {
      const res = await fetch(`/api/upload${qs}`, { method: 'POST', body: fd });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data?.url === 'string' ? data.url : null;
    } catch {
      return null;
    }
  };

  const handleCreatePost = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setPosting(true);
    const { tagIds, tagNames } = splitDrafts(newTagDrafts);
    const res = await fetch(`/api/channels/${channelId}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle,
        content: newContent,
        tagIds,
        tagNames,
        coverImage: newCoverImage,
      }),
    });
    if (res.ok) {
      setNewTitle('');
      setNewContent('');
      setNewCoverImage(null);
      setNewTagDrafts([]);
      setShowNewPost(false);
      await fetchPosts();
    }
    setPosting(false);
  };

  const canEditPost = (post: ForumPost | null) => {
    if (!post) return false;
    if (myPubkey && post.authorPubkey === myPubkey) return true;
    return myRole === 'owner' || myRole === 'admin' || myRole === 'mod';
  };

  const startEdit = () => {
    if (!selectedPost) return;
    setEditTitle(selectedPost.title || '');
    setEditCoverImage(selectedPost.coverImage ?? null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditTitle('');
    setEditCoverImage(null);
  };

  const shareSelectedPost = async () => {
    if (!selectedPostId || typeof window === 'undefined') return;
    const slug = slugify(channelName);
    const url = `${window.location.origin}/chat?c=${slug}&p=${selectedPostId}`;
    const title = selectedPost?.title || 'Post';
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch { /* fall through to clipboard */ }
    }
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
  };

  const saveEdit = async () => {
    if (!selectedPostId || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/posts/${selectedPostId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, coverImage: editCoverImage }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedPost((prev) => prev ? {
          ...prev,
          title: data.post.title,
          coverImage: data.post.coverImage ?? null,
          editedAt: data.post.editedAt,
        } : prev);
        // Mirror into the list so the card updates too.
        setPosts((prev) => prev.map((p) =>
          p.id === selectedPostId
            ? { ...p, title: data.post.title, coverImage: data.post.coverImage ?? null }
            : p
        ));
        setEditing(false);
      }
    } finally {
      setEditSaving(false);
    }
  };

  const handleReply = async () => {
    if (!replyContent.trim() || !selectedPostId) return;
    setReplying(true);
    const res = await fetch(`/api/channels/${channelId}/posts/${selectedPostId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: replyContent }),
    });
    if (res.ok) {
      const reply = await res.json();
      setReplies((prev) => [...prev, reply]);
      setReplyContent('');
    }
    setReplying(false);
  };

  // Bridge from MessageInput's (content, replyToId) callback to the forum
  // reply endpoint. When replyToId targets a specific reply inside the
  // thread, it is forwarded so the new message anchors there; otherwise
  // the server defaults to anchoring at the post itself.
  const handleComposerSend = async (content: string, replyToId?: string) => {
    if (!selectedPostId || !content.trim()) return;
    const res = await fetch(`/api/channels/${channelId}/posts/${selectedPostId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, replyToId }),
    });
    if (res.ok) {
      const reply = await res.json();
      setReplies((prev) => [...prev, reply]);
    }
  };

  const handleReplyToReply = (target: { id: string; content: string; authorPubkey: string }) => {
    setReplyingTo({
      id: target.id,
      channelId,
      authorPubkey: target.authorPubkey,
      content: target.content,
      replyToId: null,
      createdAt: new Date().toISOString(),
      editedAt: null,
    });
  };

  const getName = (pubkey: string) => profileCache.get(pubkey)?.name || shortPubkey(pubkey);
  const getPicture = (pubkey: string) => profileCache.get(pubkey)?.picture;

  // Filter bar shows only tags in actual use on loaded posts, so custom/newly-
  // created tags appear as soon as someone uses them and unused channel tag
  // definitions don't clutter the bar.
  const filterableTags = (() => {
    const map = new Map<string, PostTag>();
    for (const p of posts) for (const t of p.tags ?? []) if (!map.has(t.id)) map.set(t.id, t);
    return Array.from(map.values());
  })();

  const q = searchQuery.trim().toLowerCase();
  const filteredPosts = posts.filter((p) => {
    if (filterTag && !p.tags?.some((t) => t.id === filterTag)) return false;
    if (q) {
      const hay = `${p.title ?? ''} ${p.content ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // --- Post Detail View (rendered either full-width or in a side-panel) ---
  const renderDetailView = () => (
      <div className="flex flex-col h-full" data-testid="forum-detail">
        {/* Header: back (side-panel only) + title + Edit + follow toggle + copy-link */}
        <div className="px-4 py-3 border-b border-lc-border flex items-center gap-3">
          {entryMode === 'list' && (
            <button
              onClick={handleBack}
              className="text-lc-muted hover:text-lc-white transition-colors text-sm flex items-center gap-1"
              data-testid="forum-back"
              aria-label="Close post"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          {selectedPost && (
            <h2 className="text-sm font-semibold text-lc-white truncate flex-1">
              {selectedPost.title || 'Untitled'}
            </h2>
          )}
          {selectedPostId && canEditPost(selectedPost) && !editing && (
            <button
              onClick={startEdit}
              className="text-xs text-lc-muted hover:text-lc-white border border-lc-border rounded-full px-3 py-1"
              data-testid="forum-edit-post-btn"
            >
              Edit
            </button>
          )}
          {selectedPostId && (
            <button
              onClick={shareSelectedPost}
              className="p-1.5 rounded-md text-lc-muted hover:text-lc-white hover:bg-lc-border/50 transition-colors"
              title="Compartir"
              aria-label="Compartir"
              data-testid="forum-share-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          )}
          {selectedPostId && (
            <PostHeaderActions
              postId={selectedPostId}
              channelName={channelName}
              channelId={channelId}
              serverId={activeServerId}
              postTitle={selectedPost?.title ?? null}
            />
          )}
        </div>

        {/* Post + Replies */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loadingPost ? (
            <div className="space-y-4" data-testid="forum-post-skeleton">
              {/* OP card skeleton: cover + avatar/name + title + body */}
              <div className="lc-card overflow-hidden">
                <div className="w-full h-40 lc-skeleton" />
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full lc-skeleton" />
                    <div className="h-3 w-32 lc-skeleton rounded" />
                  </div>
                  <div className="h-5 w-2/3 lc-skeleton rounded" />
                  <div className="space-y-2">
                    <div className="h-3 w-full lc-skeleton rounded" />
                    <div className="h-3 w-5/6 lc-skeleton rounded" />
                    <div className="h-3 w-3/4 lc-skeleton rounded" />
                  </div>
                </div>
              </div>
              {/* Reply skeletons */}
              <div className="space-y-2 px-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3 py-2">
                    <div className="w-7 h-7 rounded-full lc-skeleton shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 lc-skeleton rounded" />
                      <div className="h-3 w-4/5 lc-skeleton rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : selectedPost ? (
            <>
              {/* Original post */}
              <div className="lc-card overflow-hidden" data-testid="forum-post-detail">
                {/* Cover image (view mode) */}
                {!editing && selectedPost.coverImage && (
                  <img
                    src={selectedPost.coverImage}
                    alt=""
                    className="w-full max-h-72 object-cover"
                    data-testid="forum-post-cover"
                  />
                )}
                <div className="p-5">
                  {editing ? (
                    <div className="space-y-3" data-testid="forum-post-edit-form">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Title"
                        className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
                        data-testid="forum-edit-title"
                      />
                      <div>
                        <label className="text-[10px] text-lc-muted uppercase tracking-wider mb-1 block">Cover image</label>
                        {editCoverImage ? (
                          <div className="relative inline-block">
                            <img
                              src={editCoverImage}
                              alt=""
                              className="max-h-40 rounded-lg border border-lc-border object-cover"
                              data-testid="forum-edit-cover-preview"
                            />
                            <button
                              type="button"
                              onClick={() => setEditCoverImage(null)}
                              aria-label="Remove cover"
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-lc-black border border-lc-border text-lc-muted hover:text-lc-white flex items-center justify-center"
                              data-testid="forum-edit-cover-remove"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label
                            className={`inline-flex items-center gap-2 text-xs text-lc-muted hover:text-lc-white border border-dashed border-lc-border rounded-lg px-3 py-2 cursor-pointer ${editUploading ? 'opacity-60 pointer-events-none' : ''}`}
                            data-testid="forum-edit-cover-upload"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            {editUploading ? 'Uploading...' : 'Upload image'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                setEditUploading(true);
                                const url = await uploadImage(f);
                                setEditUploading(false);
                                if (url) setEditCoverImage(url);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={editSaving || !editTitle.trim()}
                          className="lc-pill-primary px-4 py-1.5 text-sm disabled:opacity-50"
                          data-testid="forum-edit-save"
                        >
                          {editSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-sm text-lc-muted hover:text-lc-white px-3 py-1.5"
                          data-testid="forum-edit-cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-lg font-semibold text-lc-white mb-2">{selectedPost.title}</h2>
                      {selectedPost.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedPost.tags.map((tag) => (
                            <TagPill key={tag.id} tag={tag} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Thread: the post's content is the first message, then replies.
                  Reactions on the OP go through the same messages/reactions
                  endpoint used for replies, so we can reuse ReplyRow. */}
              <div className="space-y-1">
                <ReplyRow
                  reply={{
                    id: selectedPost.id,
                    authorPubkey: selectedPost.authorPubkey,
                    content: selectedPost.content,
                    createdAt: selectedPost.createdAt,
                    editedAt: selectedPost.editedAt,
                    reactions: selectedPost.reactions,
                  }}
                  channelId={channelId}
                  myPubkey={myPubkey}
                  serverEmojis={serverEmojis}
                  getName={getName}
                  getPicture={getPicture}
                  onReactionsChanged={(_id, reactions) => {
                    setSelectedPost((prev) => prev ? { ...prev, reactions } : prev);
                  }}
                  onReply={handleReplyToReply}
                />
                {replies.length > 0 && (
                  <p className="text-xs text-lc-muted font-semibold uppercase tracking-wider px-1 pt-3">
                    {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
                  </p>
                )}
                {replies.map((r) => (
                  <ReplyRow
                    key={r.id}
                    reply={r}
                    channelId={channelId}
                    myPubkey={myPubkey}
                    serverEmojis={serverEmojis}
                    getName={getName}
                    getPicture={getPicture}
                    onReactionsChanged={(id, reactions) => {
                      setReplies((prev) => prev.map((x) => x.id === id ? { ...x, reactions } : x));
                    }}
                    onReply={handleReplyToReply}
                  />
                ))}
                {repliesHasMore && (
                  <RepliesSentinel
                    onLoadMore={async () => {
                      const last = replies[replies.length - 1];
                      if (!last) return;
                      const r = await fetch(`/api/channels/${channelId}/posts/${selectedPostId}?cursor=${last.id}`);
                      if (!r.ok) return;
                      const data = await r.json();
                      setReplies((prev) => [...prev, ...data.replies]);
                      setRepliesHasMore(data.hasMore);
                    }}
                  />
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Reply composer — real MessageInput, same as chat (attachments,
            mentions, emoji, GIF, markdown). `onSend` routes to the forum
            reply endpoint instead of the socket chat channel. */}
        <div className="border-t border-lc-border" data-testid="forum-reply-input">
          <MessageInput
            onSend={(content, replyToId) => { void handleComposerSend(content, replyToId); }}
          />
        </div>
      </div>
    );

  // --- Full-view (from sidebar or share-link) ---
  if (selectedPostId && entryMode === 'deeplink') {
    return renderDetailView();
  }

  // --- Post List View (with optional right-side detail panel) ---
  const listView = (
    <div className="flex flex-col h-full" data-testid="forum-list">
      {/* Search + New publication bar */}
      <div className="px-4 py-3 border-b border-lc-border flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-full bg-lc-dark border border-lc-border px-4 py-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-lc-muted shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or create a post..."
            className="flex-1 bg-transparent text-sm text-lc-white placeholder:text-lc-muted focus:outline-none"
            data-testid="forum-search"
          />
        </div>
        <button
          onClick={() => {
            if (!showNewPost && searchQuery.trim() && !newTitle.trim()) {
              setNewTitle(searchQuery.trim());
            }
            setShowNewPost(!showNewPost);
          }}
          className="lc-pill-primary px-4 py-2 text-sm flex items-center gap-2 shrink-0"
          data-testid="new-post-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <span className="hidden sm:inline">New post</span>
        </button>
      </div>

      {/* Tag filter bar */}
      {filterableTags.length > 0 && (
        <div className="px-4 py-2 border-b border-lc-border/50 flex items-center gap-2 overflow-x-auto">
          {filterableTags.map((tag) => {
            const active = filterTag === tag.id;
            return (
              <button
                key={tag.id}
                onClick={() => setFilterTag(active ? null : tag.id)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 border"
                style={{
                  backgroundColor: active ? tag.color + '30' : '#171717',
                  color: active ? tag.color : '#e5e5e5',
                  borderColor: active ? tag.color + '80' : '#262626',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            );
          })}
          <button
            onClick={() => setFilterTag(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0 border ${
              filterTag === null
                ? 'bg-lc-border text-lc-white border-lc-border'
                : 'text-lc-muted hover:text-lc-white bg-lc-dark border-lc-border'
            }`}
          >
            All
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {/* New Post Modal */}
        {showNewPost && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => { setShowNewPost(false); setNewTagDrafts([]); }}
            data-testid="new-post-modal"
          >
          <div
            onClick={(e) => e.stopPropagation()}
            className="lc-card p-4 space-y-3 w-full max-w-xl max-h-[85vh] overflow-y-auto"
            data-testid="new-post-form"
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Post title"
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="new-post-title"
            />
            {/* Cover image picker */}
            <div>
              <label className="text-[10px] text-lc-muted uppercase tracking-wider mb-1 block">Cover image (optional)</label>
              {newCoverImage ? (
                <div className="relative inline-block">
                  <img
                    src={newCoverImage}
                    alt=""
                    className="max-h-40 rounded-lg border border-lc-border object-cover"
                    data-testid="new-post-cover-preview"
                  />
                  <button
                    type="button"
                    onClick={() => setNewCoverImage(null)}
                    aria-label="Remove cover"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-lc-black border border-lc-border text-lc-muted hover:text-lc-white flex items-center justify-center"
                    data-testid="new-post-cover-remove"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label
                  className={`inline-flex items-center gap-2 text-xs text-lc-muted hover:text-lc-white border border-dashed border-lc-border rounded-lg px-3 py-2 cursor-pointer ${uploadingCover ? 'opacity-60 pointer-events-none' : ''}`}
                  data-testid="new-post-cover-upload"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  {uploadingCover ? 'Uploading...' : 'Upload image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setUploadingCover(true);
                      const url = await uploadImage(f);
                      setUploadingCover(false);
                      if (url) setNewCoverImage(url);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Write your post..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none resize-none"
              data-testid="new-post-content"
            />
            <div>
              <label className="text-[10px] text-lc-muted uppercase tracking-wider mb-1 block">Tags</label>
              <TagEditor
                available={availableTags}
                value={newTagDrafts}
                onChange={setNewTagDrafts}
                serverEmojis={serverEmojis}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreatePost}
                disabled={posting || !newTitle.trim() || !newContent.trim()}
                className="lc-pill-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {posting ? 'Posting...' : 'Create Post'}
              </button>
              <button
                onClick={() => { setShowNewPost(false); setNewTagDrafts([]); }}
                className="text-sm text-lc-muted hover:text-lc-white px-3 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="lc-card p-4 space-y-2">
                <div className="h-5 w-48 lc-skeleton rounded" />
                <div className="h-3 w-full lc-skeleton rounded" />
                <div className="h-3 w-32 lc-skeleton rounded" />
              </div>
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12" data-testid="forum-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-20">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <p className="text-lc-muted">
              {filterTag ? 'No posts with this tag' : 'No posts yet'}
            </p>
            <p className="text-sm text-lc-muted mt-1">Be the first to start a discussion</p>
          </div>
        ) : (
          <>
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="relative lc-card hover:border-lc-green/30 transition-colors group"
              >
                <div className="absolute top-2 right-2 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity z-10">
                  <PostCardMenu
                    postId={post.id}
                    channelName={channelName}
                    authorPubkey={post.authorPubkey}
                    title={post.title}
                    coverImage={post.coverImage ?? null}
                    tags={post.tags}
                    availableTags={availableTags}
                    onDeleted={(id) => setPosts((cur) => cur.filter((p) => p.id !== id))}
                    onEdited={(id, u) =>
                      setPosts((cur) =>
                        cur.map((p) =>
                          p.id === id
                            ? { ...p, title: u.title, coverImage: u.coverImage, tags: u.tags }
                            : p,
                        ),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectPost(post.id)}
                  className="w-full text-left p-4"
                  data-testid="forum-post-card"
                >
                <div className="flex items-start gap-3">
                  {/* Author avatar */}
                  {getPicture(post.authorPubkey) ? (
                    <img src={getPicture(post.authorPubkey)} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0 mt-0.5">
                      {getName(post.authorPubkey)[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-lc-white mb-0.5 group-hover:text-lc-green transition-colors">
                      {post.title || 'Untitled'}
                    </h3>
                    {/* Tags */}
                    {post.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {post.tags.map((tag) => (
                          <TagPill key={tag.id} tag={tag} small />
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-lc-muted line-clamp-2 mb-1.5">{post.content}</p>
                    <div className="flex items-center gap-3 text-[11px] text-lc-muted">
                      <span>{getName(post.authorPubkey)}</span>
                      {(() => {
                        const rs = post.reactions ?? [];
                        if (rs.length === 0) return null;
                        const counts = new Map<string, number>();
                        for (const r of rs) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
                        let top = '';
                        let topCount = 0;
                        for (const [emoji, count] of counts) {
                          if (count > topCount) { top = emoji; topCount = count; }
                        }
                        const custom = top.startsWith(':') && top.endsWith(':')
                          ? serverEmojis.find((e) => `:${e.name}:` === top)
                          : null;
                        return (
                          <span
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-lc-olive/60 border border-lc-border"
                            data-testid="forum-post-card-top-reaction"
                          >
                            {custom ? (
                              <img src={custom.url} alt={top} className="w-3 h-3 object-contain" />
                            ) : (
                              <span className="text-[11px] leading-none">{top}</span>
                            )}
                            <span className="text-[11px] leading-none">{topCount}</span>
                          </span>
                        );
                      })()}
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                        </svg>
                        {post.replyCount}
                      </span>
                      <span>{timeAgo(post.createdAt)}</span>
                    </div>
                  </div>
                  {/* Cover thumbnail on the right */}
                  {post.coverImage ? (
                    <img
                      src={post.coverImage}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover shrink-0 border border-lc-border"
                      data-testid="forum-post-card-cover"
                    />
                  ) : null}
                </div>
                </button>
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => {
                  const last = posts[posts.length - 1];
                  if (last) fetchPosts(last.id);
                }}
                className="w-full py-2 text-sm text-lc-muted hover:text-lc-white transition-colors"
              >
                Load more posts...
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  // Side-panel layout: list on the left, detail panel on the right.
  // Below the lg breakpoint the list collapses — the detail takes over the
  // whole viewport so mobile and narrow windows get a readable post view.
  if (selectedPostId && entryMode === 'list') {
    return (
      <div className="flex h-full" data-testid="forum-split">
        <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 border-r border-lc-border flex-col min-w-0">
          {listView}
        </div>
        <div className="flex-1 min-w-0">
          {renderDetailView()}
        </div>
      </div>
    );
  }

  return listView;
}
