'use client';

import type { GameSession } from '@/lib/games/session';
import { gameIcon, gameName } from '@/lib/games/catalog';
import Button from '@/components/ui/Button';
import CloseButton from '@/components/ui/CloseButton';
import { MaximizeIcon, MinimizeIcon } from '@/components/ui/icons';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations();
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-lc-white" data-testid="game-modal-title">
          {gameIcon(session.game)} {gameName(session.game)}
        </h2>
        <p className="text-[11px] text-lc-muted">
          {session.status === 'waiting'
            && t('games.header.waiting', { joined: session.joined.length, max: session.maxPlayers })}
          {session.status === 'in_progress' && (
            session.match
              ? t('games.header.standing', { count: session.match.alive.length })
              : session.currentTurn && mySeats.includes(session.currentTurn)
                ? t('games.header.yourTurn')
                : t('games.header.seatTurn', { name: seatLabelFor(session.currentTurn ?? '') })
          )}
          {session.status === 'finished' && (
            session.draw
              ? t('games.header.draw')
              : session.winner ? t('games.header.won', { name: nameOf(session.winner) }) : t('games.header.over')
          )}
          {session.status === 'cancelled' && t('games.header.cancelled')}
          {session.status === 'in_progress' && secondsLeft !== null
            && ` · ${t('games.header.secondsLeft', { seconds: secondsLeft })}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleFullscreen}
          aria-label={t(fullscreen ? 'games.header.exitFullscreen' : 'games.header.fullscreen')}
          data-testid="game-fullscreen"
        >
          {fullscreen ? <MinimizeIcon size={16} /> : <MaximizeIcon size={16} />}
        </Button>
        <CloseButton onClick={onClose} />
      </div>
    </div>
  );
}
