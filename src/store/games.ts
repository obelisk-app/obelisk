import { create } from 'zustand';

export interface GameParticipant {
  pubkey: string;
  seat: number;
  status: 'joined' | 'disqualified' | 'left';
  joinedAt: string;
}

export interface GameState {
  id: string;
  serverId: string;
  channelId: string;
  type: string;
  status: 'waiting' | 'in_progress' | 'finished' | 'cancelled';
  minPlayers: number;
  maxPlayers: number;
  turnTimeoutS: number;
  currentTurn: string | null;
  turnDeadline: string | null;
  state: any;
  winnerPubkey: string | null;
  createdBy: string;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  participants: GameParticipant[];
  // Id of the `[[game:<id>]]` marker message in the host channel. Filled
  // on GET /api/games/[id]; used to scope game-chat as a reply thread.
  systemMessageId?: string | null;
}

interface GamesStore {
  games: Record<string, GameState>;
  openGameId: string | null;
  minimized: boolean;
  activitiesPanelOpen: boolean;
  pickerOpen: { channelId: string } | null;
  fullscreenGameId: string | null;
  isGameChatOpen: boolean;

  upsertGame: (g: GameState) => void;
  removeGame: (id: string) => void;
  setOpenGame: (id: string | null) => void;
  setMinimized: (v: boolean) => void;
  setActivitiesPanelOpen: (v: boolean) => void;
  setPickerOpen: (v: { channelId: string } | null) => void;
  setFullscreenGame: (id: string | null) => void;
  setGameChatOpen: (v: boolean) => void;
}

export const useGamesStore = create<GamesStore>((set) => ({
  games: {},
  openGameId: null,
  minimized: false,
  activitiesPanelOpen: false,
  pickerOpen: null,
  fullscreenGameId: null,
  isGameChatOpen: true,

  upsertGame: (g) => set((s) => {
    // Preserve systemMessageId if the server broadcast (which doesn't
    // include it) would otherwise blank what a GET /api/games/[id]
    // already filled in.
    const prev = s.games[g.id];
    const merged = g.systemMessageId == null && prev?.systemMessageId
      ? { ...g, systemMessageId: prev.systemMessageId }
      : g;
    return { games: { ...s.games, [g.id]: merged } };
  }),
  removeGame: (id) => set((s) => {
    const next = { ...s.games };
    delete next[id];
    return { games: next, openGameId: s.openGameId === id ? null : s.openGameId };
  }),
  setOpenGame: (id) => set({ openGameId: id, minimized: id ? false : false }),
  setMinimized: (v) => set({ minimized: v }),
  setActivitiesPanelOpen: (v) => set({ activitiesPanelOpen: v }),
  setPickerOpen: (v) => set({ pickerOpen: v }),
  setFullscreenGame: (id) => set({ fullscreenGameId: id }),
  setGameChatOpen: (v) => set({ isGameChatOpen: v }),
}));
