'use client';

import { useMemo, useState } from 'react';
import type { GameState } from '@/store/games';
import { legalMoves, type ChessAction, type ChessState, type Color } from '@/lib/games/chess';

interface Props {
  game: GameState;
  myPubkey: string | null;
  onAction: (action: ChessAction) => Promise<void>;
}

const GLYPH: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

// Render ranks top-down from my perspective (white at bottom, black at top
// for the opposite player). Index 0 = a1 → bottom-left for white.
export default function ChessBoard({ game, myPubkey, onAction }: Props) {
  const state = game.state as ChessState | undefined;
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [promotionFor, setPromotionFor] = useState<{ from: number; to: number } | null>(null);

  const board = state?.board ?? Array(64).fill(null);
  const colors = state?.colors ?? {};
  const myColor: Color | null = myPubkey ? (colors[myPubkey] ?? null) : null;
  const myTurn =
    game.status === 'in_progress' &&
    !!state &&
    !!myColor &&
    state.turn === myColor;

  const flip = myColor === 'b';

  // Precompute legal destinations for current side (only if it's my turn)
  const myLegal = useMemo(() => {
    if (!state || !myColor || !myTurn) return null;
    return legalMoves(state, myColor);
  }, [state, myColor, myTurn]);

  const legalFromSelected = useMemo(() => {
    if (selected == null || !myLegal) return new Set<number>();
    return new Set(myLegal.filter((m) => m.from === selected).map((m) => m.to));
  }, [selected, myLegal]);

  const trySubmit = async (from: number, to: number, promotion?: 'Q'|'R'|'B'|'N') => {
    setBusy(true);
    try {
      await onAction({ from, to, promotion });
    } finally {
      setBusy(false);
      setSelected(null);
      setPromotionFor(null);
    }
  };

  const click = (sq: number) => {
    if (busy || !myTurn || !myColor || !state) return;
    const piece = board[sq];
    if (selected == null) {
      if (piece && piece[0] === myColor) setSelected(sq);
      return;
    }
    if (sq === selected) { setSelected(null); return; }
    if (piece && piece[0] === myColor) { setSelected(sq); return; }
    if (!legalFromSelected.has(sq)) return;

    // Promotion?
    const fromPiece = board[selected];
    if (fromPiece && fromPiece[1] === 'P') {
      const toRank = sq >> 3;
      if ((myColor === 'w' && toRank === 7) || (myColor === 'b' && toRank === 0)) {
        setPromotionFor({ from: selected, to: sq });
        return;
      }
    }
    trySubmit(selected, sq);
  };

  // Visual iteration order: display from rank 7 → 0 (white on bottom) or
  // rank 0 → 7 (black on bottom).
  const displayRanks = flip ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const displayFiles = flip ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

  const lastMove = state?.lastMove;

  const captured = useMemo(() => {
    const initial: Record<string, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 };
    const remaining: Record<Color, Record<string, number>> = {
      w: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 },
      b: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 },
    };
    for (const p of board) {
      if (!p) continue;
      const c = p[0] as Color;
      const t = p[1];
      remaining[c][t] = (remaining[c][t] ?? 0) + 1;
    }
    const build = (c: Color) => {
      const order: Array<'Q'|'R'|'B'|'N'|'P'> = ['Q','R','B','N','P'];
      const out: string[] = [];
      for (const t of order) {
        const lost = (initial[t] ?? 0) - (remaining[c][t] ?? 0);
        for (let i = 0; i < lost; i++) out.push(GLYPH[`${c}${t}`]);
      }
      return out;
    };
    const VALUES: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
    const score = (c: Color) => {
      let s = 0;
      for (const t of ['P','N','B','R','Q']) {
        s += ((initial[t] ?? 0) - (remaining[c][t] ?? 0)) * (VALUES[t] ?? 0);
      }
      return s;
    };
    const whiteLost = build('w');
    const blackLost = build('b');
    const diff = score('b') - score('w'); // >0 means white is ahead in material
    return { whiteLost, blackLost, diff };
  }, [board]);

  const CapturedRow = ({ pieces, color, advantage }: { pieces: string[]; color: Color; advantage: number }) => (
    <div className="flex items-center gap-1 min-h-[20px] text-lg leading-none w-full max-w-[360px] px-1">
      {pieces.length === 0 ? (
        <span className="text-xs text-lc-muted/50">—</span>
      ) : (
        pieces.map((g, i) => (
          <span
            key={i}
            className={color === 'w' ? 'text-[#fafafa]' : 'text-[#111]'}
            style={{
              textShadow: color === 'w'
                ? '0 1px 2px rgba(0,0,0,0.75), 0 0 1px rgba(0,0,0,0.9)'
                : '0 1px 1px rgba(255,255,255,0.25)',
            }}
          >{g}</span>
        ))
      )}
      {advantage > 0 && (
        <span className="text-xs text-lc-muted ml-1">+{advantage}</span>
      )}
    </div>
  );

  // Top row shows pieces captured by the opponent (i.e. pieces the player at top lost).
  const topColor: Color = flip ? 'w' : 'b';
  const bottomColor: Color = flip ? 'b' : 'w';
  const topLost = topColor === 'w' ? captured.whiteLost : captured.blackLost;
  const bottomLost = bottomColor === 'w' ? captured.whiteLost : captured.blackLost;
  // Advantage for the side whose row this is = material they captured - material opponent captured
  // captured.diff = score('b') - score('w'); white is ahead by diff if diff>0.
  const topAdvantage = topColor === 'w' ? -captured.diff : captured.diff;
  const bottomAdvantage = bottomColor === 'w' ? -captured.diff : captured.diff;

  return (
    <div className="flex flex-col items-center gap-2">
      <CapturedRow pieces={topLost} color={topColor} advantage={topAdvantage} />
      <div
        className="grid grid-cols-8 gap-0 rounded-md overflow-hidden border border-lc-border select-none w-full max-w-[360px]"
        style={{ aspectRatio: '1 / 1' }}
      >
        {displayRanks.map((r) =>
          displayFiles.map((f) => {
            const sq = r * 8 + f;
            const piece = board[sq];
            const isLight = (r + f) % 2 === 1;
            const isSelected = selected === sq;
            const isTarget = legalFromSelected.has(sq);
            const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
            const rankLabel = f === (flip ? 7 : 0);
            const fileLabel = r === (flip ? 7 : 0);
            return (
              <button
                key={sq}
                onClick={() => click(sq)}
                disabled={!myTurn || busy}
                className={`
                  relative aspect-square flex items-center justify-center
                  ${isLight ? 'bg-[#d6b892]' : 'bg-[#7a5230]'}
                  ${isSelected ? 'ring-2 ring-lc-green ring-inset' : ''}
                  ${isLast && !isSelected ? 'ring-1 ring-lc-green/60 ring-inset' : ''}
                  ${myTurn ? 'cursor-pointer' : 'cursor-default'}
                `}
                style={{ fontSize: 'clamp(20px, 6vw, 34px)', lineHeight: 1 }}
              >
                {piece && (
                  <span
                    className={piece[0] === 'w' ? 'text-[#fafafa]' : 'text-[#111]'}
                    style={{
                      textShadow: piece[0] === 'w'
                        ? '0 1px 2px rgba(0,0,0,0.75), 0 0 1px rgba(0,0,0,0.9)'
                        : '0 1px 1px rgba(255,255,255,0.25)',
                    }}
                  >
                    {GLYPH[piece]}
                  </span>
                )}
                {isTarget && !piece && (
                  <span className="absolute w-2.5 h-2.5 rounded-full bg-lc-green/60" />
                )}
                {isTarget && piece && (
                  <span className="absolute inset-0 ring-2 ring-lc-green/70 ring-inset" />
                )}
                {rankLabel && (
                  <span className="absolute left-0.5 top-0 text-[9px] text-lc-muted/70">
                    {r + 1}
                  </span>
                )}
                {fileLabel && (
                  <span className="absolute right-0.5 bottom-0 text-[9px] text-lc-muted/70">
                    {'abcdefgh'[f]}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      <CapturedRow pieces={bottomLost} color={bottomColor} advantage={bottomAdvantage} />

      {myColor && (
        <div className="text-xs text-lc-muted">
          Jugás con las {myColor === 'w' ? 'blancas' : 'negras'}
          {state?.ending && (
            <span className="ml-2 text-lc-white">
              · {state.ending === 'checkmate' ? 'jaque mate'
                : state.ending === 'stalemate' ? 'ahogado'
                : state.ending === '50-move' ? 'regla de 50 movimientos'
                : state.ending === 'timeout' ? 'tiempo agotado'
                : state.ending}
            </span>
          )}
        </div>
      )}

      {promotionFor && (
        <div className="flex items-center gap-2 bg-lc-black/80 border border-lc-border rounded-lg p-2">
          <span className="text-xs text-lc-muted">Promover a</span>
          {(['Q','R','B','N'] as const).map((p) => (
            <button
              key={p}
              onClick={() => trySubmit(promotionFor.from, promotionFor.to, p)}
              className="w-9 h-9 rounded-md bg-lc-border/40 hover:bg-lc-border/70 text-2xl leading-none flex items-center justify-center"
              title={p}
            >
              <span
                className={myColor === 'w' ? 'text-[#fafafa]' : 'text-[#111]'}
                style={{
                  textShadow: myColor === 'w'
                    ? '0 1px 2px rgba(0,0,0,0.75)'
                    : '0 1px 1px rgba(255,255,255,0.35)',
                }}
              >
                {GLYPH[`${myColor}${p}`]}
              </span>
            </button>
          ))}
          <button
            onClick={() => setPromotionFor(null)}
            className="lc-pill-secondary text-xs ml-1"
          >Cancelar</button>
        </div>
      )}
    </div>
  );
}
