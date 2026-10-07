'use client';

import { useTranslations } from 'next-intl';
import type { GameSession } from '@/lib/games/session/session';
import { cardStatus } from '@/utils/games/card/card-labels';
import WinnerLabel from './WinnerLabel';

/** The card's status line, naming the winner once somebody else took the board. */
export default function StatusLabel({ session, myPubkey }: { session: GameSession; myPubkey: string | null }) {
  const t = useTranslations();
  const status = cardStatus(t, session, myPubkey);
  return status.winner === null ? <>{status.text}</> : <WinnerLabel session={session} winner={status.winner} />;
}
