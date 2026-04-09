import { create } from 'zustand';
import type { DMMessage } from '@/lib/dm';

export interface DMThread {
  pubkey: string; // the other participant
  displayName: string;
  picture?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount: number;
}

interface DMState {
  isDMMode: boolean;
  activeDMPubkey: string | null;
  threads: DMThread[];
  messages: DMMessage[];
  isLoadingMessages: boolean;

  setDMMode: (active: boolean) => void;
  setActiveDM: (pubkey: string | null) => void;
  setThreads: (threads: DMThread[]) => void;
  addThread: (thread: DMThread) => void;
  updateThread: (pubkey: string, updates: Partial<DMThread>) => void;
  setMessages: (messages: DMMessage[]) => void;
  addMessage: (message: DMMessage) => void;
  setLoadingMessages: (loading: boolean) => void;
}

export const useDMStore = create<DMState>()((set) => ({
  isDMMode: false,
  activeDMPubkey: null,
  threads: [],
  messages: [],
  isLoadingMessages: false,

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
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
}));
