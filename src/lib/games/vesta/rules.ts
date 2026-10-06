/**
 * The rules upstream keeps in its UI guards, enforced here on every client
 * for every move, plus a dry run through upstream's mutator. Used by the
 * definition's `validateAction`.
 */
import {
  applyMove,
  canBuildCity,
  canBuildRoad,
  canBuildSettlement,
  canBuyDevCard,
  getRobbableVertices,
  type GameMove,
  type GameState,
} from 'vesta';
import { seatIndex, toMove, type VestaAction } from './moves';
import { flags } from './sequence';

/**
 * Upstream splits validation from application: `canBuildSettlement` and
 * friends are the rules, and `placeSettlement` just does as it is told. Their
 * hot-seat UI calls the guard before the mutator, so nothing illegal ever
 * reaches it.
 *
 * Over a relay there is no UI in the path - a hostile client calls the mutator
 * directly by publishing the move. So the guards run HERE, on every client,
 * for every move, before it is allowed into the board. Without this you could
 * publish a settlement onto an occupied vertex and every client would agree
 * you own it.
 */
function checkRules(state: GameState, action: VestaAction, idx: number): { ok: boolean; error?: string } {
  const isInitial = state.phase === 'initial_first' || state.phase === 'initial_second';

  switch (action.type) {
    case 'roll-dice': {
      if (isInitial) return { ok: false, error: 'Not in the rolling phase' };
      if (state.rolled) return { ok: false, error: 'Already rolled this turn' };
      return { ok: true };
    }
    case 'end-turn': {
      if (state.phase === 'play' && !state.rolled) return { ok: false, error: 'Roll before ending your turn' };
      if (flags(state).robberPending) return { ok: false, error: 'Move the robber first' };
      return { ok: true };
    }
    case 'place-settlement': {
      const a = action as Extract<GameMove, { type: 'place-settlement' }>;
      if (isInitial && state.setupStep !== 'settlement') {
        return { ok: false, error: 'Place your road first' };
      }
      if (!isInitial && !state.rolled) return { ok: false, error: 'Roll first' };
      const v = canBuildSettlement(state, idx, a.q, a.r, a.corner, isInitial);
      return v.ok ? { ok: true } : { ok: false, error: v.reason };
    }
    case 'place-road': {
      const a = action as Extract<GameMove, { type: 'place-road' }>;
      if (isInitial && state.setupStep !== 'road') {
        return { ok: false, error: 'Place your settlement first' };
      }
      if (!isInitial && !state.rolled) return { ok: false, error: 'Roll first' };
      const v = canBuildRoad(
        state, idx, a.q1, a.r1, a.corner1, a.q2, a.r2, a.corner2,
        isInitial, isInitial ? state.pendingSettlement : null,
      );
      return v.ok ? { ok: true } : { ok: false, error: v.reason };
    }
    case 'place-city': {
      const a = action as Extract<GameMove, { type: 'place-city' }>;
      if (isInitial) return { ok: false, error: 'No cities during setup' };
      if (!state.rolled) return { ok: false, error: 'Roll first' };
      const v = canBuildCity(state, idx, a.q, a.r, a.corner);
      return v.ok ? { ok: true } : { ok: false, error: v.reason };
    }
    case 'buy-dev-card': {
      if (isInitial || !state.rolled) return { ok: false, error: 'Roll first' };
      if (state.devDeck.cards.length === 0) return { ok: false, error: 'The deck is empty' };
      return canBuyDevCard(state, idx) ? { ok: true } : { ok: false, error: 'Not enough resources' };
    }
    case 'move-robber': {
      const a = action as Extract<GameMove, { type: 'move-robber' }>;
      // The robber only moves when something sent it: a seven, or a knight.
      // Upstream enforces this by only opening its robber UI at those moments.
      if (!flags(state).robberPending) return { ok: false, error: 'Nothing has sent the robber' };
      if (a.q === state.board.robber.q && a.r === state.board.robber.r) {
        return { ok: false, error: 'The robber is already there' };
      }
      return { ok: true };
    }
    case 'steal-resource': {
      const a = action as Extract<GameMove, { type: 'steal-resource' }>;
      if (!flags(state).stealPending) return { ok: false, error: 'Move the robber first' };
      const robbable = getRobbableVertices(state, idx, state.board.robber.q, state.board.robber.r);
      if (!robbable.some((v) => v.owner === a.victim)) {
        return { ok: false, error: 'That player is not on the robbed tile' };
      }
      const victim = state.players[a.victim];
      if (!victim || (victim.resources[a.resource as keyof typeof victim.resources] ?? 0) < 1) {
        return { ok: false, error: 'They do not hold that resource' };
      }
      return { ok: true };
    }
    case 'discard-resources': {
      const a = action as Extract<GameMove, { type: 'discard-resources' }>;
      const player = state.players[idx];
      if (!player) return { ok: false, error: 'Unknown player' };
      for (const [res, amount] of Object.entries(a.resources)) {
        if ((player.resources[res as keyof typeof player.resources] ?? 0) < (amount as number)) {
          return { ok: false, error: 'Cannot discard what you do not hold' };
        }
      }
      return { ok: true };
    }
    default:
      // Trades and dev-card plays validate inside `applyMove`, which throws.
      return { ok: true };
  }
}

export function dryRun(
  state: GameState,
  action: VestaAction,
  actorSeat: string,
  participants: string[],
): { ok: boolean; error?: string } {
  const idx = seatIndex(participants, actorSeat);
  if (idx < 0) return { ok: false, error: 'Not seated at this table' };

  const rules = checkRules(state, action, idx);
  if (!rules.ok) return rules;

  // Whatever the guards don't cover, the mutator will complain about.
  try {
    applyMove(state, toMove(action, idx, { entropy: 'validation' }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Illegal move' };
  }
}
