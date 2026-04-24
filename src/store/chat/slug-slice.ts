import type { StateCreator } from 'zustand';
import type { ChatState } from './index';
import { slugCacheKey, type SlugCacheEntry } from './types';

export interface SlugSlice {
  // Cache of resolved share-link slugs. Keyed by `<slug>|p=<id>|m=<id>` so
  // each variant caches independently. `ChannelLinkPill` reads this to render
  // the resolved channel/post/message label instead of the raw slug.
  slugCache: Record<string, SlugCacheEntry>;

  // Share-link slug resolver — fires a fetch if the key isn't cached yet.
  resolveSlug: (slug: string, opts?: { p?: string; m?: string }) => Promise<void>;
}

export const SLUG_INITIAL_STATE = {
  slugCache: {} as Record<string, SlugCacheEntry>,
};

export const createSlugSlice: StateCreator<ChatState, [], [], SlugSlice> = (set, get) => ({
  ...SLUG_INITIAL_STATE,

  resolveSlug: async (slug, opts) => {
    const key = slugCacheKey(slug, opts);
    const existing = get().slugCache[key];
    if (existing) return; // cached (loading, resolved, or failed)
    set((state) => ({
      slugCache: {
        ...state.slugCache,
        [key]: {
          channelName: null,
          channelId: null,
          serverId: null,
          postTitle: null,
          messageAuthorName: null,
          noAccess: false,
          notFound: false,
          loading: true,
        },
      },
    }));
    try {
      const params = new URLSearchParams({ c: slug });
      if (opts?.p) params.set('p', opts.p);
      if (opts?.m) params.set('m', opts.m);
      const res = await fetch(`/api/channels/resolve-slug?${params.toString()}`);
      if (res.status === 404) {
        set((state) => ({
          slugCache: {
            ...state.slugCache,
            [key]: {
              channelName: null,
              channelId: null,
              serverId: null,
              postTitle: null,
              messageAuthorName: null,
              noAccess: false,
              notFound: true,
              loading: false,
            },
          },
        }));
        return;
      }
      if (!res.ok) throw new Error(`resolve-slug ${res.status}`);
      const data = await res.json();
      set((state) => ({
        slugCache: {
          ...state.slugCache,
          [key]: {
            channelName: data.channelName ?? null,
            channelId: data.channelId ?? null,
            serverId: data.serverId ?? null,
            postTitle: data.postTitle ?? null,
            messageAuthorName: data.messageAuthorName ?? null,
            noAccess: !!data.noAccess,
            notFound: false,
            loading: false,
          },
        },
      }));
    } catch {
      set((state) => ({
        slugCache: {
          ...state.slugCache,
          [key]: {
            channelName: null,
            channelId: null,
            serverId: null,
            postTitle: null,
            messageAuthorName: null,
            noAccess: false,
            notFound: true,
            loading: false,
          },
        },
      }));
    }
  },
});
