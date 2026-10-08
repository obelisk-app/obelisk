'use client';

import Button from '@/components/ui/buttons/Button';
import type { GameSession } from '@/lib/games/session/session';
import { useTranslations } from 'next-intl';
import type { CSSVars } from '@/utils/games/chain-reaction/css-vars';
import { useChainReactionBoard } from '@/hooks/games/chain-reaction/useChainReactionBoard';
import Orbs from './Orbs';
import Explosion from './Explosion';

interface Props {
  game: GameSession;
  /**
   * Seats this client may play. Usually one; several when the table is being
   * played at this keyboard, in which case the board follows whichever of
   * them is on move.
   */
  mySeats: string[];
  onAction: (action: { cell: number }, seat: string) => Promise<void>;
  /** Cap on the rendered board width: the modal gives it more room than a card. */
  maxWidth?: number;
  /**
   * Cap on the rendered board height. Only fullscreen passes it, and passing
   * it is what lets a cell grow past `CELL_DEFAULT_MAX`: without a height to
   * fit into, a bigger cell would just push the bottom of the board off the
   * screen. A 6×9 board at the old fixed cap came out 264px wide in the middle
   * of a 1440px window, which is what "fullscreen" used to mean here.
   */
  maxHeight?: number;
  /** Names seats for the legend; two local players must read as two people. */
  seatLabel?: (seatId: string) => string;
  /**
   * Fired while the board is playing back a cascade.
   *
   * The table above uses it to hold the result splash: the winning move is the
   * biggest chain in the game, and the splash used to cover it the instant the
   * log said the match was over, so the one explosion worth watching was the
   * one nobody ever saw.
   */
  onRevealChange?: (animating: boolean) => void;
}

export default function ChainReactionBoard({ maxWidth = 320, ...props }: Props) {
  const t = useTranslations();
  const vm = useChainReactionBoard({ maxWidth, ...props });

  return (
    <div className="space-y-2">
      <div
        className="cr-matrix grid mx-auto rounded-md"
        style={{
          gridTemplateColumns: `repeat(${vm.cols}, minmax(0, 1fr))`,
          width: `${vm.boardWidth}px`,
          '--cr-turn': vm.matrixHex,
          '--cr-orb': `${vm.orb}px`,
        } as CSSVars}
      >
        {vm.cells.map((cell, i) => (
          <Button
            variant="bare"
            key={i}
            type="button"
            onClick={() => vm.click(i)}
            disabled={!cell.canClick}
            className={`
                cr-cell relative aspect-square
                ${cell.canClick ? 'cursor-pointer' : 'cursor-not-allowed'}
                transition-colors
              `}
            style={cell.hex ? { color: cell.hex } : undefined}
            aria-label={t('games.chainReaction.cell', { index: i })}
          >
            {cell.hex && <Orbs count={cell.count} hex={cell.hex} orbit={cell.count >= 2} orb={vm.orb} />}
            {cell.burst && <Explosion key={cell.burst.id} hex={cell.burst.hex} />}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 justify-center text-[10px]">
        {vm.legend.map((entry) => (
          <span
            key={entry.pubkey}
            className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full border
                ${entry.turn ? 'border-lc-white' : 'border-lc-border'}
                ${entry.out ? 'opacity-40 line-through' : ''}
              `}
          >
            <span className={`w-2 h-2 rounded-full ${entry.dot}`} />
            <span className={entry.isMe ? 'text-lc-white' : 'text-lc-muted'}>
              {entry.label}
              {entry.isMe && <span className="ml-1 opacity-70">{t('games.you')}</span>}
            </span>
          </span>
        ))}
      </div>
      {vm.myColor && (
        <div className="text-center text-[11px] text-lc-muted">
          {t('games.youPlayAs')} <span className="font-semibold" style={{ color: vm.myColor.hex }}>●</span>
        </div>
      )}
    </div>
  );
}
