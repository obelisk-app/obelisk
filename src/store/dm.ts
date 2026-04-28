import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DMMessage, DMProtocol } from '@/lib/dm/dm';

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
  /**
   * Per-partner read cursors in unix milliseconds. Messages whose created_at
   * is <= cursor are considered read. Device-local by design — NIP-17
   * inbox relays are not a reliable shared read state, and we don't want
   * the server to learn who the user is DMing with.
   */
  readCursors: Record<string, number>;
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
  setReadCursor: (pubkey: string, tsMs: number) => void;
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
      readCursors: {},
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
      setReadCursor: (pubkey, tsMs) =>
        set((state) => ({
          readCursors: { ...state.readCursors, [pubkey]: tsMs },
        })),
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
      // Persist protocol overrides + device-local read cursors. Everything
      // else is derived from cache or ephemeral UI state.
      partialize: (state) =>
        ({
          protocolOverrides: state.protocolOverrides,
          readCursors: state.readCursors,
        }) as DMPersistedState,
    },
  ),
);

/**
 * Mark a DM thread as read on this device. Read state is intentionally
 * local-only (localStorage via the persist middleware): DMs are E2E
 * encrypted and the server has no business tracking which conversations
 * the user opens.
 */
export async function markThreadRead(pubkey: string): Promise<void> {
  const store = useDMStore.getState();
  store.clearUnread(pubkey);
  store.setReadCursor(pubkey, Date.now());
}

/**
 * Multi-account isolation: swap the persist storage key to one namespaced
 * by the active account's pubkey. Without this, protocolOverrides /
 * readCursors leak across logins on the same device.
 *
 * Call once on login (or whenever the active pubkey changes). Idempotent —
 * a no-op when the key is already pointing at this account.
 */
let activeStorageName = 'obelisk-dm-store';

export function ensureDMStoreForAccount(myPubkey: string): void {
  const next = `obelisk-dm-store:${myPubkey}`;
  if (next === activeStorageName) return;
  activeStorageName = next;
  useDMStore.persist.setOptions({ name: next });
  void useDMStore.persist.rehydrate();
}
