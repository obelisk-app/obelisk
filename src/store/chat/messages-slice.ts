import type { StateCreator } from 'zustand';
import type { ChatState } from './index';
import type { Message, Reaction } from './types';

export interface MessagesSlice {
  messages: Message[];
  isLoadingMessages: boolean;

  // Reply & edit state
  replyingTo: Message | null;
  editingMessage: Message | null;

  // Message pagination
  messageCursor: string | null;
  hasMoreMessages: boolean;

  // Search: jump to message highlight
  highlightedMessageId: string | null;

  // Scroll gate used by useReadTracker to decide whether the user is
  // "actually looking at" the latest messages. True when the message list
  // is within ~100px of the bottom. Reset to true on channel change so a
  // freshly-opened channel with no scroll activity still qualifies.
  isNearBottom: boolean;

  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;
  updateMessage: (messageId: string, content: string, editedAt: string) => void;
  updateReactions: (messageId: string, reactions: Reaction[]) => void;
  setLoadingMessages: (loading: boolean) => void;
  setReplyingTo: (message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;

  // Pagination
  setMessageCursor: (cursor: string | null, hasMore: boolean) => void;
  prependMessages: (messages: Message[]) => void;

  // Scroll gate
  setIsNearBottom: (near: boolean) => void;

  // Pin state updates (applied to existing messages in the active channel)
  updatePinState: (
    messageId: string,
    pinnedAt: string | null,
    pinnedByPubkey: string | null,
  ) => void;
}

export const MESSAGES_INITIAL_STATE = {
  messages: [] as Message[],
  isLoadingMessages: false,
  replyingTo: null as Message | null,
  editingMessage: null as Message | null,
  messageCursor: null as string | null,
  hasMoreMessages: false,
  highlightedMessageId: null as string | null,
  isNearBottom: true,
};

export const createMessagesSlice: StateCreator<ChatState, [], [], MessagesSlice> = (set) => ({
  ...MESSAGES_INITIAL_STATE,

  setMessages: (messages) => set({ messages, isLoadingMessages: false }),
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  removeMessage: (messageId) => set((state) => ({
    messages: state.messages.filter((m) => m.id !== messageId),
  })),
  updateMessage: (messageId, content, editedAt) => set((state) => ({
    messages: state.messages.map((m) =>
      m.id === messageId ? { ...m, content, editedAt } : m
    ),
  })),
  updateReactions: (messageId, reactions) => set((state) => ({
    messages: state.messages.map((m) =>
      m.id === messageId ? { ...m, reactions } : m
    ),
  })),
  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
  setReplyingTo: (message) => set({ replyingTo: message }),
  setEditingMessage: (message) => set({ editingMessage: message }),

  setMessageCursor: (cursor, hasMore) => set({ messageCursor: cursor, hasMoreMessages: hasMore }),
  prependMessages: (messages) => set((state) => ({
    messages: [...messages, ...state.messages],
  })),

  setIsNearBottom: (near) => set((state) => (state.isNearBottom === near ? state : { isNearBottom: near })),

  updatePinState: (messageId, pinnedAt, pinnedByPubkey) => set((state) => ({
    messages: state.messages.map((m) =>
      m.id === messageId ? { ...m, pinnedAt, pinnedByPubkey } : m
    ),
  })),
});
