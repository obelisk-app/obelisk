import type { ApplyResult, GameDefinition } from './types';

export interface TTTState {
  board: (null | 'X' | 'O')[]; // length 9, row-major
  marks: Record<string, 'X' | 'O'>; // pubkey → mark
}

export interface TTTAction {
  cell: number; // 0..8
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: TTTState['board']): 'X' | 'O' | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function isFull(board: TTTState['board']): boolean {
  return board.every((c) => c !== null);
}

function otherPlayer(state: TTTState, pubkey: string): string | null {
  const keys = Object.keys(state.marks);
  return keys.find((k) => k !== pubkey) ?? null;
}

export const ticTacToe: GameDefinition<TTTState, TTTAction> = {
  type: 'tic-tac-toe',
  displayName: 'Tic-Tac-Toe',
  description: 'Clásico 3×3. Dos jugadores, por turnos.',
  minPlayers: 2,
  maxPlayers: 2,
  defaultTurnTimeoutS: 30,

  initialState(participants) {
    if (participants.length !== 2) {
      // engine still allows construction in waiting phase; real start is gated by minPlayers
      const marks: TTTState['marks'] = {};
      participants.forEach((p, i) => { marks[p] = i === 0 ? 'X' : 'O'; });
      return { board: Array(9).fill(null), marks };
    }
    return {
      board: Array(9).fill(null),
      marks: { [participants[0]]: 'X', [participants[1]]: 'O' },
    };
  },

  firstTurn(participants) {
    return participants[0];
  },

  validateAction(state, action, actorPubkey) {
    if (!state.marks[actorPubkey]) return { ok: false, error: 'Not a participant' };
    if (typeof action?.cell !== 'number' || action.cell < 0 || action.cell > 8) {
      return { ok: false, error: 'Invalid cell' };
    }
    if (state.board[action.cell] !== null) return { ok: false, error: 'Cell taken' };
    return { ok: true };
  },

  applyAction(state, action, actorPubkey): ApplyResult<TTTState> {
    const mark = state.marks[actorPubkey];
    const board = state.board.slice();
    board[action.cell] = mark;
    const nextState: TTTState = { ...state, board };

    const winMark = checkWinner(board);
    if (winMark) {
      const winner = Object.entries(state.marks).find(([, m]) => m === winMark)?.[0] ?? null;
      return { state: nextState, nextTurn: null, winner };
    }
    if (isFull(board)) {
      return { state: nextState, nextTurn: null, draw: true };
    }
    return { state: nextState, nextTurn: otherPlayer(state, actorPubkey) };
  },

  onTimeout(state, timedOutPubkey): ApplyResult<TTTState> {
    // Two-player: timing out = losing. Opponent wins immediately.
    const winner = otherPlayer(state, timedOutPubkey);
    return {
      state,
      nextTurn: null,
      winner,
      eliminated: [timedOutPubkey],
    };
  },
};
