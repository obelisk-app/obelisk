import { create } from 'zustand';

export interface SearchResult {
  id: string;
  channelId: string;
  channelName: string;
  authorPubkey: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  replyTo?: { id: string; content: string; authorPubkey: string } | null;
  reactions?: { id: string; messageId: string; authorPubkey: string; emoji: string }[];
}

interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  isOpen: boolean;
  cursor: string | null;
  hasMore: boolean;

  setQuery: (query: string) => void;
  setResults: (results: SearchResult[], cursor: string | null, hasMore: boolean) => void;
  appendResults: (results: SearchResult[], cursor: string | null, hasMore: boolean) => void;
  setIsSearching: (loading: boolean) => void;
  setIsOpen: (open: boolean) => void;
  clearSearch: () => void;
}

export const useSearchStore = create<SearchState>()((set) => ({
  query: '',
  results: [],
  isSearching: false,
  isOpen: false,
  cursor: null,
  hasMore: false,

  setQuery: (query) => set({ query }),
  setResults: (results, cursor, hasMore) => set({ results, cursor, hasMore }),
  appendResults: (results, cursor, hasMore) =>
    set((state) => ({ results: [...state.results, ...results], cursor, hasMore })),
  setIsSearching: (isSearching) => set({ isSearching }),
  setIsOpen: (isOpen) => set({ isOpen }),
  clearSearch: () => set({ query: '', results: [], isSearching: false, isOpen: false, cursor: null, hasMore: false }),
}));
