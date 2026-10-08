/**
 * The Vesta table's moves as the engine takes them, built from what the
 * player clicked, and the small counting rules behind the table's controls.
 */
import type { HexCoord, TradeResource } from 'vesta';
import type { VestaAction } from '@/lib/games/vesta/definition';
import type { PickMode } from '@/utils/games/vesta/pick-mode';
import type { EdgePick, VertexPick } from '@/utils/games/vesta/board-pick';
import type { ResourceCounts } from '@/utils/games/vesta/resources';
import { RESOURCES } from '@/constants/games/vesta';

/** A click on a corner: a city in city mode, a settlement in every other mode that asks for a corner. */
export function vertexAction(mode: PickMode, spot: VertexPick): VestaAction {
  if (mode === 'city') return { type: 'place-city', ...spot } as VestaAction;
  return { type: 'place-settlement', ...spot } as VestaAction;
}

export function roadAction(edge: EdgePick): VestaAction {
  return { type: 'place-road', ...edge } as VestaAction;
}

export function robberAction(hex: HexCoord): VestaAction {
  return { type: 'move-robber', q: hex.q, r: hex.r } as VestaAction;
}

/** A build mode's toggle: on when it was off (or another was on), off when it was on. */
export function togglePickMode(current: PickMode, mode: PickMode): PickMode {
  return current === mode ? 'none' : mode;
}

/** One less, never below zero. */
export function decrementCount(value: number): number {
  return Math.max(0, value - 1);
}

/**
 * One more while under `max`; at or above it, the count stays. "+" never
 * lowers a count: a draft above its cap is lowered by `clampDraft` when the
 * cap changes, with no press.
 */
export function incrementCount(value: number, max: number): number {
  return value < max ? value + 1 : value;
}

/** The draft counts with one resource's count replaced. */
export function withCount(counts: ResourceCounts, resource: TradeResource, value: number): ResourceCounts {
  return { ...counts, [resource]: value };
}

/**
 * The draft with every count above its cap lowered to the cap (what the hand
 * still holds, for what a seat gives). The same object when nothing is over,
 * so a hook can tell whether the draft needs correcting.
 */
export function clampDraft(draft: ResourceCounts, cap: (resource: TradeResource) => number): ResourceCounts {
  const over = RESOURCES.filter((r) => (draft[r] ?? 0) > Math.max(0, cap(r)));
  if (over.length === 0) return draft;
  const out = { ...draft };
  for (const r of over) out[r] = Math.max(0, cap(r));
  return out;
}
