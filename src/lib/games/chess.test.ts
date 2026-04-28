import { describe, it, expect } from 'vitest';
import { chess, legalMoves, type ChessAction, type ChessState } from './chess';

const W = 'pk-white';
const B = 'pk-black';
const SQ = (file: string, rank: number) => (rank - 1) * 8 + 'abcdefgh'.indexOf(file);

function newGame(): ChessState {
  return chess.initialState([W, B]);
}

function play(moves: Array<[string, ChessAction]>): { state: ChessState; last: ReturnType<typeof chess.applyAction> } {
  let state = newGame();
  let last!: ReturnType<typeof chess.applyAction>;
  const participants = [W, B];
  for (const [pk, a] of moves) {
    const v = chess.validateAction(state, a, pk);
    if (!v.ok) throw new Error(`Invalid ${pk} ${JSON.stringify(a)}: ${v.error}`);
    last = chess.applyAction(state, a, pk, participants);
    state = last.state;
  }
  return { state, last };
}

describe('chess', () => {
  it('initial position has 16 pieces per side, white to move', () => {
    const s = newGame();
    const white = s.board.filter((p) => p && p[0] === 'w').length;
    const black = s.board.filter((p) => p && p[0] === 'b').length;
    expect(white).toBe(16);
    expect(black).toBe(16);
    expect(s.turn).toBe('w');
  });

  it('white has 20 legal first moves', () => {
    const s = newGame();
    expect(legalMoves(s, 'w').length).toBe(20);
  });

  it('rejects moving opponent piece', () => {
    const s = newGame();
    const v = chess.validateAction(s, { from: SQ('e', 7), to: SQ('e', 6) }, W);
    expect(v.ok).toBe(false);
  });

  it('rejects move when not your turn', () => {
    const s = newGame();
    const v = chess.validateAction(s, { from: SQ('e', 7), to: SQ('e', 6) }, B);
    expect(v.ok).toBe(false); // black can't move first even with a black piece
  });

  it('pawn two-square push sets en passant target', () => {
    const { state } = play([[W, { from: SQ('e', 2), to: SQ('e', 4) }]]);
    expect(state.enPassant).toBe(SQ('e', 3));
    expect(state.turn).toBe('b');
  });

  it('fool\'s mate: 1. f3 e5 2. g4 Qh4# — black wins', () => {
    const { last } = play([
      [W, { from: SQ('f', 2), to: SQ('f', 3) }],
      [B, { from: SQ('e', 7), to: SQ('e', 5) }],
      [W, { from: SQ('g', 2), to: SQ('g', 4) }],
      [B, { from: SQ('d', 8), to: SQ('h', 4) }],
    ]);
    expect(last.nextTurn).toBeNull();
    expect(last.winner).toBe(B);
    expect(last.state.ending).toBe('checkmate');
  });

  it('kingside castling is legal once the path is clear', () => {
    const { state } = play([
      [W, { from: SQ('e', 2), to: SQ('e', 4) }],
      [B, { from: SQ('e', 7), to: SQ('e', 5) }],
      [W, { from: SQ('g', 1), to: SQ('f', 3) }],
      [B, { from: SQ('b', 8), to: SQ('c', 6) }],
      [W, { from: SQ('f', 1), to: SQ('c', 4) }],
      [B, { from: SQ('g', 8), to: SQ('f', 6) }],
    ]);
    const moves = legalMoves(state, 'w');
    const castled = moves.find((m) => m.from === SQ('e', 1) && m.to === SQ('g', 1));
    expect(castled).toBeTruthy();
    const after = chess.applyAction(state, castled!, W, [W, B]);
    expect(after.state.board[SQ('g', 1)]).toBe('wK');
    expect(after.state.board[SQ('f', 1)]).toBe('wR');
    expect(after.state.castling.wK).toBe(false);
    expect(after.state.castling.wQ).toBe(false);
  });

  it('en passant capture removes the enemy pawn', () => {
    // 1. e4 a6 2. e5 d5 — now white en-passant captures on d6.
    const { state } = play([
      [W, { from: SQ('e', 2), to: SQ('e', 4) }],
      [B, { from: SQ('a', 7), to: SQ('a', 6) }],
      [W, { from: SQ('e', 4), to: SQ('e', 5) }],
      [B, { from: SQ('d', 7), to: SQ('d', 5) }],
    ]);
    expect(state.enPassant).toBe(SQ('d', 6));
    const ep = chess.applyAction(state, { from: SQ('e', 5), to: SQ('d', 6) }, W, [W, B]);
    expect(ep.state.board[SQ('d', 6)]).toBe('wP');
    expect(ep.state.board[SQ('d', 5)]).toBeNull();
  });

  it('pawn promotion to queen', () => {
    // Build a position: white pawn on e7, black king on a8, white king on e1.
    let s = newGame();
    const empty: (typeof s.board)[number][] = Array(64).fill(null);
    s = { ...s, board: [...empty] };
    s.board[SQ('e', 1)] = 'wK';
    s.board[SQ('e', 7)] = 'wP';
    s.board[SQ('a', 8)] = 'bK';
    s.castling = { wK: false, wQ: false, bK: false, bQ: false };

    const v = chess.validateAction(s, { from: SQ('e', 7), to: SQ('e', 8), promotion: 'Q' }, W);
    expect(v.ok).toBe(true);
    const r = chess.applyAction(s, { from: SQ('e', 7), to: SQ('e', 8), promotion: 'Q' }, W, [W, B]);
    expect(r.state.board[SQ('e', 8)]).toBe('wQ');
  });

  it('timeout: the timed-out player loses', () => {
    const s = newGame();
    const r = chess.onTimeout(s, W, [W, B]);
    expect(r.nextTurn).toBeNull();
    expect(r.winner).toBe(B);
  });

  it('can\'t move a pinned piece into a discovered check', () => {
    // White king on e1, white knight on e2, black rook on e8: knight is pinned.
    let s = newGame();
    const empty: (typeof s.board)[number][] = Array(64).fill(null);
    s = { ...s, board: [...empty] };
    s.board[SQ('e', 1)] = 'wK';
    s.board[SQ('e', 2)] = 'wN';
    s.board[SQ('e', 8)] = 'bR';
    s.board[SQ('a', 8)] = 'bK';
    s.castling = { wK: false, wQ: false, bK: false, bQ: false };

    const moves = legalMoves(s, 'w').filter((m) => m.from === SQ('e', 2));
    expect(moves.length).toBe(0);
  });
});
