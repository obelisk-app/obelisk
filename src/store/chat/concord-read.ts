import { create } from 'zustand';
import type { ChannelHighlights } from '@/services/read-state/selectors';
import { CONCORD_READ_BYTES, CONCORD_READ_LIMIT } from '@/constants/chat/concord-read';

interface ConcordReadState {
  account: string | null;
  sessionId: string | null;
  cursors: Record<string, number>;
  highlights: Record<string, ChannelHighlights>;
  reset(account: string | null, sessionId?: string): void;
  merge(account: string, incoming: Record<string, number>): void;
  setHighlights(account: string, key: string, value: ChannelHighlights | null): void;
}

/** Memory projection only. Persistence belongs to the sealed runtime and NIP-44 sync. */
export const useConcordReadStore = create<ConcordReadState>(set => ({
  account: null, sessionId: null, cursors: {}, highlights: {},
  reset: (account, sessionId) => set({ account, sessionId: sessionId ?? account, cursors: {}, highlights: {} }),
  merge: (account, incoming) => set(state => {
    if (account !== state.account) return state;
    const cursors = { ...state.cursors };
    let changed = false;
    for (const [key, value] of Object.entries(incoming)) {
      if (value <= (cursors[key] ?? 0)) continue;
      if (!(key in cursors) && Object.keys(cursors).length >= CONCORD_READ_LIMIT) continue;
      const prior = cursors[key];
      cursors[key] = value;
      if (JSON.stringify(cursors).length > CONCORD_READ_BYTES) {
        if (prior === undefined) delete cursors[key]; else cursors[key] = prior;
        continue;
      }
      changed = true;
    }
    return changed ? { cursors } : state;
  }),
  setHighlights: (account, key, value) => set(state => {
    if (account !== state.account) return state;
    const highlights = { ...state.highlights };
    if (value) {
      if (!(key in highlights) && Object.keys(highlights).length >= CONCORD_READ_LIMIT) return state;
      if (JSON.stringify(highlights[key]) === JSON.stringify(value)) return state;
      highlights[key] = value;
    } else delete highlights[key];
    return { highlights };
  }),
}));
