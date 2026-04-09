'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { ForumTag } from '@/store/chat';
import { MessageContent } from './MessageArea';

interface PostTag {
  id: string;
  name: string;
  color: string;
}

interface ForumPost {
  id: string;
  channelId: string;
  authorPubkey: string;
  title: string | null;
  content: string;
  createdAt: string;
  replyCount: number;
  lastReplyAt: string | null;
  tags: PostTag[];
}

interface ForumReply {
  id: string;
  channelId: string;
  authorPubkey: string;
  content: string;
  createdAt: string;
}

interface ForumViewProps {
  channelId: string;
  channelName: string;
  profileCache: Map<string, { name?: string; picture?: string }>;
  availableTags?: ForumTag[];
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

function TagSelector({
  available,
  selected,
  onToggle,
}: {
  available: ForumTag[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (available.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {available.map((tag) => {
        const isSelected = selected.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
              isSelected ? 'ring-1' : 'opacity-50 hover:opacity-80'
            }`}
            style={{
              backgroundColor: tag.color + (isSelected ? '30' : '15'),
              color: tag.color,
              border: `1px solid ${tag.color}${isSelected ? '60' : '30'}`,
              ...(isSelected ? { ringColor: tag.color } : {}),
            }}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}

export default function ForumView({ channelId, channelName, profileCache, availableTags = [] }: ForumViewProps) {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [repliesHasMore, setRepliesHasMore] = useState(false);
  const [loadingPost, setLoadingPost] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  // New post form
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);

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
    setSelectedPostId(postId);
    fetchPostDetail(postId);
  };

  const handleBack = () => {
    setSelectedPostId(null);
    setSelectedPost(null);
    setReplies([]);
    setReplyContent('');
    fetchPosts();
  };

  const handleCreatePost = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setPosting(true);
    const res = await fetch(`/api/channels/${channelId}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, content: newContent, tagIds: selectedTagIds }),
    });
    if (res.ok) {
      setNewTitle('');
      setNewContent('');
      setSelectedTagIds([]);
      setShowNewPost(false);
      await fetchPosts();
    }
    setPosting(false);
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

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const getName = (pubkey: string) => profileCache.get(pubkey)?.name || shortPubkey(pubkey);
  const getPicture = (pubkey: string) => profileCache.get(pubkey)?.picture;

  const filteredPosts = filterTag
    ? posts.filter((p) => p.tags?.some((t) => t.id === filterTag))
    : posts;

  // --- Post Detail View ---
  if (selectedPostId) {
    return (
      <div className="flex flex-col h-full" data-testid="forum-detail">
        {/* Header */}
        <div className="px-4 py-3 border-b border-lc-border flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-lc-muted hover:text-lc-white transition-colors text-sm flex items-center gap-1"
            data-testid="forum-back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          {selectedPost && (
            <h2 className="text-sm font-semibold text-lc-white truncate">
              {selectedPost.title || 'Untitled'}
            </h2>
          )}
        </div>

        {/* Post + Replies */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loadingPost ? (
            <div className="space-y-3">
              <div className="h-6 w-64 lc-skeleton rounded" />
              <div className="h-20 lc-skeleton rounded" />
            </div>
          ) : selectedPost ? (
            <>
              {/* Original post */}
              <div className="lc-card p-5" data-testid="forum-post-detail">
                <div className="flex items-center gap-2 mb-3">
                  {getPicture(selectedPost.authorPubkey) ? (
                    <img src={getPicture(selectedPost.authorPubkey)} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold">
                      {getName(selectedPost.authorPubkey)[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-medium text-lc-white">{getName(selectedPost.authorPubkey)}</span>
                    <span className="text-xs text-lc-muted ml-2">{timeAgo(selectedPost.createdAt)}</span>
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-lc-white mb-2">{selectedPost.title}</h2>
                {selectedPost.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {selectedPost.tags.map((tag) => (
                      <TagPill key={tag.id} tag={tag} />
                    ))}
                  </div>
                )}
                <div className="text-sm text-lc-white/90 whitespace-pre-wrap">
                  <MessageContent content={selectedPost.content} />
                </div>
              </div>

              {/* Replies */}
              <div className="space-y-1">
                <p className="text-xs text-lc-muted font-semibold uppercase tracking-wider px-1">
                  {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
                </p>
                {replies.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 px-3 py-2 hover:bg-lc-border/20 rounded-lg transition-colors">
                    {getPicture(r.authorPubkey) ? (
                      <img src={getPicture(r.authorPubkey)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs shrink-0 mt-0.5">
                        {getName(r.authorPubkey)[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-lc-white">{getName(r.authorPubkey)}</span>
                        <span className="text-xs text-lc-muted">{timeAgo(r.createdAt)}</span>
                      </div>
                      <div className="text-sm text-lc-white/90 whitespace-pre-wrap">
                        <MessageContent content={r.content} />
                      </div>
                    </div>
                  </div>
                ))}
                {repliesHasMore && (
                  <button
                    onClick={() => {
                      const last = replies[replies.length - 1];
                      if (last) {
                        fetch(`/api/channels/${channelId}/posts/${selectedPostId}?cursor=${last.id}`)
                          .then((r) => r.json())
                          .then((data) => {
                            setReplies((prev) => [...prev, ...data.replies]);
                            setRepliesHasMore(data.hasMore);
                          });
                      }
                    }}
                    className="text-sm text-lc-muted hover:text-lc-white py-2 px-1"
                  >
                    Load more replies...
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Reply Input */}
        <div className="p-4 border-t border-lc-border">
          <div className="flex gap-2">
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write a reply..."
              rows={2}
              className="flex-1 px-3 py-2 rounded-xl bg-lc-dark border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none resize-none"
              data-testid="forum-reply-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); }
              }}
            />
            <button
              onClick={handleReply}
              disabled={replying || !replyContent.trim()}
              className="self-end lc-pill-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {replying ? '...' : 'Reply'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Post List View ---
  return (
    <div className="flex flex-col h-full" data-testid="forum-list">
      {/* Header */}
      <div className="px-4 py-3 border-b border-lc-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-lc-white">
          <span className="text-lc-muted mr-1">Forum:</span> {channelName}
        </h2>
        <button
          onClick={() => setShowNewPost(!showNewPost)}
          className="lc-pill-primary px-4 py-1.5 text-sm"
          data-testid="new-post-btn"
        >
          + New Post
        </button>
      </div>

      {/* Tag filter bar */}
      {availableTags.length > 0 && (
        <div className="px-4 py-2 border-b border-lc-border/50 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] text-lc-muted uppercase tracking-wider shrink-0">Tags:</span>
          <button
            onClick={() => setFilterTag(null)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              filterTag === null
                ? 'bg-lc-border text-lc-white'
                : 'text-lc-muted hover:text-lc-white'
            }`}
          >
            All
          </button>
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
              className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-all"
              style={{
                backgroundColor: filterTag === tag.id ? tag.color + '30' : 'transparent',
                color: filterTag === tag.id ? tag.color : '#a3a3a3',
                border: `1px solid ${filterTag === tag.id ? tag.color + '50' : 'transparent'}`,
              }}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {/* New Post Form */}
        {showNewPost && (
          <div className="lc-card p-4 space-y-3 mb-2" data-testid="new-post-form">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Post title"
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="new-post-title"
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Write your post..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none resize-none"
              data-testid="new-post-content"
            />
            {availableTags.length > 0 && (
              <div>
                <label className="text-[10px] text-lc-muted uppercase tracking-wider mb-1 block">Tags</label>
                <TagSelector available={availableTags} selected={selectedTagIds} onToggle={toggleTag} />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreatePost}
                disabled={posting || !newTitle.trim() || !newContent.trim()}
                className="lc-pill-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {posting ? 'Posting...' : 'Create Post'}
              </button>
              <button
                onClick={() => { setShowNewPost(false); setSelectedTagIds([]); }}
                className="text-sm text-lc-muted hover:text-lc-white px-3 py-2"
              >
                Cancel
              </button>
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
              <button
                key={post.id}
                onClick={() => handleSelectPost(post.id)}
                className="w-full text-left lc-card p-4 hover:border-lc-green/30 transition-colors group"
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
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                        </svg>
                        {post.replyCount}
                      </span>
                      <span>{timeAgo(post.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </button>
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
}
