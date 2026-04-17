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

export type SortMode = 'relevance' | 'newest' | 'oldest';
export type HasFilter = 'link' | 'image' | 'video' | 'file';
export type PickerMode = null | 'from' | 'in' | 'mentions' | 'has' | 'more';

export interface ActiveFilters {
  from?: { pubkey: string; name: string };
  in?: { id: string; name: string };
  mentions?: { pubkey: string; name: string };
  has?: HasFilter;
  before?: string; // YYYY-MM-DD
  after?: string;  // YYYY-MM-DD
}

interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  isOpen: boolean;
  cursor: string | null;
  hasMore: boolean;
  sort: SortMode;
  activeFilters: ActiveFilters;
  pickerMode: PickerMode;

  setQuery: (query: string) => void;
  setResults: (results: SearchResult[], cursor: string | null, hasMore: boolean) => void;
  appendResults: (results: SearchResult[], cursor: string | null, hasMore: boolean) => void;
  setIsSearching: (loading: boolean) => void;
  setIsOpen: (open: boolean) => void;
  setSort: (sort: SortMode) => void;
  setFilter: <K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) => void;
  removeFilter: (key: keyof ActiveFilters) => void;
  clearFilters: () => void;
  openPicker: (mode: Exclude<PickerMode, null>) => void;
  closePicker: () => void;
  clearSearch: () => void;
}

export const useSearchStore = create<SearchState>()((set) => ({
  query: '',
  results: [],
  isSearching: false,
  isOpen: false,
  cursor: null,
  hasMore: false,
  sort: 'newest',
  activeFilters: {},
  pickerMode: null,

  setQuery: (query) => set({ query }),
  setResults: (results, cursor, hasMore) => set({ results, cursor, hasMore }),
  appendResults: (results, cursor, hasMore) =>
    set((state) => ({ results: [...state.results, ...results], cursor, hasMore })),
  setIsSearching: (isSearching) => set({ isSearching }),
  setIsOpen: (isOpen) => set({ isOpen }),
  setSort: (sort) => set({ sort }),
  setFilter: (key, value) =>
    set((state) => ({ activeFilters: { ...state.activeFilters, [key]: value } })),
  removeFilter: (key) =>
    set((state) => {
      const next = { ...state.activeFilters };
      delete next[key];
      return { activeFilters: next };
    }),
  clearFilters: () => set({ activeFilters: {} }),
  openPicker: (mode) => set({ pickerMode: mode }),
  closePicker: () => set({ pickerMode: null }),
  clearSearch: () =>
    set({
      query: '',
      results: [],
      isSearching: false,
      isOpen: false,
      cursor: null,
      hasMore: false,
      activeFilters: {},
      pickerMode: null,
    }),
}));

/**
 * Combine the free-text query with structured filter chips into a single
 * search string that `/api/search` (via parseSearchQuery) understands.
 */
export function buildEffectiveQuery(query: string, filters: ActiveFilters): string {
  const parts: string[] = [];
  if (filters.from?.name) parts.push(`from:${filters.from.name}`);
  if (filters.in?.name) parts.push(`in:${filters.in.name}`);
  if (filters.mentions?.name) parts.push(`mentions:${filters.mentions.name}`);
  if (filters.has) parts.push(`has:${filters.has}`);
  if (filters.before) parts.push(`before:${filters.before}`);
  if (filters.after) parts.push(`after:${filters.after}`);
  const trimmed = query.trim();
  if (trimmed) parts.push(trimmed);
  return parts.join(' ');
}
