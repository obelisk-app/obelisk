'use client';

import List from '@/components/ui/layout/List';

import UserAvatar from '@/components/ui/media/UserAvatar';
import type { GameSession } from '@/lib/games/session/session';
import { SEAT_COLORS } from '@/constants/games/chain-reaction';
import { useTranslations } from 'next-intl';

/** Who is at a table that has not started: colour, avatar, name, you, host. */
export default function GameRoster({
  session,
  myPubkey,
  nameOf,
  pictureOf,
}: {
  session: GameSession;
  myPubkey: string | null;
  nameOf: (pubkey: string) => string;
  pictureOf: (pubkey: string) => string | null;
}) {
  const t = useTranslations();
  const roster = session.status === 'waiting' ? session.joined : session.participants;
  return (
    <List marker="none" data-testid="game-roster">
      {roster.map((pk, i) => (
        <li key={pk} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEAT_COLORS[i]?.hex }} />
          <UserAvatar pubkey={pk} picture={pictureOf(pk)} size={6} name={nameOf(pk)} />
          <span className="text-xs text-lc-white">{nameOf(pk)}</span>
          {pk === myPubkey && (
            <span className="text-[10px] text-lc-muted">{t('games.you')}</span>
          )}
          {pk === session.createdBy && (
            <span className="rounded-full border border-lc-border px-1.5 text-[10px] text-lc-muted">{t('games.host')}</span>
          )}
        </li>
      ))}
    </List>
  );
}
