'use client';

import UserAvatar from '@/components/ui/media/UserAvatar';
import type { GameSession } from '@/lib/games/session/session';
import { useGameOverOverlay } from '@/hooks/games/results/useGameOverOverlay';
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
  const { view, dismiss, dismissFromButton } = useGameOverOverlay(session, myPubkey, onClose);
  if (!view) return null;
  const { winner, draw, iWon, myScore } = view;

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
        style={{ color: view.color }}
        data-testid="game-over-headline"
      >
        {t(view.headlineKey)}
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
        onClick={dismissFromButton}
        className="mt-6"
        data-testid="game-over-close"
        autoFocus
      >
        {t('common.close')}
      </Button>
    </div>
  );
}
