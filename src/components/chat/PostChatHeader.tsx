'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { slugify } from '@/lib/slug';
import PostReactions, { type PostReactionEntry } from './PostReactions';
import PostEditModal from './PostEditModal';

interface PostMeta {
  id: string;
  title: string | null;
  emoji?: string | null;
  coverImage?: string | null;
  authorPubkey: string;
  reactions?: PostReactionEntry[];
}

interface Props {
  postId: string;
  parentChannelName: string;
  parentChannelEmoji: string | null;
  profileCache: Map<string, { name?: string; picture?: string }>;
  onClose: () => void;
}

export default function PostChatHeader({ postId, parentChannelName, onClose }: Props) {
  const [post, setPost] = useState<PostMeta | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const followedPostIds = useChatStore((s) => s.followedPostIds);
  const toggleFollowPost = useChatStore((s) => s.toggleFollowPost);
  const myRole = useChatStore((s) => s.myRole);
  const myPubkey = useAuthStore((s) => s.profile?.pubkey ?? null);
  const following = followedPostIds.includes(postId);
  const canManage =
    myRole === 'owner' || myRole === 'admin' || myRole === 'mod' ||
    (post?.authorPubkey && post.authorPubkey === myPubkey);

  useEffect(() => {
    if (!activeChannelId || !postId) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/channels/${activeChannelId}/posts/${encodeURIComponent(postId)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!aborted) setPost(data.post ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => { aborted = true; };
  }, [activeChannelId, postId]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const handleFollow = () => {
    if (!post || !activeChannelId || !activeServerId) {
      void toggleFollowPost(postId);
      return;
    }
    void toggleFollowPost(postId, {
      title: post.title ?? '',
      channelId: activeChannelId,
      channelName: parentChannelName,
      serverId: activeServerId,
    });
  };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window === 'undefined') return;
    const slug = slugify(parentChannelName);
    const url = `${window.location.origin}/chat?c=${slug}&p=${postId}`;
    try {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => { setCopied(false); setMenuOpen(false); }, 700);
    } catch {
      setMenuOpen(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeChannelId) return;
    if (!confirm('Delete this post? This cannot be undone.')) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/channels/${activeChannelId}/messages/${postId}`,
          { method: 'DELETE' },
        );
        if (res.ok) {
          setMenuOpen(false);
          onClose();
        }
      } catch { /* ignore */ }
    })();
  };

  return (
    <div
      className="border-b border-lc-border bg-lc-dark px-4 py-2 flex items-center justify-between gap-3 flex-wrap"
      data-testid="post-chat-header"
    >
      {activeChannelId && (
        <PostReactions
          channelId={activeChannelId}
          postId={postId}
          reactions={post?.reactions ?? []}
          onChanged={(reactions) =>
            setPost((p) => (p ? { ...p, reactions } : p))
          }
        />
      )}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleFollow}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
            following
              ? 'bg-lc-green/20 text-lc-green border-lc-green/50'
              : 'bg-lc-black/40 text-lc-muted hover:text-lc-white border-lc-border hover:border-lc-green/40'
          }`}
          data-testid="post-chat-follow-btn"
          aria-label={following ? 'Dejar de seguir' : 'Seguir thread'}
        >
          {following ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M2 12h20" strokeLinecap="round" />
            </svg>
          )}
          {following ? 'Siguiendo' : 'Seguir thread'}
        </button>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded text-lc-muted hover:text-lc-white hover:bg-lc-border/60"
            aria-label="Más opciones"
            data-testid="post-chat-dots"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-50 bg-lc-dark border border-lc-border rounded-xl shadow-lg py-1 min-w-[180px]"
              data-testid="post-chat-menu"
            >
              <button
                onClick={handleCopyLink}
                className="w-full text-left px-3 py-1.5 text-sm text-lc-white hover:bg-lc-border/40 transition-colors flex items-center gap-2"
                data-testid="post-chat-copy-link"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                {copied ? 'Copiado ✓' : 'Copiar enlace'}
              </button>
              {canManage && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(true); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-lc-white hover:bg-lc-border/40 transition-colors flex items-center gap-2"
                  data-testid="post-chat-edit"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  Edit
                </button>
              )}
              {canManage && (
                <button
                  onClick={handleDelete}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                  data-testid="post-chat-delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {editing && activeChannelId && (
        <PostEditModal
          postId={postId}
          channelId={activeChannelId}
          initialTitle={post?.title ?? ''}
          initialCoverImage={post?.coverImage ?? null}
          onClose={() => setEditing(false)}
          availableTags={
            [...useChatStore.getState().pinnedChannels, ...useChatStore.getState().categories.flatMap((c) => c.channels)].find((c) => c.id === activeChannelId)?.forumTags ?? []
          }
          onSaved={(u) =>
            setPost((p) => (p ? { ...p, title: u.title, coverImage: u.coverImage } : p))
          }
        />
      )}
    </div>
  );
}
