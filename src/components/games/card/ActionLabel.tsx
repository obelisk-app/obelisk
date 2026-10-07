'use client';

import { useTranslations } from 'next-intl';
import type { GameSession } from '@/lib/games/session/session';
import { cardActionLabel } from '@/utils/games/card/card-labels';

/** The card's pill: join, open, or read the result. */
export default function ActionLabel({ session, myPubkey }: { session: GameSession; myPubkey: string | null }) {
  const t = useTranslations();
  return <>{cardActionLabel(t, session, myPubkey)}</>;
}
