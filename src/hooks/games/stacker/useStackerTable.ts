'use client';

import { useCallback, useMemo, useState } from 'react';
import type { GameSession } from '@/lib/games/session/session';
import { incomingFor, type MatchState } from '@/lib/games/stacker/match';
import { useStackerLoop } from '@/hooks/games/stacker/useStackerLoop';
import { useStackerCellSize } from '@/hooks/games/stacker/useStackerCellSize';
import { useTrackTitle } from '@/hooks/games/stacker/useTrackTitle';
import {
  clearBannerColor, garbageMeterPercent, miniCellSize, opponentRows, pickGarbageTarget, stackerMatchKey,
} from '@/utils/games/stacker/stacker-table-view';

/** A checkpoint as the table publishes it for one seat. */
export interface StackerCheckpoint {
  frame: number;
  attacksSent: number;
  linesCleared: number;
  stackHeight: number;
  inputs?: string;
  board: string;
}

export interface StackerTableInput {
  session: GameSession;
  match: MatchState;
  /** Seats this client plays. One board per person, so one seat. */
  mySeats: string[];
  onAttack: (seat: string, target: string, lines: number, hole: number, nonce: number) => void;
  onCheckpoint: (seat: string, payload: StackerCheckpoint) => void;
  onTopOut: (seat: string) => void;
  /** Fullscreen gives the board the whole viewport. */
  fullscreen?: boolean;
}

/**
 * The Stacker table's view model: this client's seat, the local run (wired
 * to publish attacks, checkpoints and the top-out for that seat), the
 * opponents strip, the key panel toggle and the sizes the table draws at.
 */
export function useStackerTable({ session, match, mySeats, onAttack, onCheckpoint, onTopOut, fullscreen }: StackerTableInput) {
  const mySeat = mySeats[0] ?? null;
  const alive = match.alive;
  const iAmAlive = !!mySeat && alive.includes(mySeat);

  const incoming = useMemo(
    () => (mySeat ? incomingFor(match, mySeat) : []),
    [match, mySeat],
  );

  const { runner, stats, prefs, toggleMuted, reloadKeys } = useStackerLoop({
    seed: match.seed,
    matchKey: stackerMatchKey(session.id, mySeat),
    matchOver: match.over,
    incoming,
    enabled: iAmAlive && !match.over,
    onAttack: useCallback((lines: number, hole: number, nonce: number) => {
      if (!mySeat) return;
      const target = pickGarbageTarget(alive, mySeat);
      if (!target) return;
      onAttack(mySeat, target, lines, hole, nonce);
    }, [mySeat, alive, onAttack]),
    onCheckpoint: useCallback((payload: StackerCheckpoint) => {
      if (mySeat) onCheckpoint(mySeat, payload);
    }, [mySeat, onCheckpoint]),
    onTopOut: useCallback(() => {
      if (mySeat) onTopOut(mySeat);
    }, [mySeat, onTopOut]),
  });

  const [keysOpen, setKeysOpen] = useState(false);
  // The credit line follows whatever the playlist moved on to.
  const track = useTrackTitle();
  const cell = useStackerCellSize(fullscreen);

  return {
    runner,
    stats,
    muted: prefs.muted,
    toggleMuted,
    track,
    cell,
    miniCell: miniCellSize(cell),
    meterPercent: garbageMeterPercent(stats.incoming),
    banner: stats.lastClear,
    bannerColor: stats.lastClear ? clearBannerColor(stats.lastClear) : undefined,
    iAmAlive,
    dimmed: !iAmAlive || match.over,
    showDead: stats.dead || !iAmAlive,
    hasOpponents: session.participants.some((s) => s !== mySeat),
    opponents: opponentRows(session.participants, mySeat, match.progress),
    keysOpen,
    openKeys: () => setKeysOpen(true),
    /** Closing the panel reloads the bindings, so new keys apply at once. */
    closeKeys: () => {
      setKeysOpen(false);
      reloadKeys();
    },
  };
}

export type StackerTableModel = ReturnType<typeof useStackerTable>;
