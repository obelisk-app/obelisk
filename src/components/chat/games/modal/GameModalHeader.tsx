'use client';

import type { GameSession } from '@/lib/games/session';
import { gameIcon, gameName } from '@/lib/games/catalog';
import Button from '@/components/ui/Button';
import CloseButton from '@/components/ui/CloseButton';
import { MaximizeIcon, MinimizeIcon } from '@/components/ui/icons';

/** Title, the one-line status (waiting, whose turn, result) and the fullscreen and close buttons. */
export default function GameModalHeader({
  session,
  mySeats,
  secondsLeft,
  nameOf,
  seatLabelFor,
  fullscreen,
  onToggleFullscreen,
  onClose,
}: {
  session: GameSession;
  mySeats: string[];
  secondsLeft: number | null;
  nameOf: (pubkey: string) => string;
  seatLabelFor: (seatId: string) => string;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-lc-white" data-testid="game-modal-title">
          {gameIcon(session.game)} {gameName(session.game)}
        </h2>
        <p className="text-[11px] text-lc-muted">
          {session.status === 'waiting' && `Waiting for players · ${session.joined.length}/${session.maxPlayers}`}
          {session.status === 'in_progress' && (
            session.match
              ? `${session.match.alive.length} still standing`
              : session.currentTurn && mySeats.includes(session.currentTurn)
                ? 'Your turn'
                : `${seatLabelFor(session.currentTurn ?? '')}'s turn`
          )}
          {session.status === 'finished' && (
            session.draw ? 'Draw' : session.winner ? `${nameOf(session.winner)} won` : 'Game over'
          )}
          {session.status === 'cancelled' && 'Table cancelled'}
          {session.status === 'in_progress' && secondsLeft !== null && ` · ${secondsLeft}s`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          data-testid="game-fullscreen"
        >
          {fullscreen ? <MinimizeIcon size={16} /> : <MaximizeIcon size={16} />}
        </Button>
        <CloseButton onClick={onClose} />
      </div>
    </div>
  );
}
