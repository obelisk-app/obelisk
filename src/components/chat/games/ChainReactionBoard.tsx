'use client';

import { useState } from 'react';
import type { GameSession } from '@/lib/games/session';
import type { CRState } from '@/lib/games/chain-reaction';
import { useTranslation } from '@/i18n/context';
import { SEAT_COLORS } from './chain-reaction/seat-colors';
import type { CSSVars } from './chain-reaction/css-vars';
import type { CellSnapshot } from './chain-reaction/cascade';
import { useCascadeReveal } from './chain-reaction/useCascadeReveal';
import Orbs from './chain-reaction/Orbs';
import Explosion from './chain-reaction/Explosion';

export { SEAT_COLORS } from './chain-reaction/seat-colors';

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

/** Cell size for an inline board: the size this game has always been. */
const CELL_DEFAULT_MAX = 44;
/** Ceiling when the board is given a height to fill. Past this it reads as a toy. */
const CELL_FULLSCREEN_MAX = 92;
/** Orb diameter as a share of the cell, so the pieces grow with the board. */
const ORB_RATIO = 0.23;

export default function ChainReactionBoard({ game, mySeats, onAction, maxWidth = 320, maxHeight, seatLabel, onRevealChange }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const state = (game.state ?? {}) as Partial<CRState>;
  const rows: number = state.rows ?? 9;
  const cols: number = state.cols ?? 6;
  const cells: CellSnapshot[] = state.cells ?? Array.from({ length: rows * cols }, () => ({ count: 0, owner: null }));
  const seats: Record<string, number> = state.seats ?? {};
  const order: string[] = state.order ?? [];
  const eliminated: string[] = state.eliminated ?? [];
  // Fit the board to whatever room it was given, in both directions. Without
  // a height the cell keeps the inline size this game has always used.
  const cellCap = maxHeight ? CELL_FULLSCREEN_MAX : CELL_DEFAULT_MAX;
  const cellPx = Math.max(
    16,
    Math.floor(Math.min(maxWidth / cols, maxHeight ? maxHeight / rows : cellCap, cellCap)),
  );
  const boardWidth = cellPx * cols;
  const orb = Math.round(Math.max(8, Math.min(cellPx * ORB_RATIO, 24)));

  // The seat being played right now: the one on move if we hold it, otherwise
  // our only seat (so a spectator-ish view still colours the right player).
  const actingSeatId = game.currentTurn && mySeats.includes(game.currentTurn)
    ? game.currentTurn
    : mySeats.length === 1 ? mySeats[0] : null;
  const mySeat = actingSeatId !== null ? seats[actingSeatId] ?? null : null;
  const myTurn = game.status === 'in_progress'
    && !!game.currentTurn
    && mySeats.includes(game.currentTurn);
  const myColor = mySeat !== null && mySeat >= 0 ? SEAT_COLORS[mySeat] : null;

  // The grid inherits the active player's color so the matrix visibly
  // changes hue every turn. Falls back to neutral when waiting/finished.
  const turnSeat = game.currentTurn ? seats[game.currentTurn] : undefined;
  const turnHex = typeof turnSeat === 'number' ? SEAT_COLORS[turnSeat]?.hex : undefined;
  const matrixHex = turnHex ?? '#3f3f46';

  const { displayCells, animating, explosions, noteOwnClick } = useCascadeReveal({
    cells,
    seats,
    currentTurn: game.currentTurn,
    rows,
    cols,
    mySeats,
    onRevealChange,
  });

  const click = async (i: number) => {
    if (busy || animating || !myTurn || mySeat === null || !actingSeatId) return;
    const cell = cells[i];
    if (cell.owner !== null && cell.owner !== mySeat) return;
    noteOwnClick(i);
    setBusy(true);
    try {
      await onAction({ cell: i }, actingSeatId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="cr-matrix grid mx-auto rounded-md"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          width: `${boardWidth}px`,
          '--cr-turn': matrixHex,
          '--cr-orb': `${orb}px`,
        } as CSSVars}
      >
        {displayCells.map((cell, i) => {
          const owner = cell.owner;
          const color = owner !== null ? SEAT_COLORS[owner] : null;
          const burst = explosions[i];
          const canClick = myTurn && !busy && !animating && (owner === null || owner === mySeat);
          return (
            <button
              key={i}
              type="button"
              onClick={() => click(i)}
              disabled={!canClick}
              className={`
                cr-cell relative aspect-square
                ${canClick ? 'cursor-pointer' : 'cursor-not-allowed'}
                transition-colors
              `}
              style={color ? { color: color.hex } : undefined}
              aria-label={`cell ${i}`}
            >
              {color && <Orbs count={cell.count} hex={color.hex} orbit={cell.count >= 2} orb={orb} />}
              {burst && <Explosion key={burst.id} hex={burst.hex} />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 justify-center text-[10px]">
        {order.map((pk, seat) => {
          const c = SEAT_COLORS[seat];
          const isMe = mySeats.includes(pk);
          const out = eliminated.includes(pk);
          const turn = game.currentTurn === pk;
          return (
            <span
              key={pk}
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full border
                ${turn ? 'border-lc-white' : 'border-lc-border'}
                ${out ? 'opacity-40 line-through' : ''}
              `}
            >
              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
              <span className={isMe ? 'text-lc-white' : 'text-lc-muted'}>
                {seatLabel ? seatLabel(pk) : pk.slice(0, 6)}
                {isMe && <span className="ml-1 opacity-70">(you)</span>}
              </span>
            </span>
          );
        })}
      </div>
      {myColor && (
        <div className="text-center text-[11px] text-lc-muted">
          {t('games.youPlayAs')} <span className="font-semibold" style={{ color: myColor.hex }}>●</span>
        </div>
      )}
    </div>
  );
}
