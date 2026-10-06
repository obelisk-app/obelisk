import { getValidPositions, type GameState, type HexCoord } from 'vesta';
import {
  nearestEdge,
  nearestHex,
  nearestVertex,
  type EdgeNode,
  type VertexNode,
} from '@/lib/games/vesta/geometry';
import type { PickMode } from './pick-mode';

const CLICK_THRESHOLD = 26;
const EDGE_CLICK_THRESHOLD = 24;
const HEX_CLICK_THRESHOLD = 44;

export type VertexPick = { q: number; r: number; corner: number };
export type EdgePick = { q1: number; r1: number; corner1: number; q2: number; r2: number; corner2: number };

export type BoardPick =
  | { kind: 'hex'; hex: HexCoord }
  | { kind: 'edge'; edge: EdgePick }
  | { kind: 'vertex'; spot: VertexPick }
  | null;

/**
 * The legal spots for `mode`, straight from upstream's `getValidPositions`,
 * so the highlights are the rules. Empty when nothing is being placed, in
 * robber mode, or if the engine throws on an odd state.
 */
export function validPositionKeys(state: GameState, mode: PickMode): Set<string> {
  if (mode === 'none' || mode === 'robber') return new Set();
  try {
    return new Set(getValidPositions(state, mode).map((p) => p.key));
  } catch {
    return new Set();
  }
}

/**
 * What a click at board coordinates (`x`, `y`, in canvas units) picks, given
 * the mode and the legal spots. Null when it lands on nothing legal.
 */
export function resolveBoardPick(mode: PickMode, x: number, y: number, valid: Set<string>): BoardPick {
  if (mode === 'none') return null;

  if (mode === 'robber') {
    const hex = nearestHex(x, y, HEX_CLICK_THRESHOLD);
    return hex ? { kind: 'hex', hex } : null;
  }

  if (mode === 'road' || mode === 'initial-road') {
    const edge: EdgeNode | null = nearestEdge(x, y, EDGE_CLICK_THRESHOLD);
    if (!edge || !valid.has(edge.key)) return null;
    return {
      kind: 'edge',
      edge: {
        q1: edge.hex.q, r1: edge.hex.r, corner1: edge.hex.c1,
        q2: edge.hex.q, r2: edge.hex.r, corner2: edge.hex.c2,
      },
    };
  }

  const vertex: VertexNode | null = nearestVertex(x, y, CLICK_THRESHOLD);
  if (!vertex || !valid.has(vertex.key)) return null;
  return { kind: 'vertex', spot: vertex.hexes[0] };
}
