import type { ApplyResult, GameDefinition } from './types';

// Board indexing: index = rank * 8 + file.
// Rank 0 = white's back rank (a1..h1 → 0..7). Rank 7 = black's back rank.
// Pieces are encoded as 2-char strings: color (w/b) + type (K,Q,R,B,N,P).

export type Color = 'w' | 'b';
export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
export type Piece = `${Color}${PieceType}`;

export interface ChessState {
  board: (Piece | null)[]; // length 64
  turn: Color;
  colors: Record<string, Color>; // pubkey → color
  castling: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  enPassant: number | null; // target square index, or null
  halfmove: number; // 50-move rule counter
  fullmove: number;
  lastMove: { from: number; to: number } | null;
  // When a move is terminal: 'checkmate' | 'stalemate' | 'resign' | 'timeout' | '50-move' | null
  ending: string | null;
}

export interface ChessAction {
  from: number;
  to: number;
  promotion?: 'Q' | 'R' | 'B' | 'N';
}

const FILE = (sq: number) => sq & 7;
const RANK = (sq: number) => sq >> 3;
const onBoard = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;
const SQ = (r: number, f: number) => r * 8 + f;

function startingBoard(): (Piece | null)[] {
  const b: (Piece | null)[] = Array(64).fill(null);
  const back: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let f = 0; f < 8; f++) {
    b[SQ(0, f)] = `w${back[f]}` as Piece;
    b[SQ(1, f)] = 'wP';
    b[SQ(6, f)] = 'bP';
    b[SQ(7, f)] = `b${back[f]}` as Piece;
  }
  return b;
}

function colorOf(p: Piece | null): Color | null {
  return p ? (p[0] as Color) : null;
}
function typeOf(p: Piece | null): PieceType | null {
  return p ? (p[1] as PieceType) : null;
}

// Pseudo-legal moves for the piece on `from`. Does NOT check own-king safety
// and does NOT include castling (handled separately). Returns target squares.
function pseudoMoves(board: (Piece | null)[], from: number, enPassant: number | null): number[] {
  const piece = board[from];
  if (!piece) return [];
  const color = colorOf(piece)!;
  const type = typeOf(piece)!;
  const r = RANK(from), f = FILE(from);
  const out: number[] = [];

  const slide = (dr: number, df: number) => {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i, nf = f + df * i;
      if (!onBoard(nr, nf)) break;
      const sq = SQ(nr, nf);
      const t = board[sq];
      if (!t) { out.push(sq); continue; }
      if (colorOf(t) !== color) out.push(sq);
      break;
    }
  };

  if (type === 'P') {
    const dir = color === 'w' ? 1 : -1;
    const startRank = color === 'w' ? 1 : 6;
    const one = SQ(r + dir, f);
    if (onBoard(r + dir, f) && !board[one]) {
      out.push(one);
      const two = SQ(r + 2 * dir, f);
      if (r === startRank && !board[two]) out.push(two);
    }
    for (const df of [-1, 1]) {
      const nr = r + dir, nf = f + df;
      if (!onBoard(nr, nf)) continue;
      const sq = SQ(nr, nf);
      const t = board[sq];
      if (t && colorOf(t) !== color) out.push(sq);
      else if (enPassant != null && sq === enPassant) out.push(sq);
    }
  } else if (type === 'N') {
    for (const [dr, df] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]] as const) {
      const nr = r + dr, nf = f + df;
      if (!onBoard(nr, nf)) continue;
      const sq = SQ(nr, nf);
      const t = board[sq];
      if (!t || colorOf(t) !== color) out.push(sq);
    }
  } else if (type === 'B') {
    slide(1,1); slide(1,-1); slide(-1,1); slide(-1,-1);
  } else if (type === 'R') {
    slide(1,0); slide(-1,0); slide(0,1); slide(0,-1);
  } else if (type === 'Q') {
    slide(1,0); slide(-1,0); slide(0,1); slide(0,-1);
    slide(1,1); slide(1,-1); slide(-1,1); slide(-1,-1);
  } else if (type === 'K') {
    for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
      if (!dr && !df) continue;
      const nr = r + dr, nf = f + df;
      if (!onBoard(nr, nf)) continue;
      const sq = SQ(nr, nf);
      const t = board[sq];
      if (!t || colorOf(t) !== color) out.push(sq);
    }
  }
  return out;
}

function findKing(board: (Piece | null)[], color: Color): number {
  const king = `${color}K`;
  for (let i = 0; i < 64; i++) if (board[i] === king) return i;
  return -1;
}

