'use client';

import { useEffect, useLayoutEffect } from 'react';
import type { GameSession } from '@/lib/games/session';
import { seedGameFromCache } from '@/services/games/cache';
import { requestGameLoad } from '@/services/games/resolve';

/**
 * Same two fallbacks the card has, minus the grace period: the user is
 * looking at this table, so the bytes are justified immediately. The cache
 * seeds before paint; the relay load runs while there is still no session.
 */
export function useGameLoad(gameId: string, session: GameSession | null | undefined): void {
  useLayoutEffect(() => {
    if (!session) seedGameFromCache(gameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!session) requestGameLoad(gameId);
  }, [gameId, session]);
}
