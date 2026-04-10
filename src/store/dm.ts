import { create } from 'zustand';
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

interface DMState {
  isDMMode: boolean;
  activeDMPubkey: string | null;
  threads: DMThread[];
  messages: DMMessage[];
  isLoadingMessages: boolean;
  isLoadingThreads: boolean;
  /** Per-thread protocol preference chosen by user (overrides auto-detect) */
  protocolOverrides: Record<string, DMProtocol>;
  /** Show the protocol choice popup */
  showProtocolPrompt: string | null; // pubkey to prompt for, or null

  setDMMode: (active: boolean) => void;
  setActiveDM: (pubkey: string | null) => void;
  setThreads: (threads: DMThread[]) => void;
  addThread: (thread: DMThread) => void;
  updateThread: (pubkey: string, updates: Partial<DMThread>) => void;
  setMessages: (messages: DMMessage[]) => void;
  addMessage: (message: DMMessage) => void;
  setLoadingMessages: (loading: boolean) => void;
  setLoadingThreads: (loading: boolean) => void;
  setProtocolOverride: (pubkey: string, protocol: DMProtocol) => void;
  setShowProtocolPrompt: (pubkey: string | null) => void;
}

export const useDMStore = create<DMState>()((set) => ({
  isDMMode: false,
  activeDMPubkey: null,
  threads: [],
  messages: [],
  isLoadingMessages: false,
  isLoadingThreads: false,
  protocolOverrides: {},
  showProtocolPrompt: null,

  setDMMode: (active) => set({ isDMMode: active }),
  setActiveDM: (pubkey) => set({ activeDMPubkey: pubkey, messages: [], isLoadingMessages: !!pubkey }),
  setThreads: (threads) => set({ threads }),
  addThread: (thread) => set((state) => ({
    threads: [thread, ...state.threads.filter(t => t.pubkey !== thread.pubkey)],
  })),
  updateThread: (pubkey, updates) => set((state) => ({
    threads: state.threads.map(t => t.pubkey === pubkey ? { ...t, ...updates } : t),
  })),
  setMessages: (messages) => set({ messages, isLoadingMessages: false }),
  addMessage: (message) => set((state) => {
    if (state.messages.some(m => m.id === message.id)) return state;
    return { messages: [...state.messages, message] };
  }),
  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
  setLoadingThreads: (loading) => set({ isLoadingThreads: loading }),
  setProtocolOverride: (pubkey, protocol) => set((state) => ({
    protocolOverrides: { ...state.protocolOverrides, [pubkey]: protocol },
    showProtocolPrompt: null,
  })),
  setShowProtocolPrompt: (pubkey) => set({ showProtocolPrompt: pubkey }),
}));
