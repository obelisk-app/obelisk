'use client';

import type { GameSession } from '@/lib/games/session/session';
import { useWinnerLabel } from '@/hooks/games/card/useWinnerLabel';

/**
 * The winner's display name, in its own component so the member-metadata
 * subscription behind it only mounts for a table that actually has a winner.
 *
 * Calling `useGroupMemberInfo` from the card itself meant every card in the
 * channel warmed a profile fetch for every member, and re-rendered on every
 * kind 0 that arrived, to resolve a string that most of them never showed.
 */
export default function WinnerLabel({ session, winner }: { session: GameSession; winner: string }) {
  const label = useWinnerLabel(session, winner);
  return <>{label}</>;
}
