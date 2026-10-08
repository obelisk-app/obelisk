'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useMyPubkey } from '@/hooks/session/useSession';
import { useGamesStore } from '@/store/games';
import { useGameSession } from '@/hooks/games/channel/useChannelGames';
import { seedGameFromCache } from '@/services/games/cache';
import { requestGameLoad } from '@/services/games/resolve';
import { cardActionLabel, cardSeatDots, cardStatus } from '@/utils/games/card/card-labels';
import { RESOLVE_GRACE_MS } from '@/constants/games/card';

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
  const t = useTranslations();
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
    actionLabel: session ? cardActionLabel(t, session, myPubkey) : '',
    status: session ? cardStatus(t, session, myPubkey) : { text: '', winner: null },
    open: () => setOpenGame(gameId),
  };
}
