'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useMyPubkey } from '@/services/nostr-bridge';
import { useGamesStore } from '@/store/games';
import { useGameSession } from '@/hooks/games/channel/useChannelGames';
import { seedGameFromCache } from '@/services/games/cache';
import { requestGameLoad } from '@/services/games/resolve';
import { cardSeatDots } from '@/utils/games/card/card-labels';

/**
 * How long a card without a session waits before asking the relay for its own
 * table. Long enough that a card the channel backfill is about to resolve
 * anyway doesn't cost a REQ; short enough that nobody reads it as a delay.
 */
export const RESOLVE_GRACE_MS = 400;

/**
 * The in-channel card's view model: the table's replayed session, who is
 * looking, the seat dots, and `open`.
 *
 * Three things get the card something to replay, in order of how fast they
 * are: the localStorage seed (before the first paint), the channel
 * subscription, and (for a table the channel sub cannot reach, which is any
 * table older than its 24-hour window) a direct lookup by id.
 */
export function useGameCard(gameId: string) {
  const session = useGameSession(gameId);
  const myPubkey = useMyPubkey();
  const setOpenGame = useGamesStore((s) => s.setOpenGame);

  // A layout effect, so the synchronous re-render it triggers lands before the
  // browser paints: the skeleton is committed but never seen.
  useLayoutEffect(() => {
    if (!session) seedGameFromCache(gameId);
    // Only on mount / id change: re-seeding a table the relay has since
    // extended would be pointless work and the seed no-ops anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (session) return;
    const t = setTimeout(() => requestGameLoad(gameId), RESOLVE_GRACE_MS);
    return () => clearTimeout(t);
  }, [gameId, session]);

  return {
    session,
    myPubkey,
    dots: session ? cardSeatDots(session) : [],
    open: () => setOpenGame(gameId),
  };
}
