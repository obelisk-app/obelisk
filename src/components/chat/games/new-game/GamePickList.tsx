'use client';

import { gameCatalog, type GameInfo } from '@/lib/games/catalog';
import { gameDescription, gameSummary } from '@/utils/chat/games/game-copy';
import { useTranslations } from 'next-intl';
import { GameTypePreview } from '../GamePreviews';
import Button from '@/components/ui/Button';

/** Step one: every playable game with a thumbnail, its description and its player count. */
export default function GamePickList({ onChoose, onClose }: {
  onChoose: (info: GameInfo) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const catalog = gameCatalog();
  return (
    <>
      <h2 className="text-sm font-semibold text-lc-white">{t('games.pick')}</h2>
      <div className="mt-3 space-y-2" data-testid="game-list">
        {catalog.map((info) => (
          <button
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
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="pillSecondary" size="xs" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </>
  );
}
