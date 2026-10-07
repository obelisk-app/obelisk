import { describe, expect, it } from 'vitest';
import {
  decrementCount, incrementCount, roadAction, robberAction, togglePickMode, vertexAction, withCount,
} from '@/utils/games/vesta/vesta-actions';

const spot = { q: 1, r: -1, corner: 2 };
const edge = { q1: 0, r1: 0, corner1: 1, q2: 0, r2: 0, corner2: 2 };

describe('board click actions', () => {
  it('places a city in city mode and a settlement otherwise', () => {
    expect(vertexAction('city', spot)).toEqual({ type: 'place-city', ...spot });
    expect(vertexAction('settlement', spot)).toEqual({ type: 'place-settlement', ...spot });
    expect(vertexAction('initial-settlement', spot)).toEqual({ type: 'place-settlement', ...spot });
  });

  it('builds a road and moves the robber', () => {
    expect(roadAction(edge)).toEqual({ type: 'place-road', ...edge });
    expect(robberAction({ q: 2, r: -1 })).toEqual({ type: 'move-robber', q: 2, r: -1 });
  });
});

describe('togglePickMode', () => {
  it('turns a mode on, switches between modes and turns the active one off', () => {
    expect(togglePickMode('none', 'road')).toBe('road');
    expect(togglePickMode('road', 'city')).toBe('city');
    expect(togglePickMode('city', 'city')).toBe('none');
  });
});

describe('counting', () => {
  it('never goes below zero or above the cap', () => {
    expect(decrementCount(0)).toBe(0);
    expect(decrementCount(3)).toBe(2);
    expect(incrementCount(2, 3)).toBe(3);
    expect(incrementCount(3, 3)).toBe(3);
  });

  it('only steps down from a count already above the cap', () => {
    expect(decrementCount(5)).toBe(4);
    expect(incrementCount(5, 3)).toBe(3);
  });

  it('replaces one resource without touching the others', () => {
    const counts = { brick: 1, ore: 2 };
    expect(withCount(counts, 'ore', 0)).toEqual({ brick: 1, ore: 0 });
    expect(counts).toEqual({ brick: 1, ore: 2 });
  });
});
