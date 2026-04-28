'use client';

import { useState } from 'react';
import type { GameState } from '@/store/games';

interface Props {
  game: GameState;
  myPubkey: string | null;
  onAction: (action: any) => Promise<void>;
}

export default function TicTacToeBoard({ game, myPubkey, onAction }: Props) {
  const [busy, setBusy] = useState(false);
  const board: (null | 'X' | 'O')[] = game.state?.board ?? Array(9).fill(null);
  const marks: Record<string, 'X' | 'O'> = game.state?.marks ?? {};
  const myMark = myPubkey ? marks[myPubkey] : null;
  const myTurn = game.status === 'in_progress' && !!myPubkey && game.currentTurn === myPubkey;

  const click = async (cell: number) => {
    if (busy || !myTurn || board[cell] !== null) return;
    setBusy(true);
    try {
      await onAction({ cell });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-1.5 w-60 mx-auto">
      {board.map((mark, i) => (
        <button
          key={i}
          onClick={() => click(i)}
          disabled={!myTurn || !!mark || busy}
          className={`
            aspect-square rounded-md flex items-center justify-center text-3xl font-bold
            ${mark === 'X' ? 'text-lc-green' : mark === 'O' ? 'text-red-400' : 'text-lc-muted'}
            ${myTurn && !mark ? 'bg-lc-border/40 hover:bg-lc-border/70 cursor-pointer' : 'bg-lc-border/20 cursor-not-allowed'}
            transition-colors
          `}
        >
          {mark ?? ''}
        </button>
      ))}
      {myMark && (
        <div className="col-span-3 text-center text-xs text-lc-muted mt-1">
          Jugás como <span className="font-mono text-lc-white">{myMark}</span>
        </div>
      )}
    </div>
  );
}
