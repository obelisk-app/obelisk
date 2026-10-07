'use client';

import { useState } from 'react';
import UserAvatar from '@/components/ui/media/UserAvatar';
import type { GameSession } from '@/lib/games/session/session';
import { isDraw, scoreFor } from '@/lib/games/core/standings';
import { SEAT_COLORS } from '../chain-reaction/ChainReactionBoard';
import { scoreLabel } from '@/utils/games/copy/game-copy';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';

/**
 * The result splash. Covers the table the moment the log says the game is
 * over, at a size you can read from across the room: a match that ended
 * should not be something you have to squint at a status line to notice.
 *
 * Dismissed by the user, never on a timer: the board underneath is the final
 * position, and people want a second to look at it.
 */
export default function GameOverOverlay({
  session,
  myPubkey,
  nameOf,
  pictureOf,
  onClose,
}: {
  session: GameSession;
  myPubkey: string | null;
  nameOf: (pubkey: string) => string;
  pictureOf: (pubkey: string) => string | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  // Dismissal is keyed to the result it dismissed, so a later match on the
  // same table re-arms the splash on its own, with no effect and no reset.
  const [dismissedResult, setDismissedResult] = useState<string | null>(null);
  const resultKey = `${session.id}:${session.finishedAt ?? ''}`;

  if (session.status !== 'finished' || dismissedResult === resultKey) return null;

  const winner = session.winner;
  // Seats, not pubkeys: one account can hold several, and on a solo table the
  // seat id is not the pubkey once extra seats exist.
  const mySeats = session.seats.filter((s) => s.by === myPubkey).map((s) => s.id);
  const iWon = !!winner && (winner === myPubkey || mySeats.includes(winner));
  const iPlayed = mySeats.length > 0 || (!!myPubkey && session.participants.includes(myPubkey));
  const iLost = iPlayed && !iWon;
  const draw = isDraw(session);
  const myScore = scoreFor(session, mySeats[0] ?? (iPlayed ? myPubkey : null));

  const winnerSeat = winner ? session.participants.indexOf(winner) : -1;
  const accent = winnerSeat >= 0 ? SEAT_COLORS[winnerSeat]?.hex ?? '#b4f953' : '#a3a3a3';

  const headline = t(draw ? 'games.overlay.draw' : iWon ? 'games.overlay.youWon' : iLost ? 'games.overlay.youLost' : 'games.overlay.over');

  const dismiss = () => {
    setDismissedResult(resultKey);
    onClose();
  };

  return (
    <div
      className="cr-win absolute inset-0 z-40 flex flex-col items-center justify-center rounded-xl bg-black/80 px-6 text-center backdrop-blur-sm"
      onClick={dismiss}
      data-testid="game-over-overlay"
    >
      {!draw && (
        <span className="cr-win-trophy text-5xl" aria-hidden>
          🏆
        </span>
      )}

      <h2
        className="cr-win-title mt-2 text-4xl font-black leading-none tracking-tight sm:text-5xl"
        style={{ color: iLost ? '#f87171' : accent }}
        data-testid="game-over-headline"
      >
        {headline}
      </h2>

      {!draw && winner && !iWon && (
        <div className="mt-4 flex items-center gap-2">
          <UserAvatar pubkey={winner} picture={pictureOf(winner)} size={8} name={nameOf(winner)} />
          <span className="text-sm text-lc-white" data-testid="game-over-winner">
            {t('games.overlay.tookBoard', { name: nameOf(winner) })}
          </span>
        </div>
      )}

      {!draw && iWon && (
        <p className="mt-3 text-sm text-lc-muted">{t('games.boardYours')}</p>
      )}

      {draw && <p className="mt-3 text-sm text-lc-muted">{t('games.boardNobody')}</p>}

      {/* What you finished with: the thing you actually want to see. */}
      {myScore && (
        <p className="mt-2 font-mono text-sm text-lc-white" data-testid="game-over-score">
          {scoreLabel(t, myScore)}
        </p>
      )}

      <Button
        variant="pill"
        size="xs"
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        className="mt-6"
        data-testid="game-over-close"
        autoFocus
      >
        {t('common.close')}
      </Button>
    </div>
  );
}