function isSquareAttacked(board: (Piece | null)[], sq: number, byColor: Color): boolean {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || colorOf(p) !== byColor) continue;
    // Pawn attacks differ from pawn moves; use a cheap inline check.
    if (typeOf(p) === 'P') {
      const dir = byColor === 'w' ? 1 : -1;
      const r = RANK(i), f = FILE(i);
      if (RANK(sq) === r + dir && (FILE(sq) === f - 1 || FILE(sq) === f + 1)) return true;
      continue;
    }
    const moves = pseudoMoves(board, i, null);
    if (moves.includes(sq)) return true;
  }
  return false;
}

function inCheck(board: (Piece | null)[], color: Color): boolean {
  const k = findKing(board, color);
  if (k < 0) return false;
  return isSquareAttacked(board, k, color === 'w' ? 'b' : 'w');
}

// Apply a move to a board copy. Handles captures, en passant, castling,
// promotion. Returns the new board and the new en-passant target square
// (or null). Assumes the move is legal.
function makeMove(
  board: (Piece | null)[],
  action: ChessAction,
  castling: ChessState['castling'],
): {
  board: (Piece | null)[];
  enPassant: number | null;
  castling: ChessState['castling'];
  captured: Piece | null;
  pawnOrCapture: boolean;
} {
  const next = board.slice();
  const piece = next[action.from]!;
  const color = colorOf(piece)!;
  const type = typeOf(piece)!;
  let captured = next[action.to];
  let ep: number | null = null;
  const cast = { ...castling };

  // En passant capture
  if (type === 'P' && FILE(action.from) !== FILE(action.to) && !next[action.to]) {
    const capSq = SQ(RANK(action.from), FILE(action.to));
    captured = next[capSq];
    next[capSq] = null;
  }

  next[action.to] = piece;
  next[action.from] = null;

  // Promotion
  if (type === 'P') {
    const lastRank = color === 'w' ? 7 : 0;
    if (RANK(action.to) === lastRank) {
      next[action.to] = `${color}${action.promotion ?? 'Q'}` as Piece;
    }
    if (Math.abs(RANK(action.to) - RANK(action.from)) === 2) {
      ep = SQ((RANK(action.from) + RANK(action.to)) / 2, FILE(action.from));
    }
  }

  // Castling: move rook too.
  if (type === 'K' && Math.abs(FILE(action.to) - FILE(action.from)) === 2) {
    const rank = RANK(action.from);
    if (FILE(action.to) === 6) {
      next[SQ(rank, 5)] = next[SQ(rank, 7)];
      next[SQ(rank, 7)] = null;
    } else if (FILE(action.to) === 2) {
      next[SQ(rank, 3)] = next[SQ(rank, 0)];
      next[SQ(rank, 0)] = null;
    }
  }

  // Update castling rights
  if (type === 'K') {
    if (color === 'w') { cast.wK = false; cast.wQ = false; }
    else { cast.bK = false; cast.bQ = false; }
  }
  if (type === 'R') {
    if (action.from === 0) cast.wQ = false;
    if (action.from === 7) cast.wK = false;
    if (action.from === 56) cast.bQ = false;
    if (action.from === 63) cast.bK = false;
  }
  // Captured rook on its starting square also voids rights.
  if (action.to === 0) cast.wQ = false;
  if (action.to === 7) cast.wK = false;
  if (action.to === 56) cast.bQ = false;
  if (action.to === 63) cast.bK = false;

  const pawnOrCapture = type === 'P' || captured !== null;
  return { board: next, enPassant: ep, castling: cast, captured, pawnOrCapture };
}

// All legal moves for a color (including castling). Used for mate/stalemate
// detection and client-side highlighting.
export function legalMoves(state: ChessState, color: Color): ChessAction[] {
  const moves: ChessAction[] = [];
  for (let from = 0; from < 64; from++) {
    const p = state.board[from];
    if (!p || colorOf(p) !== color) continue;
    for (const to of pseudoMoves(state.board, from, state.enPassant)) {
      const isPromotion =
        typeOf(p) === 'P' && (RANK(to) === 0 || RANK(to) === 7);
      const candidates: ChessAction[] = isPromotion
        ? (['Q','R','B','N'] as const).map((pr) => ({ from, to, promotion: pr }))
        : [{ from, to }];
      for (const a of candidates) {
        const { board } = makeMove(state.board, a, state.castling);
        if (!inCheck(board, color)) moves.push(a);
      }
    }
  }
  // Castling
  const rank = color === 'w' ? 0 : 7;
  const kingSq = SQ(rank, 4);
  if (state.board[kingSq] === `${color}K` && !inCheck(state.board, color)) {
    const opp: Color = color === 'w' ? 'b' : 'w';
    const kside = color === 'w' ? state.castling.wK : state.castling.bK;
    const qside = color === 'w' ? state.castling.wQ : state.castling.bQ;
    if (kside && !state.board[SQ(rank,5)] && !state.board[SQ(rank,6)]
        && state.board[SQ(rank,7)] === `${color}R`
        && !isSquareAttacked(state.board, SQ(rank,5), opp)
        && !isSquareAttacked(state.board, SQ(rank,6), opp)) {
      moves.push({ from: kingSq, to: SQ(rank, 6) });
    }
    if (qside && !state.board[SQ(rank,1)] && !state.board[SQ(rank,2)] && !state.board[SQ(rank,3)]
        && state.board[SQ(rank,0)] === `${color}R`
        && !isSquareAttacked(state.board, SQ(rank,3), opp)
        && !isSquareAttacked(state.board, SQ(rank,2), opp)) {
      moves.push({ from: kingSq, to: SQ(rank, 2) });
    }
  }
  return moves;
}

