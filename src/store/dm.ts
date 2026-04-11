import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DMMessage, DMProtocol } from '@/lib/dm';

export interface DMThread {
  pubkey: string; // the other participant
  displayName: string;
  picture?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount: number;
  protocol?: DMProtocol; // last known protocol used in this thread
}

interface DMPersistedState {
  protocolOverrides: Record<string, DMProtocol>;
}

interface DMState extends DMPersistedState {
  isDMMode: boolean;
  activeDMPubkey: string | null;
  threads: DMThread[];
  messages: DMMessage[];
  isLoadingMessages: boolean;
  isLoadingThreads: boolean;
  /** Has the caller loaded older history at least once? Used by infinite scroll. */
  hasMoreHistory: boolean;
  /** Show the protocol choice popup */
  showProtocolPrompt: string | null; // pubkey to prompt for, or null

  setDMMode: (active: boolean) => void;
  setActiveDM: (pubkey: string | null) => void;
  setThreads: (threads: DMThread[]) => void;
  addThread: (thread: DMThread) => void;
  updateThread: (pubkey: string, updates: Partial<DMThread>) => void;
  setMessages: (messages: DMMessage[]) => void;
  prependMessages: (messages: DMMessage[]) => void;
  addMessage: (message: DMMessage) => void;
  replaceMessage: (pendingId: string, real: DMMessage) => void;
  markMessageFailed: (pendingId: string, error: string) => void;
  setLoadingMessages: (loading: boolean) => void;
  setLoadingThreads: (loading: boolean) => void;
  setHasMoreHistory: (value: boolean) => void;
  setProtocolOverride: (pubkey: string, protocol: DMProtocol) => void;
  setShowProtocolPrompt: (pubkey: string | null) => void;
  incrementUnread: (pubkey: string) => void;
  clearUnread: (pubkey: string) => void;
  totalUnread: () => number;
}

export const useDMStore = create<DMState>()(
  persist(
    (set, get) => ({
      isDMMode: false,
      activeDMPubkey: null,
      threads: [],
      messages: [],
      isLoadingMessages: false,
      isLoadingThreads: false,
      hasMoreHistory: false,
      protocolOverrides: {},
      showProtocolPrompt: null,

      setDMMode: (active) => set({ isDMMode: active }),
      setActiveDM: (pubkey) =>
        set({ activeDMPubkey: pubkey, messages: [], isLoadingMessages: !!pubkey, hasMoreHistory: false }),
      setThreads: (threads) => set({ threads }),
      addThread: (thread) =>
        set((state) => ({
          threads: [thread, ...state.threads.filter((t) => t.pubkey !== thread.pubkey)],
        })),
      updateThread: (pubkey, updates) =>
        set((state) => ({
          threads: state.threads.map((t) => (t.pubkey === pubkey ? { ...t, ...updates } : t)),
        })),
      setMessages: (messages) => set({ messages, isLoadingMessages: false }),
      prependMessages: (older) =>
        set((state) => {
          const existing = new Set(state.messages.map((m) => m.id));
          const fresh = older.filter((m) => !existing.has(m.id));
          return { messages: [...fresh, ...state.messages] };
        }),
      addMessage: (message) =>
        set((state) => {
          if (state.messages.some((m) => m.id === message.id)) return state;
          return { messages: [...state.messages, message] };
        }),
      replaceMessage: (pendingId, real) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.id === pendingId ? real : m)),
        })),
      markMessageFailed: (pendingId, error) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === pendingId ? { ...m, isPending: false, sendError: error } : m,
          ),
        })),
      setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
      setLoadingThreads: (loading) => set({ isLoadingThreads: loading }),
      setHasMoreHistory: (value) => set({ hasMoreHistory: value }),
      setProtocolOverride: (pubkey, protocol) =>
        set((state) => ({
          protocolOverrides: { ...state.protocolOverrides, [pubkey]: protocol },
          showProtocolPrompt: null,
        })),
      setShowProtocolPrompt: (pubkey) => set({ showProtocolPrompt: pubkey }),
      incrementUnread: (pubkey) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.pubkey === pubkey ? { ...t, unreadCount: (t.unreadCount ?? 0) + 1 } : t,
          ),
        })),
      clearUnread: (pubkey) =>
        set((state) => ({
          threads: state.threads.map((t) => (t.pubkey === pubkey ? { ...t, unreadCount: 0 } : t)),
        })),
      totalUnread: () => get().threads.reduce((sum, t) => sum + (t.unreadCount ?? 0), 0),
    }),
    {
      name: 'obelisk-dm-store',
      storage: createJSONStorage(() => {
        if (typeof localStorage === 'undefined') {
          // SSR / node-env fallback: ephemeral in-memory storage
          const mem = new Map<string, string>();
          return {
            getItem: (k) => mem.get(k) ?? null,
            setItem: (k, v) => void mem.set(k, v),
            removeItem: (k) => void mem.delete(k),
          };
        }
        return localStorage;
      }),
      // Only persist the protocol overrides — everything else is derived / ephemeral.
      partialize: (state) => ({ protocolOverrides: state.protocolOverrides }) as DMPersistedState,
    },
  ),
);

/**
 * Mark a DM thread as read on the server. Thin wrapper used by components
 * and hooks so the read-sync surface lives in one place.
 */
export async function markThreadRead(pubkey: string): Promise<void> {
  useDMStore.getState().clearUnread(pubkey);
  try {
    await fetch(`/api/dm/${pubkey}/read`, { method: 'POST' });
  } catch {
    /* best effort */
  }
}
