/**
 * The computed parts of the guide heroes (`src/assets/illustrations/guides/heroes/`):
 * where each orb, arc, key, tile and edge goes. The heroes keep their words
 * and their fixed shapes; what is worked out from data lives here, so a
 * hero's file is the drawing and nothing else (docs/ui/conventions.md#component-files).
 *
 * The arithmetic is the heroes' own, unchanged, so the still frames under
 * `public/og/guides/` render identically (tests/assets/illustrations/guides/snapshots-match.test.tsx).
 */

import { axialCenter, hexCorner, hexPoints, polarPoint, staggerDelay } from './art-geometry';
import { VESTA_R } from '@/constants/guides/hero-art';

/* Chain Reaction */

/** Where a cell's 1, 2 or 3 orbs sit around its centre. */
export function orbOffsets(count: number): Array<[number, number]> {
  if (count <= 1) return [[0, 0]];
  if (count === 2) return [[-8, 0], [8, 0]];
  return [[-8, 6], [8, 6], [0, -8]];
}

export interface ChainCell {
  col: number;
  row: number;
  count: number;
  seat: number;
}

/** Each settled cell's orbs, placed on a grid of `size` squares from (`x0`, `y0`) and coloured by seat. */
export function settledOrbs(cells: readonly ChainCell[], seats: readonly string[], x0: number, y0: number, size: number) {
  return cells.map(({ col, row, count, seat }) => {
    const cx = x0 + col * size + size / 2;
    const cy = y0 + row * size + size / 2;
    return {
      key: `orb-${col}-${row}`,
      orbs: orbOffsets(count).map(([dx, dy]) => ({ cx: cx + dx, cy: cy + dy, fill: seats[seat] })),
    };
  });
}

/* Future relays */

export interface MeshNode {
  cx: number;
  cy: number;
}

/** One line per edge between two nodes, each with its dash stagger. */
export function meshLines(nodes: readonly MeshNode[], edges: ReadonlyArray<[number, number]>) {
  return edges.map(([a, b], i) => ({
    x1: nodes[a].cx,
    y1: nodes[a].cy,
    x2: nodes[b].cx,
    y2: nodes[b].cy,
    delay: staggerDelay(i, 0.25),
  }));
}

/* Run your own relay */

export interface RelayTier {
  r: number;
  n: number;
  opacity: number;
}

/** The three admission arcs around the relay at (`cx`, `cy`), each `span` degrees either side of east. */
export function relayTierArcs(tiers: readonly RelayTier[], cx: number, cy: number, span: number) {
  return tiers.map((tier, i) => {
    const a = polarPoint(cx, cy, tier.r, -span);
    const b = polarPoint(cx, cy, tier.r, span);
    return {
      key: tier.n,
      d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${tier.r} ${tier.r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      strokeWidth: 2.4 - i * 0.5,
      opacity: tier.opacity * 0.85,
      dash: i === 0 ? undefined : i === 1 ? '10 7' : '4 9',
      className: i === 0 ? undefined : 'animate-dash-flow',
      delay: staggerDelay(i, 0.4),
    };
  });
}

/** The admitted keys drawn on each arc: smaller and dimmer the further out. */
export function relayKeyDots(
  rings: ReadonlyArray<{ r: number; angles: readonly number[] }>,
  tiers: ReadonlyArray<{ opacity: number }>,
  cx: number,
  cy: number,
) {
  return rings.flatMap((ring, ri) =>
    ring.angles.map((angle, ki) => {
      const p = polarPoint(cx, cy, ring.r, angle);
      return {
        key: `k${ri}-${ki}`,
        x: p.x,
        y: p.y,
        r: 5.5 - ri * 1.1,
        opacity: tiers[ri].opacity * 0.9,
        delay: `${(ri * 0.5 + ki * 0.17).toFixed(2)}s`,
      };
    }),
  );
}

/* Web of trust */

export interface WotNode {
  id: string;
  x: number;
  y: number;
  trust: number;
}

/** A node's fill: you, close, further, or filtered out. */
export function wotNodeFill(trust: number, primary?: boolean): string {
  if (primary) return '#b4f953';
  if (trust >= 60) return '#8bc34a';
  if (trust >= 30) return '#2d3a1a';
  return '#3a1a1a';
}

/** A node's ring: red for a key the graph filters out. */
export function wotNodeStroke(trust: number): string {
  if (trust < 20) return '#b45353';
  return '#b4f953';
}

/** Each edge between two nodes; one that touches a filtered key is drawn faint, red and dashed. */
export function wotEdges(byId: Readonly<Record<string, WotNode>>, edges: ReadonlyArray<[string, string]>) {
  return edges.map(([a, b], i) => {
    const A = byId[a];
    const B = byId[b];
    const isSpam = B.trust < 20 || A.trust < 20;
    return {
      key: i,
      x1: A.x,
      y1: A.y,
      x2: B.x,
      y2: B.y,
      stroke: isSpam ? '#b45353' : '#b4f953',
      strokeOpacity: isSpam ? 0.25 : 0.45,
      dash: isSpam ? '3 5' : '0',
    };
  });
}

/* Vesta */

const VESTA_CX = 300;
const VESTA_CY = 200;

/** A tile's number is red on the two likeliest rolls. */
function vestaLabelFill(label: string): string {
  return label === '6' || label === '8' ? '#ff4d5e' : '#fafafa';
}

/** The island's tiles at their axial positions, each with its outline and number. */
export function vestaTiles(axial: ReadonlyArray<[number, number]>, resources: ReadonlyArray<{ hex: string; label: string }>) {
  return axial.map(([q, r], i) => {
    const [cx, cy] = axialCenter(q, r, VESTA_R, VESTA_CX, VESTA_CY);
    const res = resources[i];
    return {
      key: `${q}-${r}`,
      cx,
      cy,
      points: hexPoints(cx, cy, VESTA_R - 3),
      fill: res.hex,
      label: res.label,
      labelFill: vestaLabelFill(res.label),
    };
  });
}

/** Two settlements on the centre tile's corners 4 and 5 joined by a road, and a rival's on corner 1. */
export function vestaSettlements() {
  const [cx, cy] = axialCenter(0, 0, VESTA_R, VESTA_CX, VESTA_CY);
  const [ax, ay] = hexCorner(cx, cy, VESTA_R, 4);
  const [bx, by] = hexCorner(cx, cy, VESTA_R, 5);
  const [dx, dy] = hexCorner(cx, cy, VESTA_R, 1);
  return { ax, ay, bx, by, dx, dy };
}
