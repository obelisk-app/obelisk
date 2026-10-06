'use client';

import type { GameSession } from '@/lib/games/session';
import { canJoin, canStart } from '@/lib/games/session';
import { publishCancel, publishJoin, publishResign } from '@/services/games/transport';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';

/** Join, start, cancel, resign: whichever this viewer may do at this table right now. */
export default function GameActionsBar({
  session,
  myPubkey,
  mySeats,
  busy,
  run,
  onOpenSeatPicker,
}: {
  session: GameSession;
  myPubkey: string | null;
  mySeats: string[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onOpenSeatPicker: () => void;
}) {
  const t = useTranslations();
  // Resigning names a seat, because one account can hold several: the seat on
  // move if it is ours, else our only one.
  const resignSeat = session.currentTurn && mySeats.includes(session.currentTurn)
    ? session.currentTurn
    : mySeats.length === 1 ? mySeats[0] : null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {canJoin(session, myPubkey) && (
        <Button
          variant="pill"
          size="xs"
          disabled={busy}
          onClick={() => run(() => publishJoin(session.channelId, session.id))}
          data-testid="game-join"
        >
          {t('games.join')}
        </Button>
      )}
      {canStart(session, myPubkey) && (
        <Button
          variant="pill"
          size="xs"
          disabled={busy}
          onClick={onOpenSeatPicker}
          data-testid="game-start"
        >
          {t('games.actions.start', { count: session.joined.length })}
        </Button>
      )}
      {session.status === 'waiting' && myPubkey === session.createdBy && (
        <Button
          variant="pillSecondary"
          size="xs"
          disabled={busy}
          onClick={() => run(() => publishCancel(session.channelId, session.id))}
        >
          {t('games.cancelTable')}
        </Button>
      )}
      {session.status === 'in_progress' && resignSeat && !session.eliminated.includes(resignSeat) && (
        <Button
          variant="pillSecondary"
          size="xs"
          disabled={busy}
          onClick={() => run(() => publishResign(session.channelId, session.id, resignSeat))}
          data-testid="game-resign"
        >
          {t('games.resign')}
        </Button>
      )}
      {session.status === 'waiting' && session.joined.length < session.minPlayers && (
        <span className="text-[11px] text-lc-muted">
          {t('games.actions.needsPlayers', { count: session.minPlayers })}
        </span>
      )}
    </div>
  );
}
