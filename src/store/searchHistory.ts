import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SearchHistoryEntry {
  query: string;
  serverId: string;
  at: number;
}

const MAX_PER_SERVER = 10;

interface SearchHistoryState {
  entries: SearchHistoryEntry[];
  push: (query: string, serverId: string) => void;
  remove: (query: string, serverId: string) => void;
  clear: (serverId: string) => void;
  getFor: (serverId: string) => SearchHistoryEntry[];
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],

      push: (query, serverId) => {
        const q = query.trim();
        if (!q) return;
        set((state) => {
          const filtered = state.entries.filter(
            (e) => !(e.serverId === serverId && e.query === q)
          );
          const updated: SearchHistoryEntry = { query: q, serverId, at: Date.now() };
          const perServerCount = filtered.filter((e) => e.serverId === serverId).length;
          let next = [updated, ...filtered];
          if (perServerCount + 1 > MAX_PER_SERVER) {
            const trimmed: SearchHistoryEntry[] = [];
            let kept = 0;
            for (const e of next) {
              if (e.serverId === serverId) {
                if (kept < MAX_PER_SERVER) {
                  trimmed.push(e);
                  kept++;
                }
              } else {
                trimmed.push(e);
              }
            }
            next = trimmed;
          }
          return { entries: next };
        });
      },

      remove: (query, serverId) =>
        set((state) => ({
          entries: state.entries.filter(
            (e) => !(e.serverId === serverId && e.query === query)
          ),
        })),

      clear: (serverId) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.serverId !== serverId),
        })),

      getFor: (serverId) =>
        get()
          .entries.filter((e) => e.serverId === serverId)
          .sort((a, b) => b.at - a.at),
    }),
    {
      name: 'obelisk:search-history',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
