'use client';

import { useTranslations } from 'next-intl';
import { useGroupMemberInfo } from '@/services/nostr-bridge';
import type { GameSession } from '@/lib/games/session/session';
import { winnerName } from '@/utils/games/card/card-labels';

/**
 * "🏆 <name> won", with the name read from the channel's member list.
 *
 * `useGroupMemberInfo` subscribes to the whole user-metadata map and warms a
 * profile fetch for every member of the channel, so only the winner label
 * calls this: a card with no winner to name must not pay for it.
 */
export function useWinnerLabel(session: GameSession, winner: string): string {
  const t = useTranslations();
  const members = useGroupMemberInfo(session.channelId);
  return t('games.card.won', { name: winnerName(session, winner, members) });
}
