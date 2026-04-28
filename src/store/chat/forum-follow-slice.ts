import type { StateCreator } from 'zustand';
import type { ChatState } from './index';
import type { FollowedPostMetaEntry } from './types';

export interface ForumFollowSlice {
  // Followed forum post ids (localStorage-backed today; see FORUM_PLAN.md
  // Phase F for the future DB-backed subscription model). Rendered as
  // expandable subchannel rows under their forum channel in ChannelSidebar.
  followedPostIds: string[];
  // Resolved metadata for followed posts. Fetched via GET /api/forum/posts/meta.
  followedPostMeta: Record<string, FollowedPostMetaEntry>;
  followedPostsLoading: boolean;
  // Session-only: post ids the user explicitly unfollowed this session.
  // Prevents auto-follow-on-send from immediately re-subscribing them.
  suppressedAutoFollowPostIds: string[];

  // Sync followedPostIds from localStorage + fetch metadata for any unknown ids.
  loadFollowedPosts: () => Promise<void>;
  // Toggle follow/unfollow for a given post. Updates localStorage + store.
  toggleFollowPost: (postId: string, meta?: { title: string; channelId: string; channelName: string; serverId: string }) => Promise<void>;
}

export const FORUM_FOLLOW_INITIAL_STATE = {
  followedPostIds: [] as string[],
  followedPostMeta: {} as Record<string, FollowedPostMetaEntry>,
  followedPostsLoading: false,
  suppressedAutoFollowPostIds: [] as string[],
};

export const createForumFollowSlice: StateCreator<ChatState, [], [], ForumFollowSlice> = (set, get) => ({
  ...FORUM_FOLLOW_INITIAL_STATE,

  loadFollowedPosts: async () => {
    if (typeof window === 'undefined') return;
    set({ followedPostsLoading: true });

    // One-time migration: if the legacy localStorage key has entries and
    // hasn't been migrated yet, POST each id to the new follow API and then
    // clear the key. Best-effort — any failure leaves the key in place for
    // a retry next mount.
    try {
      const migrated = localStorage.getItem('obelisk:followed-migrated') === '1';
      if (!migrated) {
        const raw = localStorage.getItem('obelisk:followed-posts');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const legacyIds = parsed.filter((x): x is string => typeof x === 'string');
            for (const id of legacyIds) {
              try {
                await fetch(`/api/forum/posts/${encodeURIComponent(id)}/follow`, { method: 'POST' });
              } catch { /* ignore individual failures */ }
            }
          }
        }
        localStorage.setItem('obelisk:followed-migrated', '1');
        localStorage.removeItem('obelisk:followed-posts');
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch('/api/forum/posts/followed');
      if (res.ok) {
        const data = await res.json();
        const ids: string[] = [];
        const meta: Record<string, FollowedPostMetaEntry> = {};
        const unreads: Record<string, number> = {};
        const mentions: Record<string, boolean> = {};
        for (const p of data.posts as Array<{ id: string; title: string; channelId: string; channelName: string; serverId: string; unreadCount?: number; hasMention?: boolean }>) {
          ids.push(p.id);
          meta[p.id] = p;
          if (typeof p.unreadCount === 'number' && p.unreadCount > 0) {
            unreads[p.id] = p.unreadCount;
          }
          if (p.hasMention) {
            mentions[p.id] = true;
          }
        }
        set({ followedPostIds: ids, followedPostMeta: meta });
        // Hydrate per-post unread counts + mention flags from the server.
        // Without the mention flag the red `@` only survives until the next
        // page refresh, since realtime-only flagging has no persistence.
        const { useNotificationStore } = await import('../notification');
        useNotificationStore.getState().setPostUnreads(unreads, mentions);
      }
    } catch { /* ignore */ }
    set({ followedPostsLoading: false });
  },

  toggleFollowPost: async (postId, meta) => {
    if (typeof window === 'undefined') return;
    const state = get();
    const currentIds = Array.isArray(state.followedPostIds) ? state.followedPostIds : [];
    const currentMeta = state.followedPostMeta && typeof state.followedPostMeta === 'object' ? state.followedPostMeta : {};
    const currentSuppressed = Array.isArray(state.suppressedAutoFollowPostIds)
      ? state.suppressedAutoFollowPostIds
      : [];
    const wasFollowing = currentIds.includes(postId);

    // Optimistic update.
    const nextIds = wasFollowing
      ? currentIds.filter((x) => x !== postId)
      : [...currentIds, postId];
    const nextMeta = { ...currentMeta };
    if (wasFollowing) {
      delete nextMeta[postId];
    } else if (meta) {
      nextMeta[postId] = { id: postId, ...meta };
    }
    // When the user explicitly unfollows, remember so we don't re-follow
    // them automatically on their next send. When they explicitly follow,
    // clear the suppression.
    const nextSuppressed = wasFollowing
      ? Array.from(new Set([...currentSuppressed, postId]))
      : currentSuppressed.filter((x) => x !== postId);
    set({ followedPostIds: nextIds, followedPostMeta: nextMeta, suppressedAutoFollowPostIds: nextSuppressed });

    try {
      const res = await fetch(`/api/forum/posts/${encodeURIComponent(postId)}/follow`, { method: 'POST' });
      if (!res.ok) {
        console.warn('[follow] server rejected', res.status, await res.text().catch(() => ''));
        // Roll back optimistic update so the UI matches the server.
        set({
          followedPostIds: currentIds,
          followedPostMeta: currentMeta,
          suppressedAutoFollowPostIds: currentSuppressed,
        });
        return;
      }
    } catch (err) {
      console.warn('[follow] network error', err);
      return;
    }

    // After a follow, if we don't have metadata yet, refetch the full list.
    if (!wasFollowing && !meta) {
      await get().loadFollowedPosts();
    }
  },
});
