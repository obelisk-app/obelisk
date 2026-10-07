'use client';

import { useMemo } from 'react';
import {
  chainReactionFixture,
  finishedChainReaction,
  stackerFixture,
  stackerWell,
  vestaFixture,
} from '@/utils/games/shots/fixtures';
import { stillRunner } from '@/utils/games/shots/still-runner';

/** What a board's `onAction` does in a screenshot: nothing. */
const noop = async () => {};

/**
 * The screenshot harness's fixtures, each built once: the three games' boards
 * replayed from fixture logs, a finished Chain Reaction for the results
 * panel, and a still Stacker well. The seat each board plays is the one on
 * move, so the boards draw as the person whose turn it is sees them.
 */
export function useHarness() {
  const cr = useMemo(() => chainReactionFixture(), []);
  const crDone = useMemo(() => finishedChainReaction(), []);
  const vesta = useMemo(() => vestaFixture(), []);
  const stacker = useMemo(() => stackerFixture(), []);
  const still = useMemo(() => stillRunner(stackerWell()), []);
  return {
    cr,
    crSeats: [cr.currentTurn ?? 'seat-ana'],
    crDone,
    vesta,
    vestaSeats: [vesta.currentTurn ?? 'seat-ana'],
    stacker,
    still,
    noop,
  };
}
