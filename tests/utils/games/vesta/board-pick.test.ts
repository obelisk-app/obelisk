import { describe, expect, it } from 'vitest';
import { createGame } from 'vesta';
import { hexCenter, vertices, edges } from '@/lib/games/vesta/geometry';
import { resolveBoardPick, validPositionKeys } from '@/utils/games/vesta/board-pick';

describe('validPositionKeys', () => {
  const state = createGame({ players: 2, roll: 42 });

  it('is empty when nothing is being placed, or for the robber', () => {
    expect(validPositionKeys(state, 'none').size).toBe(0);
    expect(validPositionKeys(state, 'robber').size).toBe(0);
  });

  it('lists the legal first settlements at setup', () => {
    expect(validPositionKeys(state, 'initial-settlement').size).toBeGreaterThan(0);
  });
});

describe('resolveBoardPick', () => {
  const state = createGame({ players: 2, roll: 42 });

  it('picks nothing in mode none', () => {
    expect(resolveBoardPick('none', 0, 0, new Set())).toBeNull();
  });

  it('picks the hex under the click for the robber', () => {
    const tile = state.board.tiles[0];
    const { x, y } = hexCenter(tile.coord);
    const pick = resolveBoardPick('robber', x, y, new Set());
    expect(pick).toEqual({ kind: 'hex', hex: expect.objectContaining({ q: tile.coord.q, r: tile.coord.r }) });
  });

  it('picks a legal vertex and ignores an illegal one', () => {
    const valid = validPositionKeys(state, 'initial-settlement');
    const legal = [...vertices().values()].find((v) => valid.has(v.key))!;
    expect(resolveBoardPick('initial-settlement', legal.x, legal.y, valid)).toEqual({ kind: 'vertex', spot: legal.hexes[0] });
    expect(resolveBoardPick('initial-settlement', legal.x, legal.y, new Set())).toBeNull();
  });

  it('picks a legal edge as a road', () => {
    const edge = [...edges().values()][0];
    const pick = resolveBoardPick('road', (edge.x1 + edge.x2) / 2, (edge.y1 + edge.y2) / 2, new Set([edge.key]));
    expect(pick).toMatchObject({ kind: 'edge' });
  });
});
