import { describe, expect, it } from 'vitest';
import { Table, mulberry32 } from '@/utils/games/shots/fixture-table';

const SEATS = [
  { id: 'seat-a', by: 'pk-a', label: 'A' },
  { id: 'seat-b', by: 'pk-b', label: 'B' },
];

describe('mulberry32', () => {
  it('is reproducible for a seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const run = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(run);
    expect(run.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(run[0]);
  });
});

describe('Table', () => {
  it('derives a started session from its own create/join/start log', () => {
    const session = new Table('chain-reaction', SEATS, { size: 'medium' }, 45).session();
    expect(session.game).toBe('chain-reaction');
    expect(session.status).toBe('in_progress');
    expect(session.participants).toHaveLength(2);
    expect(session.currentTurn).toBe('seat-a');
  });

  it('publishes a move as the seat on move, and the replayed session advances', () => {
    const table = new Table('chain-reaction', SEATS, { size: 'medium' }, 45);
    const before = table.session();
    const after = table.move({ cell: 0 });
    expect(after.turnIndex).toBe(before.turnIndex + 1);
    expect(after.currentTurn).toBe('seat-b');
  });
});
