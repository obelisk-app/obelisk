'use client';

import Text from '@/components/ui/layout/Text';

import Button from '@/components/ui/buttons/Button';
import { memo } from 'react';
import { gameIcon, gameName } from '@/lib/games/core/catalog';
import { useGameCard } from '@/hooks/games/card/useGameCard';
import WinnerLabel from './WinnerLabel';
import Skeleton from '@/components/ui/animations/Skeleton';

/**
 * In-channel card for a table, rendered from the `[[game:<id>]]` marker the
 * host posts as an ordinary chat message. The card is a pointer, not a copy:
 * status comes from replaying the table's own event log, so a message from an
 * hour ago shows the match as it stands now. How it gets that log is
 * `useGameCard`'s business.
 */
function GameCard({ gameId }: { gameId: string }) {
  const { session, status, actionLabel, dots, open } = useGameCard(gameId);

  if (!session) {
    return (
      <span className="mt-1 block max-w-sm rounded-lg border border-lc-border bg-lc-dark p-3" data-testid="game-card-loading">
        <Skeleton as="span" className="block h-4 w-32 rounded" />
      </span>
    );
  }

  return (
    <Button
      variant="bare"
      type="button"
      onClick={open}
      className="mt-1 flex w-full max-w-sm items-center gap-3 rounded-lg border border-lc-border bg-lc-dark p-3 text-left transition-colors hover:border-lc-green/60"
      data-testid="game-card"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lc-green/15 text-base">
        {gameIcon(session.game)}
      </span>
      <span className="min-w-0 flex-1">
        <Text size="xs" weight="semibold" tone="default" truncate="truncate" className="block" data-testid="game-card-name">
          {gameName(session.game)}
        </Text>
        <span className="block text-[11px] text-lc-muted">
          {status.winner === null ? status.text : <WinnerLabel session={session} winner={status.winner} />}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {dots.map((dot) => (
          <span key={dot.pubkey} className="h-2 w-2 rounded-full" style={{ background: dot.hex }} />
        ))}
      </span>
      <span className="shrink-0 rounded-full border border-lc-border px-2 py-0.5 text-[10px] text-lc-white">
        {actionLabel}
      </span>
    </Button>
  );
}

// A card re-renders for its own table and nothing else. MessageContent re-renders
// on plenty a card does not care about.
export default memo(GameCard);
