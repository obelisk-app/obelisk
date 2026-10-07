'use client';

import type { GameSession } from '@/lib/games/session';
import { useTranslations } from 'next-intl';

/** The one-line status under the table's title: waiting, whose turn, the result, the turn clock. */
export default function GameModalStatus({
  session,
  mySeats,
  secondsLeft,
  nameOf,
  seatLabelFor,
}: {
  session: GameSession;
  mySeats: string[];
  secondsLeft: number | null;
  nameOf: (pubkey: string) => string;
  seatLabelFor: (seatId: string) => string;
}) {
  const t = useTranslations();
  return (
    <>
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
    </>
  );
}
