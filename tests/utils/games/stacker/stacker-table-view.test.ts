import { describe, expect, it } from 'vitest';
import type { SeatProgress } from '@/lib/games/stacker/match';
import {
  clearBannerColor, garbageMeterPercent, miniCellSize, opponentRows, pickGarbageTarget, stackerMatchKey,
} from '@/utils/games/stacker/stacker-table-view';

const progress = (seat: string): SeatProgress => ({
  seat, alive: true, attacksSent: 0, linesCleared: 0, stackHeight: 0, frame: 0, board: null, verified: null, suspect: null,
} as SeatProgress);

describe('stackerMatchKey', () => {
  it('keys the run per table and seat, spectators apart', () => {
    expect(stackerMatchKey('t1', 'a')).toBe('t1:a');
    expect(stackerMatchKey('t1', null)).toBe('t1:spectator');
  });
});

describe('pickGarbageTarget', () => {
  it('never targets me, and gives up when nobody else is standing', () => {
    expect(pickGarbageTarget(['me'], 'me')).toBeNull();
    expect(pickGarbageTarget([], 'me')).toBeNull();
    expect(pickGarbageTarget(['me', 'b'], 'me')).toBe('b');
  });

  it('spreads garbage over the others by the random draw', () => {
    expect(pickGarbageTarget(['a', 'me', 'b', 'c'], 'me', () => 0)).toBe('a');
    expect(pickGarbageTarget(['a', 'me', 'b', 'c'], 'me', () => 0.5)).toBe('b');
    expect(pickGarbageTarget(['a', 'me', 'b', 'c'], 'me', () => 0.99)).toBe('c');
  });
});

describe('opponentRows', () => {
  it('lists the other seats in order, leaving out those with no progress', () => {
    const rows = opponentRows(['a', 'me', 'b', 'c'], 'me', { a: progress('a'), me: progress('me'), c: progress('c') });
    expect(rows.map((r) => r.seat)).toEqual(['a', 'c']);
    expect(rows[0].progress.seat).toBe('a');
  });

  it('shows a spectator everybody', () => {
    expect(opponentRows(['a', 'b'], null, { a: progress('a'), b: progress('b') })).toHaveLength(2);
  });
});

describe('garbageMeterPercent', () => {
  it('fills a twelfth per line and stops at full', () => {
    expect(garbageMeterPercent(0)).toBe(0);
    expect(garbageMeterPercent(6)).toBe(50);
    expect(garbageMeterPercent(30)).toBe(100);
  });
});

describe('miniCellSize', () => {
  it('is a quarter of the playfield cell, never under four pixels', () => {
    expect(miniCellSize(26)).toBe(7);
    expect(miniCellSize(12)).toBe(4);
    expect(miniCellSize(8)).toBe(4);
  });
});

describe('clearBannerColor', () => {
  it('colours a spin, a quad and a plain clear apart', () => {
    expect(clearBannerColor({ lines: 2, spin: true, attack: 0, at: 0 })).toBe('#a855f7');
    expect(clearBannerColor({ lines: 4, spin: false, attack: 0, at: 0 })).toBe('#22d3ee');
    expect(clearBannerColor({ lines: 1, spin: false, attack: 0, at: 0 })).toBe('#b4f953');
  });
});
