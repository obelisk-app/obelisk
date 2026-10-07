'use client';

import { useMemo, useState } from 'react';
import type { GameState } from 'vesta';
import { getRobbableVertices, computeRates } from 'vesta';
import type { GameSession } from '@/lib/games/session/session';
import { vesta, isRobberPending, isStealPending, type VestaAction } from '@/lib/games/vesta/definition';
import type { PickMode } from '@/components/games/vesta/pick-mode';
import { RESOURCES, type ResourceCounts } from '@/components/games/vesta/resources';

/**
 * Everything the Vesta table derives from the state for the seat acting at
 * this keyboard: whose move it is, what the rules are waiting on (setup
 * placement, the robber, a steal, a discard, a trade), what the board should
 * ask for, and the draft counts for a discard or a trade.
 *
 * `can` is the engine's own `validateAction`, so no control is offered that
 * the reducer would drop.
 */
export function useVestaTurn({
  session,
  state,
  mySeats,
  onAction,
}: {
  session: GameSession;
  state: GameState;
  mySeats: string[];
  onAction: (action: VestaAction, seat: string) => Promise<void>;
}) {
  const [pick, setPick] = useState<PickMode>('none');
  const [stealDone, setStealDone] = useState<string | null>(null);
  const [tradePartner, setTradePartner] = useState<number | 'bank' | null>(null);
  const [give, setGive] = useState<ResourceCounts>({});
  const [take, setTake] = useState<ResourceCounts>({});
  const [discard, setDiscard] = useState<ResourceCounts>({});

  const participants = session.participants;
  const turnSeat = session.currentTurn;
  const turnIdx = turnSeat ? participants.indexOf(turnSeat) : -1;

  // The seat this account is acting as right now: the one on move if we hold
  // it, otherwise our only seat (hot-seat players answering a trade).
  const actingSeat = useMemo(() => {
    if (turnSeat && mySeats.includes(turnSeat)) return turnSeat;
    return mySeats.length === 1 ? mySeats[0] : null;
  }, [turnSeat, mySeats]);

  const actingIdx = actingSeat ? participants.indexOf(actingSeat) : -1;
  const myTurn = !!turnSeat && mySeats.includes(turnSeat);
  const isSetup = state.phase === 'initial_first' || state.phase === 'initial_second';

  const can = (action: VestaAction, seat = actingSeat): boolean => {
    if (!seat) return false;
    return vesta.validateAction(state, action, seat, participants).ok;
  };

  const send = async (action: VestaAction, seat = actingSeat) => {
    if (!seat) return;
    setPick('none');
    await onAction(action, seat);
  };

  // The board asks for what the rules are waiting on, and only falls back to
  // the player's chosen build mode when nothing is outstanding.
  const robberPending = isRobberPending(state) && myTurn;
  const forcedPick: PickMode = isSetup && myTurn
    ? (state.setupStep === 'settlement' ? 'initial-settlement' : 'initial-road')
    : robberPending ? 'robber' : 'none';
  const mode: PickMode = forcedPick !== 'none' ? forcedPick : pick;

  // Who the robber can take from, straight off the board it is standing on.
  const stealVictims = isStealPending(state) && myTurn && actingIdx >= 0
    ? getRobbableVertices(state, actingIdx, state.board.robber.q, state.board.robber.r)
        .map((v) => v.owner)
        .filter((owner, i, arr) => arr.indexOf(owner) === i)
    : [];
  const stealKey = `${state.board.robber.q},${state.board.robber.r}`;
  const showSteal = stealVictims.length > 0 && stealDone !== stealKey;

  const sevenRolled = state.dice !== null && state.dice[0] + state.dice[1] === 7;
  const myHandSize = actingIdx >= 0
    ? RESOURCES.reduce((n, r) => n + (state.players[actingIdx]?.resources[r] ?? 0), 0)
    : 0;
  const mustDiscard = sevenRolled && myHandSize > 7;

  const pendingTrade = state.pendingTrade;
  const iAmTradeTarget = !!pendingTrade && pendingTrade.to === actingIdx;
  const iAmProposer = !!pendingTrade && pendingTrade.from === actingIdx;

  const rates = actingIdx >= 0 ? computeRates(state, actingIdx) : null;

  return {
    participants,
    turnSeat,
    turnIdx,
    actingIdx,
    myTurn,
    isSetup,
    can,
    send,
    pick,
    setPick,
    mode,
    robberPending,
    stealVictims,
    showSteal,
    skipSteal: () => setStealDone(stealKey),
    myHandSize,
    mustDiscard,
    discard,
    setDiscard,
    pendingTrade,
    iAmTradeTarget,
    iAmProposer,
    rates,
    tradePartner,
    setTradePartner,
    give,
    setGive,
    take,
    setTake,
  };
}

export type VestaTurn = ReturnType<typeof useVestaTurn>;
