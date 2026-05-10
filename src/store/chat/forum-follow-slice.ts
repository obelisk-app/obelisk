import type { StateCreator } from 'zustand';
import type { ChatState } from './index';
import type { FollowedPostMetaEntry } from './types';

// Legacy unscoped keys, written by builds before account-scoping landed.
// Migrated into the per-account keys on first `ensureForumFollowForAccount`
// then removed; preserved here only so the migration can read them.
const LEGACY_LIST_KEY = 'obelisk:followed-posts';
const LEGACY_META_KEY = 'obelisk:followed-posts-meta';

let activePubkey: string | null = null;

function listKey(pubkey: string): string {
  return `obelisk-forum-follow:${pubkey}`;
}
function metaKey(pubkey: string): string {
  return `obelisk-forum-follow-meta:${pubkey}`;
}

export interface ForumFollowSlice {
  /**
   * Followed forum post ids. Persisted in localStorage under
   * `obelisk-forum-follow:{myPubkey}` so different accounts on the same
   * browser don't share follow lists.
   *
   * TODO(decentralized-forum-follows): replace localStorage with a Nostr
   * event (e.g. NIP-51 list) so follows sync across the user's devices.
   */
  followedPostIds: string[];
  followedPostMeta: Record<string, FollowedPostMetaEntry>;
  followedPostsLoading: boolean;
  /**
   * Session-only: post ids the user explicitly unfollowed this session.
   * Prevents auto-follow-on-send from immediately re-subscribing them.
   */
  suppressedAutoFollowPostIds: string[];

  loadFollowedPosts: () => Promise<void>;
  toggleFollowPost: (postId: string, meta?: { title: string; channelId: string; channelName: string; serverId: string }) => Promise<void>;
}

export const FORUM_FOLLOW_INITIAL_STATE = {
  followedPostIds: [] as string[],
  followedPostMeta: {} as Record<string, FollowedPostMetaEntry>,
  followedPostsLoading: false,
  suppressedAutoFollowPostIds: [] as string[],
};

function readStorageList(): string[] {
  if (typeof window === 'undefined') return [];
  if (!activePubkey) return [];
  try {
    const raw = localStorage.getItem(listKey(activePubkey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function readStorageMeta(): Record<string, FollowedPostMetaEntry> {
  if (typeof window === 'undefined') return {};
  if (!activePubkey) return {};
  try {
    const raw = localStorage.getItem(metaKey(activePubkey));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, FollowedPostMetaEntry>) : {};
  } catch {
    return {};
  }
}

function writeStorage(ids: string[], meta: Record<string, FollowedPostMetaEntry>): void {
  if (typeof window === 'undefined') return;
  if (!activePubkey) return;
  try {
    localStorage.setItem(listKey(activePubkey), JSON.stringify(ids));
    localStorage.setItem(metaKey(activePubkey), JSON.stringify(meta));
  } catch { /* quota etc. — ignore */ }
}

/**
 * Multi-account isolation for forum follows. Mirrors `ensureDMStoreForAccount`:
 * call once on login (or whenever the active pubkey changes). Idempotent.
 *
 * On the first call after the legacy build, migrates the unscoped
 * `obelisk:followed-posts[-meta]` key into the per-account variant, then
 * removes the legacy entry so it can't reseed on the next login as a
 * different user.
 */
export function ensureForumFollowForAccount(myPubkey: string): void {
  if (activePubkey === myPubkey) return;
  activePubkey = myPubkey;
  if (typeof window === 'undefined') return;
  try {
    const newList = listKey(myPubkey);
    if (localStorage.getItem(newList) === null) {
      const legacyList = localStorage.getItem(LEGACY_LIST_KEY);
      const legacyMeta = localStorage.getItem(LEGACY_META_KEY);
      if (legacyList) localStorage.setItem(newList, legacyList);
      if (legacyMeta) localStorage.setItem(metaKey(myPubkey), legacyMeta);
    }
    // Always remove the legacy keys after the first per-account write —
    // they're a cross-account leak.
    localStorage.removeItem(LEGACY_LIST_KEY);
    localStorage.removeItem(LEGACY_META_KEY);
  } catch { /* ignore */ }
}

export const createForumFollowSlice: StateCreator<ChatState, [], [], ForumFollowSlice> = (set, get) => ({
  ...FORUM_FOLLOW_INITIAL_STATE,

  loadFollowedPosts: async () => {
    if (typeof window === 'undefined') return;
    set({ followedPostsLoading: true });
    const ids = readStorageList();
    const meta = readStorageMeta();
    set({ followedPostIds: ids, followedPostMeta: meta, followedPostsLoading: false });
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
    // automatically on their next send. When they explicitly follow,
    // clear the suppression.
    const nextSuppressed = wasFollowing
      ? Array.from(new Set([...currentSuppressed, postId]))
      : currentSuppressed.filter((x) => x !== postId);

    set({
      followedPostIds: nextIds,
      followedPostMeta: nextMeta,
      suppressedAutoFollowPostIds: nextSuppressed,
    });
    writeStorage(nextIds, nextMeta);
  },
});
