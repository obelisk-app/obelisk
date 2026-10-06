/**
 * Turn sequencing Vesta's own client does between calls (setup order, the
 * robber, the win check), done here so every replay reaches the same board.
 * Used by `definition.ts` and `rules.ts`.
 */
import { checkWin, giveStartingResources, nextTurn, type GameMove, type GameState } from 'vesta';
import type { VestaAction } from './moves';

/**
 * Bookkeeping this table keeps on top of upstream's state.
 *
 * Vesta's own client tracks "the robber is waiting to be moved" in the DOM,
 * because it is one browser and one player at a time. We cannot: every client
 * has to reach the same conclusion from the log alone, so the flags live in
 * the state where replay carries them. The key is namespaced, and upstream's
 * reducers preserve unknown fields (they all spread the previous state), so
 * this rides along without touching their rules.
 */
interface ObeliskFlags {
  robberPending?: boolean;
  stealPending?: boolean;
}

type StateWithFlags = GameState & { __obelisk?: ObeliskFlags };

export function flags(state: GameState): ObeliskFlags {
  return (state as StateWithFlags).__obelisk ?? {};
}

function withFlags(state: GameState, next: ObeliskFlags): GameState {
  return { ...state, __obelisk: next } as GameState;
}

/** Is the table waiting for this turn's robber to be placed? */
export function isRobberPending(state: GameState): boolean {
  return flags(state).robberPending === true;
}

/** Has the robber landed, leaving a steal to resolve? */
export function isStealPending(state: GameState): boolean {
  return flags(state).stealPending === true;
}

/**
 * The sequencing upstream keeps in its UI.
 *
 * `applyMove` places a settlement but does not decide that setup now wants a
 * road, hand out second-round starting resources, or pass the turn - Vesta's
 * own client does all of that between calls (see `onVertexClick` /
 * `onEdgeClick` in their web/ui.js). Over a relay there is no shared client to
 * do it, so it happens here, deterministically, on every replay.
 */
export function sequence(next: GameState, before: GameState, action: VestaAction, idx: number): GameState {
  const isSetup = before.phase === 'initial_first' || before.phase === 'initial_second';
  const f = flags(before);

  if (isSetup && action.type === 'place-settlement') {
    const a = action as Extract<GameMove, { type: 'place-settlement' }>;
    // Settlement down, road next - the pending spot is what the road must touch.
    return { ...next, pendingSettlement: { q: a.q, r: a.r, corner: a.corner }, setupStep: 'road' };
  }

  if (isSetup && action.type === 'place-road') {
    let out = next;
    const pending = before.pendingSettlement;
    // Second time around, your settlement pays out immediately.
    if (before.phase === 'initial_second' && pending) {
      out = giveStartingResources(out, idx, pending.q, pending.r, pending.corner);
    }
    out = { ...out, pendingSettlement: null };
    return nextTurn(out);
  }

  if (action.type === 'roll-dice') {
    const total = (next.dice?.[0] ?? 0) + (next.dice?.[1] ?? 0);
    // A seven sends the robber; everything else just produces.
    return withFlags(next, { ...f, robberPending: total === 7, stealPending: false });
  }

  if (action.type === 'play-dev-card' && (action as { cardType?: string }).cardType === 'knight') {
    return declareWinner(withFlags(next, { ...f, robberPending: true, stealPending: false }));
  }

  if (action.type === 'move-robber') {
    return withFlags(next, { ...f, robberPending: false, stealPending: true });
  }

  if (action.type === 'steal-resource') {
    return withFlags(next, { ...f, stealPending: false });
  }

  if (action.type === 'end-turn') {
    return withFlags(next, {});
  }

  return declareWinner(next);
}

/** Ten victory points ends it. Upstream's client checks; so must we. */
export function declareWinner(state: GameState): GameState {
  if (state.winner !== null && state.winner !== undefined) return state;
  const winner = checkWin(state);
  if (winner < 0) return state;
  return { ...state, winner, phase: 'gameover' };
}
