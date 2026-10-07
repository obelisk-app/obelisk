'use client';

import { useGamesStore } from '@/store/games';
import GameTableModal from './GameTableModal';

/**
 * Mounts the table for whatever game the store says is open.
 *
 * This is the module `lazy-mounts.tsx` fetches on demand (as `GameModalHost`),
 * so the table, its boards and its renderers stay out of the shell's first
 * download until somebody opens a game.
 */
export function GameModalHost() {
  const openGameId = useGamesStore((s) => s.openGameId);
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  if (!openGameId) return null;
  return <GameTableModal gameId={openGameId} onClose={() => setOpenGame(null)} />;
}
