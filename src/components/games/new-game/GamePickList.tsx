'use client';

import Button from '@/components/ui/buttons/Button';
import { gameCatalog, type GameInfo } from '@/lib/games/core/catalog';
import { gameDescription, gameSummary } from '@/utils/games/copy/game-copy';
import { useTranslations } from 'next-intl';
import { GameTypePreview } from './GamePreviews';

/** Step one: every playable game with a thumbnail, its description and its player count. */
export default function GamePickList({ onChoose }: {
  onChoose: (info: GameInfo) => void;
}) {
  const t = useTranslations();
  const catalog = gameCatalog();
  return (
    <div className="space-y-2" data-testid="game-list">
      {catalog.map((info) => (
        <Button
          variant="bare"
          key={info.type}
          type="button"
          onClick={() => onChoose(info)}
          className="flex w-full items-start gap-3 rounded-lg border border-lc-border p-3 text-left transition-colors hover:border-lc-green/60 hover:bg-lc-border/30"
          data-testid={`pick-${info.type}`}
        >
          <GameTypePreview type={info.type} size={56} icon={info.icon} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-lc-white">
              {info.icon} {info.displayName}
            </span>
            <span className="mt-0.5 block text-xs text-lc-muted">{gameDescription(t, info.type)}</span>
            <span className="mt-1 block text-[11px] text-lc-muted">{gameSummary(t, info)}</span>
          </span>
        </Button>
      ))}
    </div>
  );
}