function sameAction(a: ChessAction, b: ChessAction): boolean {
  if (a.from !== b.from || a.to !== b.to) return false;
  const pa = a.promotion ?? null;
  const pb = b.promotion ?? null;
  // Treat "no promotion specified" on a promoting move as equal to Q.
  return pa === pb || (!pa && pb === 'Q') || (!pb && pa === 'Q');
}

export const chess: GameDefinition<ChessState, ChessAction> = {
  type: 'chess',
  displayName: 'Ajedrez',
  description: 'Ajedrez clásico. Dos jugadores, con o sin límite de tiempo por jugada.',
  minPlayers: 2,
  maxPlayers: 2,
  defaultTurnTimeoutS: 0, // 0 = sin límite; el creador puede elegir otro valor

  initialState(participants): ChessState {
    const colors: Record<string, Color> = {};
    participants.forEach((p, i) => { colors[p] = i === 0 ? 'w' : 'b'; });
    return {
      board: startingBoard(),
      turn: 'w',
      colors,
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      halfmove: 0,
      fullmove: 1,
      lastMove: null,
      ending: null,
    };
  },

  firstTurn(participants) {
    return participants[0];
  },

  validateAction(state, action, actorPubkey) {
    const color = state.colors[actorPubkey];
    if (!color) return { ok: false, error: 'Not a participant' };
    if (color !== state.turn) return { ok: false, error: 'Not your turn' };
    if (typeof action?.from !== 'number' || typeof action?.to !== 'number') {
      return { ok: false, error: 'Invalid action' };
    }
    if (action.from < 0 || action.from > 63 || action.to < 0 || action.to > 63) {
      return { ok: false, error: 'Square out of range' };
    }
    const piece = state.board[action.from];
    if (!piece) return { ok: false, error: 'Empty square' };
    if (colorOf(piece) !== color) return { ok: false, error: 'Not your piece' };
    const legal = legalMoves(state, color);
    if (!legal.some((m) => sameAction(m, action))) {
      return { ok: false, error: 'Illegal move' };
    }
    return { ok: true };
  },

  applyAction(state, action, actorPubkey): ApplyResult<ChessState> {
    const color = state.colors[actorPubkey];
    const { board, enPassant, castling, pawnOrCapture } = makeMove(state.board, action, state.castling);
    const nextTurn: Color = color === 'w' ? 'b' : 'w';
    const next: ChessState = {
      ...state,
      board,
      turn: nextTurn,
      castling,
      enPassant,
      halfmove: pawnOrCapture ? 0 : state.halfmove + 1,
      fullmove: state.fullmove + (color === 'b' ? 1 : 0),
      lastMove: { from: action.from, to: action.to },
      ending: null,
    };

    const oppMoves = legalMoves(next, nextTurn);
    if (oppMoves.length === 0) {
      if (inCheck(next.board, nextTurn)) {
        next.ending = 'checkmate';
        const winner = Object.entries(state.colors).find(([, c]) => c === color)?.[0] ?? null;
        return { state: next, nextTurn: null, winner };
      }
      next.ending = 'stalemate';
      return { state: next, nextTurn: null, draw: true };
    }

    if (next.halfmove >= 100) {
      next.ending = '50-move';
      return { state: next, nextTurn: null, draw: true };
    }

    const nextPubkey = Object.entries(state.colors).find(([, c]) => c === nextTurn)?.[0] ?? null;
    return { state: next, nextTurn: nextPubkey };
  },

  onTimeout(state, timedOutPubkey): ApplyResult<ChessState> {
    const winner = Object.keys(state.colors).find((k) => k !== timedOutPubkey) ?? null;
    return {
      state: { ...state, ending: 'timeout' },
      nextTurn: null,
      winner,
      eliminated: [timedOutPubkey],
    };
  },
};
