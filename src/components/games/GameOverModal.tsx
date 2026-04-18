'use client';

import { useEffect, useState } from 'react';
import type { GameState } from '@/store/games';
import { useChatStore } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { resolvePlayerName } from '@/lib/games/player-name';

// Shown on top of the board once the server broadcasts `status: finished`.
// Dismisses itself with a close button; `onClose` is responsible for the
// outer cleanup (closing the dock / leaving fullscreen) that each host
// component wants to do when the user acknowledges the result.
export default function GameOverModal({
  game,
  onClose,
}: {
  game: GameState;
  onClose: () => void;
}) {
  const me = useAuthStore((s) => s.user?.pubkey) ?? null;
  const memberList = useChatStore((s) => s.memberList);
  // Only render once per game per session: when the game row transitions
  // from in_progress → finished, we open; after the user closes it stays
  // closed even if `game.status` is still "finished" on re-render.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (game.status !== 'finished') setDismissed(false);
  }, [game.status]);

  if (game.status !== 'finished' || dismissed) return null;

  const won = !!game.winnerPubkey && game.winnerPubkey === me;
  const lost = !!game.winnerPubkey && !!me && game.participants.some((p) => p.pubkey === me) && game.winnerPubkey !== me;
  const draw = !game.winnerPubkey;

  const title = draw ? 'Empate' : won ? '🏆 ¡Ganaste!' : lost ? 'Perdiste' : 'Terminó la partida';
  const winnerLabel = game.winnerPubkey ? resolvePlayerName(game.winnerPubkey, me, memberList) : null;

  const handleClose = () => {
    setDismissed(true);
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-xl"
      onClick={handleClose}
      data-testid="game-over-modal"
    >
      <div
        className="bg-lc-dark border border-lc-border rounded-xl p-6 w-full max-w-xs mx-4 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`text-xl font-bold mb-2 ${won ? 'text-lc-green' : lost ? 'text-red-400' : 'text-lc-white'}`}>
          {title}
        </div>
        {!draw && winnerLabel && !won && (
          <div className="text-sm text-lc-muted mb-4">Ganó <span className="text-lc-white">{winnerLabel}</span></div>
        )}
        {draw && <div className="text-sm text-lc-muted mb-4">No hubo ganador.</div>}
        <button
          onClick={handleClose}
          className="lc-pill-primary text-sm w-full"
          data-testid="game-over-close"
          autoFocus
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
