import { create } from 'zustand';

import { createChannelsSlice, CHANNELS_INITIAL_STATE, type ChannelsSlice } from './channels-slice';
import { createEphemeralSlice, EPHEMERAL_INITIAL_STATE, type EphemeralSlice } from './ephemeral-slice';
import { createForumFollowSlice, FORUM_FOLLOW_INITIAL_STATE, type ForumFollowSlice } from './forum-follow-slice';
import { createMessagesSlice, MESSAGES_INITIAL_STATE, type MessagesSlice } from './messages-slice';
import { createPeopleSlice, PEOPLE_INITIAL_STATE, type PeopleSlice } from './people-slice';
import { createServersSlice, SERVERS_INITIAL_STATE, type ServersSlice } from './servers-slice';
import { createSlugSlice, SLUG_INITIAL_STATE, type SlugSlice } from './slug-slice';

// Re-export all value + type exports from types.ts so consumers importing
// `@/store/chat` keep getting the same shape they always have.
export type {
  Category,
  Channel,
  EmbeddedAuthor,
  EphemeralMessage,
  FollowedPostMetaEntry,
  ForumTag,
  InvoicePayment,
  MemberInfo,
  Message,
  MyServerRole,
  Reaction,
  ServerGif,
  ServerInfo,
  SlugCacheEntry,
} from './types';
export { slugCacheKey } from './types';

/**
 * Composed chat store type. Consumers only interact with `useChatStore`;
 * the individual slice interfaces exist so each slice can be typed against
 * the combined store (so `set`/`get` see fields from other slices).
 */
export interface ChatState
  extends ServersSlice,
    ChannelsSlice,
    MessagesSlice,
    PeopleSlice,
    EphemeralSlice,
    SlugSlice,
    ForumFollowSlice {
  // Reset all data fields to their initial values. Used on logout /
  // account-switch by `resetAllClientState()` in `@/lib/reset`.
  reset: () => void;
}

// Exported so `@/lib/reset` and tests can assert drift-free restoration.
// Includes only data fields — actions are preserved across resets.
export const CHAT_INITIAL_STATE = {
  ...SERVERS_INITIAL_STATE,
  ...CHANNELS_INITIAL_STATE,
  ...MESSAGES_INITIAL_STATE,
  ...PEOPLE_INITIAL_STATE,
  ...EPHEMERAL_INITIAL_STATE,
  ...SLUG_INITIAL_STATE,
  ...FORUM_FOLLOW_INITIAL_STATE,
};

export const useChatStore = create<ChatState>()((...a) => ({
  ...createServersSlice(...a),
  ...createChannelsSlice(...a),
  ...createMessagesSlice(...a),
  ...createPeopleSlice(...a),
  ...createEphemeralSlice(...a),
  ...createSlugSlice(...a),
  ...createForumFollowSlice(...a),

  reset: () => a[0](() => ({
    ...CHAT_INITIAL_STATE,
    onlinePubkeys: new Set<string>(),
  })),
}));
