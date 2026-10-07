'use client';

import { useTranslations } from 'next-intl';
import type { SeatProgress } from '@/lib/games/stacker/match';
import MiniBoard from './MiniBoard';

/**
 * One opponent under the table: their well as last published, their name,
 * what they have sent and cleared, and whether their checkpoints held up
 * when replayed from their own inputs.
 */
export default function StackerOpponent({ seat, progress: p, name, cell }: {
  seat: string;
  progress: SeatProgress;
  name: string;
  cell: number;
}) {
  const t = useTranslations();
  return (
    <div className="text-center" data-testid={`stacker-opponent-${seat}`}>
      <MiniBoard board={p.board} height={p.stackHeight} dead={!p.alive} cell={cell} />
      <div className="mt-1 max-w-[72px] truncate text-[10px] text-lc-white">{name}</div>
      <div className="text-[10px] text-lc-muted">{p.attacksSent}⚔ · {p.linesCleared}▤</div>
      {p.verified === false && (
        <div
          className="text-[9px] text-red-400"
          title={p.suspect ? t(p.suspect.claim === 'attacks' ? 'games.stacker.mismatchAttacks' : 'games.stacker.mismatchLines', {
            claimed: p.suspect.claimed,
            produced: p.suspect.produced,
          }) : undefined}
          data-testid={`stacker-suspect-${seat}`}
        >
          {t('games.stacker.unverified')}
        </div>
      )}
      {p.verified === true && (
        <div className="text-[9px] text-lc-green" data-testid={`stacker-verified-${seat}`}>{t('games.stacker.checked')}</div>
      )}
    </div>
  );
}
