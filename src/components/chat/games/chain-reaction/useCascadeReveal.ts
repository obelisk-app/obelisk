'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SEAT_COLORS } from './seat-colors';
import { boardChanged, cascadeFrames, findClickedCell, type CellSnapshot } from './cascade';

// Fast enough to feel like a reaction rather than a wait. The original
// timings (520/420) meant a long chain locked the board for several seconds,
// which reads as the game lagging rather than as an animation.
export const EXPLOSION_MS = 260;
export const STEP_MS = 150; // delay between BFS rounds: still readable, far snappier

export type Burst = { hex: string; id: number };

/**
 * Plays back the cascade behind each new board.
 *
 * A move event carries only the clicked cell; the reducer hands us the
 * settled post-cascade board. To actually SEE the cascade we re-simulate it
 * locally from the previous board: apply the move, then play each round of
 * explosions with a delay between rounds.
 *
 * `noteOwnClick` records this client's click so its own move does not have
 * to be reconstructed.
 */
export function useCascadeReveal({
  cells,
  seats,
  currentTurn,
  rows,
  cols,
  mySeats,
  onRevealChange,
}: {
  cells: CellSnapshot[];
  seats: Record<string, number>;
  currentTurn: string | null | undefined;
  rows: number;
  cols: number;
  mySeats: string[];
  onRevealChange?: (animating: boolean) => void;
}) {
  const prevCellsRef = useRef<CellSnapshot[]>(cells);
  const prevSeatsRef = useRef<Record<string, number>>(seats);
  const prevTurnRef = useRef<string | null>(currentTurn ?? null);
  const myClickRef = useRef<number | null>(null);
  // Cells and "is a cascade still playing" move together: they are set from
  // the same effect, so one state holds both and the effect only writes once.
  // `animating` blocks clicks (including the next player's move) until the
  // reveal finishes; otherwise the board would still be visibly rearranging
  // itself under them.
  const [reveal, setReveal] = useState<{ cells: CellSnapshot[]; animating: boolean }>(
    { cells, animating: false },
  );
  const animating = reveal.animating;
  // A layout effect, not a plain one: the parent hides the result splash on
  // this signal, and doing it after paint would flash the splash over the
  // first frame of the cascade.
  useLayoutEffect(() => {
    onRevealChange?.(animating);
  }, [animating, onRevealChange]);
  const [explosions, setExplosions] = useState<Record<number, Burst>>({});

  useEffect(() => {
    const prev = prevCellsRef.current;
    const prevSeats = prevSeatsRef.current;
    const mover = prevTurnRef.current;

    // Nothing to do on first mount / board resize / when there's no mover.
    const syncRefs = () => {
      prevCellsRef.current = cells;
      prevSeatsRef.current = seats;
      prevTurnRef.current = currentTurn ?? null;
    };

    if (!mover || !(mover in prevSeats) || prev.length !== cells.length) {
      syncRefs();
      setReveal({ cells, animating: false });
      return;
    }

    if (!boardChanged(prev, cells)) {
      syncRefs();
      return;
    }

    const actorSeat = prevSeats[mover];

    // Find the clicked cell. For the local player we captured it at click
    // time; for remote players we brute-force each legal cell and pick the
    // one whose full simulation produces the observed final state.
    const findClick = (): number => {
      const ownClick = myClickRef.current;
      if (ownClick !== null && mySeats.includes(mover)) {
        myClickRef.current = null;
        return ownClick;
      }
      return findClickedCell(prev, cells, rows, cols, actorSeat);
    };
    const clickCell = findClick();

    if (clickCell < 0) {
      // Couldn't reconstruct (e.g. dominance early-exit, timeout): fall back
      // to instant reveal.
      syncRefs();
      setReveal({ cells, animating: false });
      return;
    }

    const frames = cascadeFrames(prev, rows, cols, actorSeat, clickCell);

    // If the click itself made a cell critical, the first explosion should
    // fire simultaneously with the click (no "placed but not yet exploded"
    // pause). When there's no cascade, show frame 0 as-is.
    const hasCascade = frames.length > 1;
    setReveal({ cells: hasCascade ? frames[1].cells : frames[0].cells, animating: hasCascade });
    const timers: ReturnType<typeof setTimeout>[] = [];

    const fireBursts = (frame: { exploded: number[] }, prevFrame: { cells: CellSnapshot[] }, idx: number) => {
      if (!frame.exploded.length) return;
      const bursts: Record<number, Burst> = {};
      const now = Date.now();
      for (const i of frame.exploded) {
        const prevOwner = prevFrame.cells[i].owner;
        const hex = prevOwner !== null ? SEAT_COLORS[prevOwner]?.hex ?? '#ffffff' : '#ffffff';
        bursts[i] = { hex, id: now + i + idx * 10000 };
      }
      const keys = Object.keys(bursts);
      setExplosions((cur) => ({ ...cur, ...bursts }));
      const cleanup = setTimeout(() => {
        setExplosions((cur) => {
          const nx = { ...cur };
          for (const k of keys) delete nx[+k];
          return nx;
        });
      }, EXPLOSION_MS + 40);
      timers.push(cleanup);
    };

    if (hasCascade) fireBursts(frames[1], frames[0], 1);

    for (let idx = 2; idx < frames.length; idx++) {
      const frame = frames[idx];
      const prevFrame = frames[idx - 1];
      const delay = (idx - 1) * STEP_MS;
      const t = setTimeout(() => {
        setReveal({ cells: frame.cells, animating: true });
        fireBursts(frame, prevFrame, idx);
      }, delay);
      timers.push(t);
    }

    const settleAt = Math.max(1, frames.length - 2) * STEP_MS + EXPLOSION_MS;
    const finalT = setTimeout(() => {
      setReveal({ cells, animating: false });
      syncRefs();
    }, settleAt);
    timers.push(finalT);

    return () => {
      for (const t of timers) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, rows, cols]);

  const noteOwnClick = (cell: number) => {
    myClickRef.current = cell;
  };

  return { displayCells: reveal.cells, animating, explosions, noteOwnClick };
}
